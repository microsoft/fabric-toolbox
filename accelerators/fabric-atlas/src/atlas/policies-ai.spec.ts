import { describe, expect, it } from "vitest";
import { buildAiGovernanceInventory, compareAgentSourceSelections } from "./policies-ai";
import { snapshotFromData } from "./history";
import type { AtlasData } from "./model";
import type { DataAgentMetadata } from "./item-metadata";

const W = "workspace-id";
const AGENT = "agent-id";
function metadata(elementId = "column-id", name = "Column"): DataAgentMetadata {
  const element = {
    id: elementId, displayName: name, elementType: "lakehouse_tables.column", sourceArtifactId: "source-id",
    parentId: "table-id", parentName: "Table", parentPath: ["Table"], selected: true, children: [],
  };
  return {
    kind: "dataAgent",
    sources: [{
      artifactId: "source-id", workspaceId: W, displayName: "Source", sourceType: "Lakehouse",
      elements: [element],
      selectedElements: [element],
    }],
  };
}
function data(id = "current", definition: DataAgentMetadata | null = metadata()): AtlasData {
  return {
    workspace: {
      fabricId: W, snapshotId: id, displayName: "Workspace", capacity: "F2", region: "West Europe",
      syncedAt: id === "previous" ? "2026-10-01T12:00:00Z" : "2026-10-02T12:00:00Z",
      syncSections: { definitions: { status: "complete" }, lineage: { status: "complete" } },
      deploymentId: "same-projection-deployment",
    },
    items: [
      { fabricId: AGENT, displayName: "Agent", itemType: "DataAgent", health: "healthy", endorsement: "none", tags: [] },
      { fabricId: "source-id", displayName: "Source", itemType: "Lakehouse", health: "healthy", endorsement: "certified",
        endorsementMetadataAvailable: true, sensitivityMetadataAvailable: true, ownerName: "Recorded owner", tags: [] },
      { fabricId: "unrelated", displayName: "Agent", itemType: "Warehouse", health: "healthy", endorsement: "none", tags: [] },
    ],
    itemMetadata: definition ? { [AGENT]: definition } : {},
    edges: [], principals: [], grants: [], jobs: [], config: [], comments: [], syncRuns: [],
  };
}
describe("Policies & AI evidence", () => {
  it("uses actual families and source IDs, never matching names or inventing exposure", () => {
    const rows = buildAiGovernanceInventory(data());
    expect(rows.map((row) => row.item.fabricId)).toEqual([AGENT, "source-id"]);
    expect(rows.every((row) => row.exposure === "unknown")).toBe(true);
    expect(rows.find((row) => row.item.fabricId === "source-id")).toMatchObject({
      owner: "Recorded owner", endorsement: "certified", sensitivity: "No label recorded",
    });
    const agent = rows.find((row) => row.item.fabricId === AGENT)!;
    expect(agent.selections).toBe("observed");
    expect(agent.owner).toBe("Unknown");
    expect(agent.snapshotId).toBe("current");
    expect(agent.catalogCollectedAt).toBe("2026-10-02T12:00:00Z");
    expect(agent.provenance).toContain("Normalized Data Agent definition");
  });

  it("distinguishes missing source metadata from observed empty selections without claiming not exposed", () => {
    const missing = buildAiGovernanceInventory(data("current", null))[0];
    const empty = buildAiGovernanceInventory(data("current", { kind: "dataAgent", sources: [] }))[0];
    expect(missing.selections).toBe("unavailable");
    expect(empty.selections).toBe("observed-empty");
    expect(missing.exposure).toBe("unknown");
    expect(empty.exposure).toBe("unknown");
  });

  it("does not treat failed metadata collection or an empty lineage list as an AI protection result", () => {
    const current = data();
    current.workspace.syncSections = { definitions: { status: "failed" }, lineage: { status: "unsupported" } };
    const rows = buildAiGovernanceInventory(current);
    expect(rows[0].lineage).toBe("Not collected");
    expect(rows[0].endorsement).toBe("Unknown");
    expect(rows[0].sensitivity).toBe("Not collected");
    expect(rows[0].exposure).toBe("unknown");
  });

  it("compares only two published, complete, same-workspace definition snapshots", () => {
    const before = snapshotFromData(data("previous", metadata("old-id")));
    const after = snapshotFromData(data("current", metadata("new-id")));
    const result = compareAgentSourceSelections(before, after);
    expect(result.state).toBe("ready");
    expect(result.differences.map((change) => change.type).sort()).toEqual(["selection-added", "selection-removed"]);
    expect(result.differences.every((change) => change.sourceId === "source-id" && change.agentId === AGENT)).toBe(true);
    if (result.state === "ready") {
      expect(result.previousSnapshotId).toBe("previous");
      expect(result.currentSnapshotId).toBe("current");
      expect(result.currentCollectedAt).toBe("2026-10-02T12:00:00Z");
    }
  });

  it("does not report renames as selection changes when IDs and parent IDs remain stable", () => {
    const before = snapshotFromData(data("previous", metadata("stable-id", "Old name")));
    const next = metadata("stable-id", "New name");
    next.sources[0].displayName = "Source renamed";
    next.sources[0].selectedElements[0].parentName = "Table renamed";
    next.sources[0].selectedElements[0].parentPath = ["Table renamed"];
    expect(compareAgentSourceSelections(before, snapshotFromData(data("current", next))).differences).toEqual([]);
  });

  it("does not manufacture removals from missing, partial, failed or identity-incomplete history", () => {
    const before = snapshotFromData(data("previous"));
    expect(compareAgentSourceSelections(undefined, before).state).toBe("unavailable");
    const incomplete = data();
    incomplete.workspace.syncSections = undefined;
    expect(compareAgentSourceSelections(before, snapshotFromData(incomplete)).state).toBe("unavailable");
    const missing = compareAgentSourceSelections(before, snapshotFromData(data("current", null)));
    expect(missing.differences).toEqual([]);
    expect(missing.unavailableAgents).toEqual([AGENT]);
    const unstable = metadata();
    unstable.sources[0].selectedElements[0].parentId = undefined;
    const identity = compareAgentSourceSelections(before, snapshotFromData(data("current", unstable)));
    expect(identity.differences).toEqual([]);
    expect(identity.unavailableAgents).toEqual([AGENT]);
  });

  it("rejects cross-workspace, reversed, unpublished and changed-deployment comparisons", () => {
    const before = snapshotFromData(data("previous"));
    const after = snapshotFromData(data());
    expect(compareAgentSourceSelections(after, before).state).toBe("unavailable");
    expect(compareAgentSourceSelections(before, { ...after, catalog: {
      ...after.catalog, workspace: { ...after.catalog.workspace, fabricId: "different" },
    } }).state).toBe("unavailable");
    expect(compareAgentSourceSelections(before, { ...after, catalog: {
      ...after.catalog, workspace: { ...after.catalog.workspace, snapshotId: undefined },
    } }).state).toBe("unavailable");
    expect(compareAgentSourceSelections(before, { ...after, catalog: {
      ...after.catalog, workspace: { ...after.catalog.workspace, deploymentId: "changed" },
    } }).state).toBe("unavailable");
  });

  it("can report source references removed from complete projections but never source access revoked", () => {
    const result = compareAgentSourceSelections(
      snapshotFromData(data("previous")), snapshotFromData(data("current", { kind: "dataAgent", sources: [] })),
    );
    expect(result.differences.map((change) => change.type)).toEqual(["source-removed"]);
    expect(JSON.stringify(result)).not.toMatch(/revoked|not.exposed|compliant|AI.safe/i);
  });
});
