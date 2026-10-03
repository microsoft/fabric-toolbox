import { describe, expect, it } from "vitest";
import {
  createItemRelationsEvidence,
  itemRelationsNodeKey,
  recordItemRelationsResponse,
  type ItemRelationsDirection,
} from "./item-relations-evidence";
import { snapshotFromData } from "./history";
import {
  buildLineageEvidence,
  buildPreviewOverlay,
  layoutPreviewGraph,
  lineageChangesBetween,
  relationshipMatches,
} from "./lineage-evidence";
import type { AtlasData, Edge, Item } from "./model";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const EXTERNAL_WORKSPACE = "22222222-2222-4222-8222-222222222222";
const LAKEHOUSE = "aaaaaaaa-0000-4000-8000-000000000001";
const MODEL = "aaaaaaaa-0000-4000-8000-000000000002";
const REPORT = "aaaaaaaa-0000-4000-8000-000000000003";
const PIPELINE = "aaaaaaaa-0000-4000-8000-000000000004";
const NOTEBOOK = "aaaaaaaa-0000-4000-8000-000000000005";
const WAREHOUSE = "aaaaaaaa-0000-4000-8000-000000000006";
const EXTERNAL = "bbbbbbbb-0000-4000-8000-000000000001";
const OBSERVED = "2026-10-01T08:00:00.000Z";

function item(fabricId: string, itemType: Item["itemType"], displayName: string): Item {
  return {
    fabricId,
    itemType,
    displayName,
    health: "healthy",
    endorsement: "none",
    tags: [],
  };
}

const items: Item[] = [
  item(LAKEHOUSE, "Lakehouse", "Sales lakehouse"),
  item(MODEL, "SemanticModel", "Sales model"),
  item(REPORT, "Report", "Sales report"),
  item(PIPELINE, "DataPipeline", "Daily load"),
  item(NOTEBOOK, "Notebook", "Transform"),
  item(WAREHOUSE, "Warehouse", "Finance warehouse"),
];

const edges: Edge[] = [
  { source: LAKEHOUSE, target: MODEL, relation: "Direct Lake" },
  // Stored reversed on purpose: normalization must restore source to consumer.
  { source: REPORT, target: MODEL, relation: "binds" },
  { source: PIPELINE, target: NOTEBOOK, relation: "orchestrates" },
  { source: NOTEBOOK, target: WAREHOUSE, relation: "writes" },
];

function query(
  itemId: string,
  direction: ItemRelationsDirection,
  payload: unknown,
) {
  return recordItemRelationsResponse(itemId, direction, OBSERVED, payload);
}

function evidence() {
  return createItemRelationsEvidence(WORKSPACE, OBSERVED, [
    query(MODEL, "upstream", {
      items: [
        { id: LAKEHOUSE, workspaceId: WORKSPACE, type: "Lakehouse", displayName: "Sales lakehouse" },
        { id: EXTERNAL, workspaceId: EXTERNAL_WORKSPACE, type: "Lakehouse", displayName: "Shared lakehouse" },
      ],
      relations: [
        // Datasource draws dependency -> dependent: Sales model -> Sales lakehouse.
        { itemId: LAKEHOUSE, dependentOnItemId: MODEL, relationType: "Datasource" },
        { itemId: MODEL, dependentOnItemId: EXTERNAL, relationType: "Shortcut" },
        { itemId: MODEL, dependentOnItemId: REPORT, relationType: "FutureRelation" },
      ],
      workspaces: [{ id: EXTERNAL_WORKSPACE, displayName: "Shared data" }],
    }),
    query(PIPELINE, "downstream", {
      items: [
        { id: NOTEBOOK, workspaceId: WORKSPACE, type: "Notebook", displayName: "Transform" },
        { id: WAREHOUSE, workspaceId: WORKSPACE, type: "Warehouse", displayName: "Finance warehouse" },
      ],
      relations: [
        { itemId: PIPELINE, dependentOnItemId: NOTEBOOK, relationType: "Orchestration" },
        { itemId: WAREHOUSE, dependentOnItemId: LAKEHOUSE, relationType: "Shortcut" },
        { itemId: NOTEBOOK, dependentOnItemId: PIPELINE, relationType: "HiddenInWorkspace" },
      ],
      workspaces: [],
    }),
  ]);
}

describe("unified lineage evidence", () => {
  it("lays out normalized Preview directions left-to-right, including reversed API evidence and external sources", () => {
    const model = buildLineageEvidence({ items, edges, workspaceId: WORKSPACE, evidence: evidence() });
    const overlay = buildPreviewOverlay(model, WORKSPACE, {
      visibleItemIds: new Set(items.map((entry) => entry.fabricId)),
      laneX: 0, nodeWidth: 220, rowGap: 100, top: 46,
    });
    const layout = layoutPreviewGraph(items, overlay, WORKSPACE, { nodeWidth: 220, nodeHeight: 76, columnGap: 292, rowGap: 100 });
    const position = (key: string) => layout.positions.get(
      key.startsWith(`${WORKSPACE}:`) ? key.slice(WORKSPACE.length + 1) : key,
    )!;
    for (const edge of overlay.edges) {
      expect(position(edge.sourceKey).x + 220).toBeLessThan(position(edge.targetKey).x);
    }
    expect(layout.positions.get(MODEL)!.x).toBeLessThan(layout.positions.get(LAKEHOUSE)!.x);
    expect(layout.positions).toEqual(layoutPreviewGraph([...items].reverse(), overlay, WORKSPACE,
      { nodeWidth: 220, nodeHeight: 76, columnGap: 292, rowGap: 100 }).positions);
  });
  it("normalizes Atlas snapshot lineage and labels it as the only source without Preview", () => {
    const frozen = Object.freeze(edges.map((edge) => Object.freeze({ ...edge })));
    const model = buildLineageEvidence({
      items,
      edges: frozen,
      workspaceId: WORKSPACE,
      workspaceName: "Sales",
    });

    expect(model.previewGraph).toBeUndefined();
    expect(model.relationships).toHaveLength(4);
    expect(model.counts.snapshot).toBe(4);
    expect(model.authoritativeEdges).toContainEqual({
      source: MODEL,
      target: REPORT,
      relation: "binds",
      broken: undefined,
    });
    const binds = model.relationships.find(
      (relationship) => relationship.target.id === REPORT,
    );
    expect(binds).toMatchObject({
      source: { id: MODEL, displayName: "Sales model", workspaceName: "Sales" },
      target: { id: REPORT, inSnapshot: true },
      agreement: "snapshot",
      preview: [],
    });
    expect(frozen[1]).toEqual({ source: REPORT, target: MODEL, relation: "binds" });
  });

  it("compares Preview evidence by source without changing Atlas lineage", () => {
    const model = buildLineageEvidence({
      items,
      edges,
      workspaceId: WORKSPACE.toUpperCase(),
      workspaceName: "Sales",
      evidence: evidence(),
    });
    const byTarget = (sourceId: string, targetId: string) =>
      model.relationships.find(
        (relationship) =>
          [relationship.source.id, relationship.target.id].sort().join() ===
          [sourceId, targetId].sort().join(),
      );

    expect(byTarget(LAKEHOUSE, MODEL)?.agreement).toBe("conflict");
    expect(byTarget(PIPELINE, NOTEBOOK)?.agreement).toBe("agree");
    expect(byTarget(MODEL, REPORT)?.agreement).toBe("unverified");
    expect(byTarget(LAKEHOUSE, WAREHOUSE)?.agreement).toBe("preview-only");
    expect(byTarget(MODEL, EXTERNAL)).toMatchObject({
      agreement: "cross-workspace",
      crossWorkspace: true,
      source: {
        key: itemRelationsNodeKey(EXTERNAL_WORKSPACE, EXTERNAL),
        displayName: "Shared lakehouse",
        workspaceName: "Shared data",
        inSnapshot: false,
        isLocal: false,
      },
    });
    expect(
      byTarget(PIPELINE, NOTEBOOK)
        ?.preview.map((entry) => entry.status)
        .sort(),
    ).toEqual(["matching", "not-lineage"]);
    expect(byTarget(NOTEBOOK, WAREHOUSE)?.agreement).toBe("not-covered");
    expect(model.relationships[0].agreement).toBe("conflict");
    expect(model.authoritativeEdges).toHaveLength(edges.length);
    expect(
      model.relationships.every((relationship) =>
        relationship.authoritative.every(
          (edge) => !("evidenceSource" in edge),
        ),
      ),
    ).toBe(true);
  });

  it("reports authoritative edges without Preview coverage as not covered", () => {
    const model = buildLineageEvidence({
      items,
      edges,
      workspaceId: WORKSPACE,
      evidence: createItemRelationsEvidence(WORKSPACE, OBSERVED, [
        query(LAKEHOUSE, "downstream", { items: [], relations: [], workspaces: [] }),
      ]),
    });

    expect(model.counts["snapshot-only"]).toBe(1);
    expect(model.counts["not-covered"]).toBe(3);
  });

  it("ignores evidence collected for another workspace", () => {
    const model = buildLineageEvidence({
      items,
      edges,
      workspaceId: EXTERNAL_WORKSPACE,
      evidence: evidence(),
    });

    expect(model.previewGraph).toBeUndefined();
    expect(model.counts.snapshot).toBe(4);
  });

  it("searches names, workspaces and relation types", () => {
    const model = buildLineageEvidence({
      items,
      edges,
      workspaceId: WORKSPACE,
      evidence: evidence(),
    });
    const cross = model.relationships.find(
      (relationship) => relationship.agreement === "cross-workspace",
    )!;

    expect(relationshipMatches(cross, "shared data")).toBe(true);
    expect(relationshipMatches(cross, "shortcut")).toBe(true);
    expect(relationshipMatches(cross, "warehouse")).toBe(false);
  });
});

describe("Preview graph layout", () => {
  const model = buildLineageEvidence({
    items,
    edges,
    workspaceId: WORKSPACE,
    evidence: evidence(),
  });
  const options = {
    laneX: 900,
    nodeWidth: 220,
    rowGap: 100,
    top: 46,
  };

  it("includes agreeing Preview edges and places outside endpoints in a separate lane", () => {
    const overlay = buildPreviewOverlay(model, WORKSPACE, {
      ...options,
      visibleItemIds: new Set(items.map((entry) => entry.fabricId)),
    });

    expect(
      overlay.edges.map((edge) => edge.entry.edge.relation.relationType).sort(),
    ).toEqual(["Datasource", "FutureRelation", "Orchestration", "Shortcut", "Shortcut"]);
    expect(overlay.laneNodes).toEqual([
      expect.objectContaining({
        key: itemRelationsNodeKey(EXTERNAL_WORKSPACE, EXTERNAL),
        x: 900,
        y: 46,
      }),
    ]);
    expect(overlay.laneWidth).toBeGreaterThan(220);
  });

  it("skips edges to filtered snapshot items and keeps lane positions stable", () => {
    const all = buildPreviewOverlay(model, WORKSPACE, {
      ...options,
      visibleItemIds: new Set(items.map((entry) => entry.fabricId)),
    });
    const filtered = buildPreviewOverlay(model, WORKSPACE, {
      ...options,
      visibleItemIds: new Set([MODEL, LAKEHOUSE]),
    });

    expect(
      filtered.edges.map((edge) => edge.entry.edge.relation.relationType).sort(),
    ).toEqual(["Datasource", "Shortcut"]);
    expect(filtered.laneNodes).toEqual(all.laneNodes);
  });
});

describe("cross-workspace expansion from stored evidence", () => {
  const SECOND = "bbbbbbbb-0000-4000-8000-000000000002";
  const THIRD = "bbbbbbbb-0000-4000-8000-000000000003";
  const OTHER_WORKSPACE = "33333333-3333-4333-8333-333333333333";
  const external = (id: string, name: string, workspaceId = EXTERNAL_WORKSPACE) => ({
    id,
    workspaceId,
    type: "Lakehouse",
    displayName: name,
  });
  const model = buildLineageEvidence({
    items,
    edges,
    workspaceId: WORKSPACE,
    evidence: createItemRelationsEvidence(WORKSPACE, OBSERVED, [
      query(MODEL, "upstream", {
        items: [
          external(EXTERNAL, "Shared lakehouse"),
          external(SECOND, "Raw zone", OTHER_WORKSPACE),
          external(THIRD, "Archive", OTHER_WORKSPACE),
        ],
        relations: [
          { itemId: MODEL, dependentOnItemId: EXTERNAL, relationType: "Shortcut" },
          { itemId: EXTERNAL, dependentOnItemId: SECOND, relationType: "Shortcut" },
          { itemId: EXTERNAL, dependentOnItemId: THIRD, relationType: "FutureRelation" },
          { itemId: SECOND, dependentOnItemId: EXTERNAL, relationType: "PushData" },
        ],
        workspaces: [
          { id: EXTERNAL_WORKSPACE, displayName: "Shared data" },
          { id: OTHER_WORKSPACE, displayName: "Raw data" },
        ],
      }),
    ]),
  });
  const options = {
    laneX: 900,
    nodeWidth: 220,
    rowGap: 100,
    top: 46,
    visibleItemIds: new Set(items.map((entry) => entry.fabricId)),
  };
  const key = (workspaceId: string, id: string) => itemRelationsNodeKey(workspaceId, id);

  it("shows only endpoints next to the snapshot until a node is expanded", () => {
    const overlay = buildPreviewOverlay(model, WORKSPACE, options);

    expect(overlay.laneNodes).toEqual([
      expect.objectContaining({
        key: key(EXTERNAL_WORKSPACE, EXTERNAL),
        column: 0,
        hiddenNeighbors: 2,
        expanded: false,
      }),
    ]);
    expect(overlay.edges).toHaveLength(1);
  });

  it("reveals stored neighbours in the next column without moving existing nodes", () => {
    const collapsed = buildPreviewOverlay(model, WORKSPACE, options);
    const expanded = buildPreviewOverlay(model, WORKSPACE, {
      ...options,
      expandedKeys: [key(EXTERNAL_WORKSPACE, EXTERNAL)],
    });
    const first = (overlay: typeof collapsed) =>
      overlay.laneNodes.find((node) => node.key === key(EXTERNAL_WORKSPACE, EXTERNAL));

    expect({ x: first(expanded)!.x, y: first(expanded)!.y }).toEqual({
      x: first(collapsed)!.x,
      y: first(collapsed)!.y,
    });
    expect(
      expanded.laneNodes
        .filter((node) => node.column === 1)
        .map((node) => [node.endpoint.displayName, node.y]),
    ).toEqual([
      ["Archive", 46],
      ["Raw zone", 146],
    ]);
    expect(expanded.edges.map((edge) => edge.entry.edge.relation.relationType).sort()).toEqual([
      "FutureRelation",
      "PushData",
      "Shortcut",
      "Shortcut",
    ]);
    expect(expanded.expansions).toEqual([
      expect.objectContaining({ revealed: 2, withheld: 0 }),
    ]);
  });

  it("is idempotent, ignores unknown keys and bounds each expansion", () => {
    const repeated = buildPreviewOverlay(model, WORKSPACE, {
      ...options,
      expandedKeys: [
        key(EXTERNAL_WORKSPACE, EXTERNAL),
        key(EXTERNAL_WORKSPACE, EXTERNAL),
        key(OTHER_WORKSPACE, "cccccccc-0000-4000-8000-000000000001"),
      ],
    });
    const bounded = buildPreviewOverlay(model, WORKSPACE, {
      ...options,
      maxRevealPerExpansion: 1,
      expandedKeys: [key(EXTERNAL_WORKSPACE, EXTERNAL)],
    });

    expect(repeated.laneNodes).toHaveLength(3);
    expect(repeated.expansions).toHaveLength(1);
    expect(bounded.laneNodes).toHaveLength(2);
    expect(bounded.expansions[0]).toMatchObject({ revealed: 1, withheld: 1 });
    expect(
      bounded.laneNodes.find((node) => node.key === key(EXTERNAL_WORKSPACE, EXTERNAL))
        ?.hiddenNeighbors,
    ).toBe(1);
  });
});

describe("lineage changes", () => {
  it("lists added, removed and broken-state lineage with item names", () => {
    const base: AtlasData = {
      workspace: { fabricId: WORKSPACE, displayName: "Sales", capacity: "", region: "" },
      items,
      edges: edges.slice(0, 3),
      principals: [],
      grants: [],
      jobs: [],
      comments: [],
      config: [],
      syncRuns: [],
    } as unknown as AtlasData;
    const previous = snapshotFromData(base, "previous");
    const current = snapshotFromData(
      {
        ...base,
        edges: [
          { ...edges[0], broken: true },
          edges[1],
          edges[3],
        ],
      },
      "current",
    );

    const rows = lineageChangesBetween(previous, current);

    expect(
      rows.map((row) => [row.change.type, row.sourceName, row.targetName]),
    ).toEqual(
      expect.arrayContaining([
        ["lineage-added", "Transform", "Finance warehouse"],
        ["lineage-removed", "Daily load", "Transform"],
        ["lineage-broken-state-changed", "Sales lakehouse", "Sales model"],
      ]),
    );
    expect(rows).toHaveLength(3);
    expect(
      rows.find((row) => row.change.type === "lineage-broken-state-changed")
        ?.relation,
    ).toBe("Direct Lake");
  });
});
