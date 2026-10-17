import { beforeEach, describe, expect, it, vi } from "vitest";
import { WORKSPACE_ID, currentSnapshot } from "@/test/atlas-mcp-fixtures";

const loaders = vi.hoisted(() => ({
  loadFromDb: vi.fn(),
  loadHistoryFromDb: vi.fn(),
  loadWorkspaceScopes: vi.fn(),
  readLatestItemRelationsEvidence: vi.fn(),
}));

vi.mock("@/atlas/backend", () => ({
  loadFromDb: loaders.loadFromDb,
  loadHistoryFromDb: loaders.loadHistoryFromDb,
}));
vi.mock("@/atlas/workspace-scope", () => ({
  loadWorkspaceScopes: loaders.loadWorkspaceScopes,
}));
vi.mock("@/atlas/item-relations-evidence-store", () => ({
  readLatestItemRelationsEvidence: loaders.readLatestItemRelationsEvidence,
}));

import { createRayfinAtlasMcpDataSource } from "./rayfin-data-source";

describe("Rayfin-backed Atlas MCP source", () => {
  beforeEach(() => {
    for (const loader of Object.values(loaders)) loader.mockReset();
  });

  it("reads the same validated, non-preview evidence as the deployed UI", async () => {
    const requireSession = vi.fn(async () => undefined);
    const source = createRayfinAtlasMcpDataSource({ requireSession });
    const data = currentSnapshot();
    loaders.loadWorkspaceScopes.mockResolvedValue([]);
    loaders.loadFromDb.mockResolvedValue(data);
    loaders.loadHistoryFromDb.mockResolvedValue({ snapshots: [] });
    loaders.readLatestItemRelationsEvidence.mockResolvedValue(null);

    await source.requireSession();
    await source.loadWorkspaceScope();
    await expect(source.loadSnapshot(WORKSPACE_ID)).resolves.toBe(data);
    await source.loadHistory(WORKSPACE_ID, data);
    await source.loadItemRelationsEvidence(WORKSPACE_ID);

    expect(requireSession).toHaveBeenCalledTimes(1);
    expect(loaders.loadWorkspaceScopes).toHaveBeenCalledWith(false);
    expect(loaders.loadFromDb).toHaveBeenCalledWith(false, WORKSPACE_ID);
    expect(loaders.loadHistoryFromDb).toHaveBeenCalledWith(false, data, 2, WORKSPACE_ID);
    expect(loaders.readLatestItemRelationsEvidence).toHaveBeenCalledWith(WORKSPACE_ID);
  });

  it("exposes only read operations", () => {
    const source = createRayfinAtlasMcpDataSource({ requireSession: async () => undefined });
    expect(Object.keys(source).sort()).toEqual([
      "loadHistory",
      "loadIncidentRecords",
      "loadItemRelationsEvidence",
      "loadPolicyEvidence",
      "loadSnapshot",
      "loadWorkspaceScope",
      "requireSession",
    ]);
  });
});
