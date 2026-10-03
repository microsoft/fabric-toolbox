import { describe, expect, it } from "vitest";
import type { SyncRun } from "./model";
import type { WorkspaceScope } from "./workspace-scope";
import {
  formatRunDuration,
  recentRunRows,
  runDayLabel,
  scopeWorkspaceRows,
  SYNC_BACKEND_CAPABILITIES,
} from "./workspace-sync";

const ACTIVE = "6bf4c521-7412-4e6b-8867-68253bbfb18a";
const OTHER = "9a2a1b5e-58e3-4c43-9a8f-1f7c6f3f2a10";

const scopes: WorkspaceScope[] = [
  { id: ACTIVE, displayName: "Active workspace", persisted: true },
  { id: OTHER, displayName: "Second workspace", persisted: true },
];

describe("workspace synchronization projection", () => {
  it("keeps background and scheduled runs closed until the backend cutover", () => {
    expect(SYNC_BACKEND_CAPABILITIES.backgroundRuns.available).toBe(false);
    expect(SYNC_BACKEND_CAPABILITIES.scheduledRuns.available).toBe(false);
    expect(SYNC_BACKEND_CAPABILITIES.scheduledRuns.reason).toMatch(
      /no documented timer or unattended trigger/,
    );
  });

  it("reports only the active workspace from live store state", () => {
    const running = scopeWorkspaceRows({
      scopes,
      activeWorkspaceId: ACTIVE,
      syncing: true,
      syncProgress: 34.6,
      lastSyncedAt: "2026-10-02T10:00:00.000Z",
    });

    expect(running[0]).toMatchObject({
      active: true,
      status: { kind: "running", phase: "Collecting", progress: 35 },
    });
    expect(running[1]).toMatchObject({
      active: false,
      status: { kind: "inactive" },
    });
  });

  it("distinguishes failed, published and unsynchronized active workspaces", () => {
    const base = {
      scopes,
      activeWorkspaceId: ACTIVE,
      syncing: false,
      syncProgress: 0,
    };

    expect(
      scopeWorkspaceRows({
        ...base,
        syncError: "Fabric returned 403",
        lastSyncedAt: "2026-10-02T10:00:00.000Z",
      })[0].status,
    ).toEqual({
      kind: "failed",
      message: "Fabric returned 403",
      snapshotAt: "2026-10-02T10:00:00.000Z",
    });
    expect(
      scopeWorkspaceRows({
        ...base,
        lastSyncedAt: "2026-10-02T10:00:00.000Z",
      })[0].status,
    ).toEqual({ kind: "snapshot", snapshotAt: "2026-10-02T10:00:00.000Z" });
    expect(scopeWorkspaceRows(base)[0].status).toEqual({
      kind: "unsynchronized",
    });
  });

  it("projects queued, running, synchronized, failed and cancelled batch members", () => {
    const third = "5c0e3f74-0f2f-4b5c-a7f2-2f4c8f7d9e11";
    const rows = scopeWorkspaceRows({
      scopes: [
        ...scopes,
        { id: third, displayName: "Third workspace", persisted: true },
      ],
      activeWorkspaceId: ACTIVE,
      syncing: true,
      syncProgress: 64,
      syncWorkspaceId: OTHER,
      lastSyncedAt: "2026-10-02T10:00:00.000Z",
      syncQueue: [
        { workspaceId: ACTIVE, status: "completed", finishedAt: "2026-10-02T11:00:00.000Z" },
        { workspaceId: OTHER, status: "running" },
        { workspaceId: third, status: "queued" },
      ],
    });

    expect(rows.map((row) => row.status.kind)).toEqual([
      "snapshot",
      "running",
      "queued",
    ]);
    expect(rows[1].status).toEqual({
      kind: "running",
      phase: "Validating",
      progress: 64,
    });

    const finished = scopeWorkspaceRows({
      scopes: [
        ...scopes,
        { id: third, displayName: "Third workspace", persisted: true },
      ],
      activeWorkspaceId: ACTIVE,
      syncing: false,
      syncProgress: 0,
      lastSyncedAt: "2026-10-02T10:00:00.000Z",
      syncQueue: [
        { workspaceId: ACTIVE, status: "completed", finishedAt: "2026-10-02T11:00:00.000Z" },
        { workspaceId: OTHER, status: "failed", error: "Fabric returned HTTP 403." },
        { workspaceId: third, status: "cancelled" },
      ],
    });
    expect(finished.map((row) => row.status)).toEqual([
      { kind: "snapshot", snapshotAt: "2026-10-02T10:00:00.000Z" },
      { kind: "failed", message: "Fabric returned HTTP 403." },
      { kind: "cancelled" },
    ]);

    const synchronized = scopeWorkspaceRows({
      scopes,
      activeWorkspaceId: ACTIVE,
      syncing: false,
      syncProgress: 0,
      syncQueue: [
        { workspaceId: OTHER, status: "completed", finishedAt: "2026-10-02T11:00:00.000Z" },
      ],
    });
    expect(synchronized[1].status).toEqual({
      kind: "synchronized",
      finishedAt: "2026-10-02T11:00:00.000Z",
    });
  });

  it("orders persisted runs and the live browser run newest first", () => {
    const runs: SyncRun[] = [
      {
        id: "older",
        startedAt: "2026-10-01T06:00:00.000Z",
        finishedAt: "2026-10-01T06:03:36.000Z",
        status: "completed",
        triggeredBy: "Synchronizer",
      },
      {
        id: "failed",
        startedAt: "2026-10-02T06:00:00.000Z",
        status: "failed",
        durationMs: 42_000,
        failureMessage: "Snapshot publication failed.",
      },
      {
        id: "stale",
        startedAt: "2026-10-02T07:00:00.000Z",
        status: "running",
      },
      { id: "invalid", startedAt: "not a date", status: "completed" },
    ];

    const liveStartedAt = Date.parse("2026-10-02T08:00:00.000Z");
    const rows = recentRunRows({
      runs,
      workspaceName: "Active workspace",
      live: {
        startedAt: liveStartedAt,
        triggeredBy: "Synchronizer",
      },
    });

    expect(rows.map((row) => [row.id, row.result])).toEqual([
      [`live-${liveStartedAt}`, "running"],
      ["stale", "unfinished"],
      ["failed", "failed"],
      ["older", "completed"],
    ]);
    expect(rows[0].live).toBe(true);
    expect(rows[1].durationMs).toBeUndefined();
    expect(rows[2]).toMatchObject({
      durationMs: 42_000,
      failureMessage: "Snapshot publication failed.",
    });
    expect(rows[3].durationMs).toBe(216_000);
  });

  it("formats durations and relative run days", () => {
    expect(formatRunDuration(undefined)).toBe("Not recorded");
    expect(formatRunDuration(400)).toBe("<1s");
    expect(formatRunDuration(42_000)).toBe("42s");
    expect(formatRunDuration(222_000)).toBe("3m 42s");
    expect(formatRunDuration(3_900_000)).toBe("1h 05m");

    const now = new Date(2026, 9, 2, 14, 30);
    expect(runDayLabel(new Date(2026, 9, 2, 6, 0).toISOString(), now)).toBe(
      "Today",
    );
    expect(runDayLabel(new Date(2026, 9, 1, 6, 0).toISOString(), now)).toBe(
      "Yesterday",
    );
    expect(runDayLabel("not a date", now)).toBe("Unknown date");
  });
});
