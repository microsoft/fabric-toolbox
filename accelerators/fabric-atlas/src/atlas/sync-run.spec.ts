import { describe, expect, it } from "vitest";
import { CANCELLING_STAGE } from "./synchronization-progress";
import { syncRunView, type SyncRunInput } from "./sync-run";

const MAIN = "6bf4c521-7412-4e6b-8867-68253bbfb18a";
const ORACLE = "972b74f8-d654-4115-8bc5-b45dba38b153";

function input(overrides: Partial<SyncRunInput> = {}): SyncRunInput {
  return {
    syncing: false,
    syncProgress: 0,
    syncStage: "Ready to sync",
    syncQueue: [],
    workspaceScopes: [
      { id: MAIN, displayName: "FGI-MAIN" },
      { id: ORACLE, displayName: "FGI-ORACLE" },
    ],
    activeWorkspaceId: MAIN,
    lastSyncedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    ...overrides,
  };
}

describe("syncRunView", () => {
  it("describes a single running workspace with its live stage and phase", () => {
    const view = syncRunView(
      input({ syncing: true, syncProgress: 88, syncStage: "Writing jobs and lineage", syncWorkspaceId: MAIN }),
    );

    expect(view).toMatchObject({
      kind: "running",
      progress: 88,
      phaseLabel: "Publish",
      workspaceName: "FGI-MAIN",
      compactLabel: "Writing jobs and lineage · 88%",
    });
    expect(view.position).toBeUndefined();
  });

  it("names the workspace and batch position while syncing several workspaces", () => {
    const view = syncRunView(
      input({
        syncing: true,
        syncProgress: 34,
        syncStage: "Discovering Lakehouse metadata (2/5)",
        syncWorkspaceId: ORACLE,
        syncQueue: [
          { workspaceId: MAIN, status: "completed" },
          { workspaceId: ORACLE, status: "running" },
        ],
      }),
    );

    expect(view.position).toEqual({ index: 2, total: 2 });
    expect(view.compactLabel).toBe(
      "2 of 2 · FGI-ORACLE · Discovering Lakehouse metadata (2/5) · 34%",
    );
  });

  it("reports cancellation as its own state", () => {
    const view = syncRunView(
      input({ syncing: true, syncStage: CANCELLING_STAGE, syncWorkspaceId: MAIN }),
    );

    expect(view.kind).toBe("cancelling");
    expect(view.compactLabel).toBe("Cancelling synchronization");
  });

  it("keeps the full error of the active workspace and of batch failures", () => {
    const longError = `Synchronization failed before snapshot publication. ${"x".repeat(400)}`;
    expect(syncRunView(input({ syncError: longError }))).toMatchObject({
      kind: "failed",
      compactLabel: "Sync failed",
      failures: [{ workspaceId: MAIN, workspaceName: "FGI-MAIN", message: longError }],
    });

    const batch = syncRunView(
      input({
        syncError: "Fabric returned HTTP 403.",
        syncQueue: [
          { workspaceId: MAIN, status: "failed", error: "Fabric returned HTTP 403." },
          { workspaceId: ORACLE, status: "failed", error: "Timed out." },
        ],
      }),
    );
    expect(batch.compactLabel).toBe("2 workspaces failed to sync");
    expect(batch.failures.map((failure) => failure.workspaceName)).toEqual([
      "FGI-MAIN",
      "FGI-ORACLE",
    ]);
  });

  it("names the failing workspace when it is not the one being viewed", () => {
    const view = syncRunView(
      input({
        syncQueue: [
          { workspaceId: MAIN, status: "completed" },
          { workspaceId: ORACLE, status: "failed", error: "Invalid UDF endpoint." },
        ],
      }),
    );
    expect(view.compactLabel).toBe("FGI-ORACLE sync failed");
    expect(view.failures).toEqual([
      { workspaceId: ORACLE, workspaceName: "FGI-ORACLE", message: "Invalid UDF endpoint." },
    ]);
  });

  it("returns to the last synchronization time when idle", () => {
    expect(syncRunView(input()).compactLabel).toBe("synced 5m ago");
    expect(syncRunView(input({ lastSyncedAt: undefined })).compactLabel).toBe(
      "not synchronized",
    );
  });
});
