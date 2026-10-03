import { describe, expect, it, vi } from "vitest";
import {
  SNAPSHOT_ID,
  WORKSPACE_ID,
  currentSnapshot,
  fakeSource,
} from "../../test/atlas-mcp-fixtures";
import { withSnapshotCache } from "./data-source";

describe("snapshot cache", () => {
  it("never caches the session check and reuses evidence within the TTL", async () => {
    const { source, calls } = fakeSource();
    let clock = 0;
    const cached = withSnapshotCache(source, { ttlMs: 1_000, now: () => clock });

    await cached.requireSession();
    await cached.loadSnapshot(WORKSPACE_ID);
    await cached.requireSession();
    await cached.loadSnapshot(WORKSPACE_ID);
    expect(calls).toEqual([
      "requireSession",
      `loadSnapshot:${WORKSPACE_ID}`,
      "requireSession",
    ]);

    clock = 1_000;
    await cached.loadSnapshot(WORKSPACE_ID);
    expect(calls.filter((call) => call.startsWith("loadSnapshot"))).toHaveLength(2);
  });

  it("evicts failed loads so the next call retries", async () => {
    const { source } = fakeSource();
    const loadWorkspaceScope = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([]);
    const cached = withSnapshotCache({ ...source, loadWorkspaceScope });

    await expect(cached.loadWorkspaceScope()).rejects.toThrow("offline");
    await expect(cached.loadWorkspaceScope()).resolves.toEqual([]);
    expect(loadWorkspaceScope).toHaveBeenCalledTimes(2);
  });

  it("keys history by snapshot and bounds the number of cached entries", async () => {
    const { source, calls } = fakeSource();
    const cached = withSnapshotCache(source, { maxEntries: 1 });
    const current = currentSnapshot();

    await cached.loadHistory(WORKSPACE_ID, current);
    await cached.loadHistory(WORKSPACE_ID, current);
    const newer = currentSnapshot();
    newer.workspace.snapshotId = "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f";
    await cached.loadHistory(WORKSPACE_ID, newer);
    await cached.loadHistory(WORKSPACE_ID, current);

    expect(calls.filter((call) => call.startsWith("loadHistory"))).toHaveLength(3);
    expect(current.workspace.snapshotId).toBe(SNAPSHOT_ID);
  });
});
