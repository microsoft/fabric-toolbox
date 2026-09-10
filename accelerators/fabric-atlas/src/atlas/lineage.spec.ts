import { describe, expect, it } from "vitest";
import {
  buildStagedLayout,
  createLineageIndex,
  getLineageImpact,
  getItemImpactReport,
  getSchemaObjectImpactReport,
  itemStage,
  lineageEdgeKey,
  normalizeLineageEdges,
} from "./lineage";
import { buildSchemaDependencies } from "./schema-lineage";
import type { AtlasData, Edge, Item } from "./model";

const edges: Edge[] = [
  { source: "pipeline", target: "lakehouse", relation: "writes" },
  { source: "lakehouse", target: "model", relation: "Direct Lake" },
  { source: "model", target: "report-a", relation: "binds" },
  { source: "model", target: "report-b", relation: "binds" },
];

describe("getLineageImpact", () => {
  it("collects transitive upstream and downstream paths", () => {
    const impact = getLineageImpact(edges, "model");

    expect([...impact.upstream.ids]).toEqual(["lakehouse", "pipeline"]);
    expect([...impact.downstream.ids]).toEqual(["report-a", "report-b"]);
    expect(impact.upstream.distance.get("pipeline")).toBe(2);
    expect(impact.upstream.edgeKeys).toContain(lineageEdgeKey(edges[0]));
  });

  it("limits traversal depth for direct-neighbor mode", () => {
    const impact = getLineageImpact(edges, "model", 1);

    expect([...impact.upstream.ids]).toEqual(["lakehouse"]);
    expect([...impact.downstream.ids]).toEqual(["report-a", "report-b"]);
  });

  it("terminates safely when lineage contains a cycle", () => {
    const cyclic = [...edges, { source: "report-a", target: "model", relation: "cycle" }];
    const impact = getLineageImpact(cyclic, "model");

    expect(impact.downstream.ids.has("report-a")).toBe(true);
    expect(impact.downstream.ids.has("model")).toBe(false);
  });

  it("traverses a supplied index without scanning unrelated entries", () => {
    const unrelated = Array.from({ length: 1_000 }, (_, index) => ({
      source: `unrelated-${index}`,
      target: `unrelated-${index + 1}`,
      relation: "unrelated",
    }));
    const index = createLineageIndex([...edges, ...unrelated]);
    Object.defineProperty(index, "entries", {
      get() {
        throw new Error("global edge entries should not be scanned");
      },
    });

    const impact = getLineageImpact(index, "model");

    expect([...impact.upstream.ids]).toEqual(["lakehouse", "pipeline"]);
    expect([...impact.downstream.ids]).toEqual(["report-a", "report-b"]);
  });
});

describe("impact reports", () => {
  const item = (fabricId: string, itemType: Item["itemType"]): Item => ({
    fabricId,
    displayName: fabricId,
    itemType,
    health: "healthy",
    endorsement: "none",
    tags: [],
  });

  it("sorts impact by distance, respects max depth, and terminates cycles", () => {
    const items = [
      item("source", "Lakehouse"),
      item("model", "SemanticModel"),
      item("report-a", "Report"),
      item("report-b", "Report"),
    ];
    const cyclicEdges: Edge[] = [
      { source: "report-a", target: "model", relation: "cycle" },
      { source: "model", target: "report-b", relation: "binds" },
      { source: "source", target: "model", relation: "Direct Lake" },
      { source: "model", target: "report-a", relation: "binds" },
    ];

    const report = getItemImpactReport(items, cyclicEdges, "source", 2);
    expect(report.downstream.map(({ id, distance }) => [id, distance])).toEqual([
      ["model", 1],
      ["report-a", 2],
      ["report-b", 2],
    ]);
    expect(report.downstream.filter(({ id }) => id === "model")).toHaveLength(
      1,
    );

    const direct = getItemImpactReport(
      { items, edges: cyclicEdges },
      "source",
      1,
    );
    expect(direct.downstream.map(({ id }) => id)).toEqual(["model"]);
  });

  it("keeps relevant edges and reports unresolved endpoints", () => {
    const items = [
      item("source", "Lakehouse"),
      item("model", "SemanticModel"),
    ];
    const report = getItemImpactReport(
      items,
      [
        { source: "source", target: "model", relation: "Direct Lake" },
        { source: "model", target: "missing-report", relation: "binds" },
        { source: "unrelated", target: "elsewhere", relation: "ignored" },
      ],
      "model",
    );

    expect(report.upstream.map(({ id }) => id)).toEqual(["source"]);
    expect(report.downstream).toEqual([
      { id: "missing-report", distance: 1, item: undefined },
    ]);
    expect(report.relevantEdges).toHaveLength(2);
    expect(report.unresolvedEndpointIds).toEqual(["missing-report"]);
  });

  it("reports schema impact at item granularity without name heuristics", () => {
    const items = [
      item("warehouse", "Warehouse"),
      item("model", "SemanticModel"),
      item("report", "Report"),
      item("same-name-report", "Report"),
    ];
    const data: Pick<AtlasData, "items" | "edges" | "schema"> = {
      items,
      edges: [
        { source: "warehouse", target: "model", relation: "Direct Lake" },
        { source: "model", target: "report", relation: "binds" },
      ],
      schema: {
        warehouse: [
          {
            name: "Sales",
            columns: [{ name: "Amount", dataType: "double" }],
            measures: [],
          },
        ],
        model: [
          {
            name: "Sales",
            columns: [{ name: "Amount", dataType: "double" }],
            measures: [
              { name: "Revenue", expr: "SUM(Sales[Amount])" },
              { name: "Margin", expr: "[Revenue] / 2" },
            ],
          },
        ],
        "same-name-report": [
          {
            name: "Sales",
            columns: [],
            measures: [],
          },
        ],
      },
    };

    const report = getSchemaObjectImpactReport(data, {
      itemId: "model",
      kind: "measure",
      tableName: "Sales",
      name: "Revenue",
    });

    expect(report).toMatchObject({
      objectExists: true,
      granularity: "item",
      verifiedObjectDependencies: false,
    });
    expect(report.upstream.map(({ id }) => id)).toEqual(["warehouse"]);
    expect(report.downstream.map(({ id }) => id)).toEqual(["report"]);
    expect(report.downstream.map(({ id }) => id)).not.toContain(
      "same-name-report",
    );
    expect(report.detail).toMatch(/does not infer schema-object lineage/i);
  });

  it("restricts object-level item context to DAX-reached items", () => {
    const value: Pick<AtlasData, "items" | "edges" | "schema"> = {
      items: [
        item("lake", "Lakehouse"),
        item("model", "SemanticModel"),
        item("report", "Report"),
      ],
      edges: [
        { source: "lake", target: "model", relation: "Direct Lake" },
        { source: "model", target: "report", relation: "binds" },
      ],
      schema: {
        lake: [
          {
            name: "Sales",
            columns: [{ name: "Amount", dataType: "double" }],
            measures: [],
          },
        ],
        model: [
          {
            name: "Sales",
            columns: [{ name: "Amount", dataType: "double" }],
            measures: [
              { name: "Revenue", expr: "SUM(Sales[Amount])" },
              { name: "Margin", expr: "[Revenue] / 2" },
            ],
          },
        ],
      },
    };
    const dependencies = buildSchemaDependencies(value);
    expect(dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: expect.objectContaining({ name: "Margin" }),
          to: expect.objectContaining({ name: "Revenue" }),
          confidence: "verified",
        }),
      ]),
    );
    const report = getSchemaObjectImpactReport(
      value,
      {
        itemId: "model",
        kind: "measure",
        tableName: "Sales",
        name: "Revenue",
      },
      { dependencies },
    );

    expect(report.granularity).toBe("object");
    expect(report.upstream.map((entry) => entry.id)).toEqual(["lake"]);
    expect(report.downstream).toEqual([]);
    expect(report.relevantEdges).toEqual([
      { source: "lake", target: "model", relation: "Direct Lake" },
    ]);

    const sourceReport = getSchemaObjectImpactReport(
      value,
      {
        itemId: "lake",
        kind: "column",
        tableName: "Sales",
        name: "Amount",
      },
      { dependencies },
    );
    expect(
      sourceReport.objectImpact?.downstream.map((entry) => [
        entry.object.name,
        entry.confidence,
      ]),
    ).toEqual([
      ["Revenue", "inferred"],
      ["Margin", "inferred"],
    ]);
    expect(sourceReport.verifiedObjectDependencies).toBe(false);
  });
});

describe("staged layout", () => {
  const item = (fabricId: string, itemType: Item["itemType"]): Item => ({
    fabricId,
    displayName: fabricId,
    itemType,
    health: "healthy",
    endorsement: "none",
    tags: [],
  });

  it("places Fabric item types in stable lifecycle stages", () => {
    expect(itemStage("DataPipeline")).toBe(0);
    expect(itemStage("Notebook")).toBe(1);
    expect(itemStage("Lakehouse")).toBe(2);
    expect(itemStage("Eventhouse")).toBe(2);
    expect(itemStage("SQLEndpoint")).toBe(3);
    expect(itemStage("KQLDatabase")).toBe(3);
    expect(itemStage("SemanticModel")).toBe(4);
    expect(itemStage("Ontology")).toBe(4);
    expect(itemStage("GraphModel")).toBe(4);
    expect(itemStage("Report")).toBe(5);
    expect(itemStage("DataAgent")).toBe(5);
    expect(itemStage("KQLQueryset")).toBe(5);
    expect(itemStage("KQLDashboard")).toBe(5);
  });

  it("positions later lifecycle stages farther right", () => {
    const items = [
      item("notebook", "Notebook"),
      item("lakehouse", "Lakehouse"),
      item("model", "SemanticModel"),
      item("report", "Report"),
    ];
    const layout = buildStagedLayout(items, edges);

    expect(layout.positions.get("notebook")!.x).toBeLessThan(
      layout.positions.get("lakehouse")!.x,
    );
    expect(layout.positions.get("lakehouse")!.x).toBeLessThan(
      layout.positions.get("model")!.x,
    );
    expect(layout.positions.get("model")!.x).toBeLessThan(
      layout.positions.get("report")!.x,
    );
  });

  it("separates disconnected data products into layout groups", () => {
    const items = [
      item("notebook-a", "Notebook"),
      item("lakehouse-a", "Lakehouse"),
      item("notebook-b", "Notebook"),
      item("lakehouse-b", "Lakehouse"),
    ];
    const layout = buildStagedLayout(items, [
      { source: "notebook-a", target: "lakehouse-a", relation: "writes" },
      { source: "notebook-b", target: "lakehouse-b", relation: "writes" },
    ]);

    expect(layout.groups).toHaveLength(2);
    expect(layout.groups[0].y).toBeLessThan(layout.groups[1].y);
  });

  it("places unconnected items after connected lineage groups", () => {
    const items = [
      item("pipeline", "DataPipeline"),
      item("notebook", "Notebook"),
      item("orphan-a", "Lakehouse"),
      item("orphan-b", "Report"),
      item("orphan-c", "SQLDatabase"),
    ];
    const layout = buildStagedLayout(items, [
      { source: "pipeline", target: "notebook", relation: "orchestrates" },
    ]);

    expect(layout.groups[0].itemIds).toEqual(["pipeline", "notebook"]);
    expect(layout.groups[1].label).toBe("Unconnected items");
  });
});

describe("normalizeLineageEdges", () => {
  const item = (fabricId: string, itemType: Item["itemType"]): Item => ({
    fabricId,
    displayName: fabricId,
    itemType,
    health: "healthy",
    endorsement: "none",
    tags: [],
  });

  it("orients scanner dependencies in lifecycle direction", () => {
    const items = [
      item("pipeline", "DataPipeline"),
      item("notebook", "Notebook"),
      item("lakehouse", "Lakehouse"),
      item("model", "SemanticModel"),
      item("report", "Report"),
    ];
    const normalized = normalizeLineageEdges(items, [
      { source: "notebook", target: "pipeline", relation: "Direct Lake" },
      { source: "lakehouse", target: "notebook", relation: "reads" },
      { source: "model", target: "report", relation: "report" },
    ]);

    expect(normalized).toEqual([
      { source: "pipeline", target: "notebook", relation: "orchestrates", broken: undefined },
      { source: "notebook", target: "lakehouse", relation: "writes", broken: undefined },
      { source: "model", target: "report", relation: "binds", broken: undefined },
    ]);
  });

  it("preserves and deduplicates official same-stage chains", () => {
    const items = [
      item("flow-a", "Dataflow"),
      item("flow-b", "Dataflow"),
      item("mart", "Datamart"),
      item("model-a", "SemanticModel"),
      item("model-b", "SemanticModel"),
    ];

    expect(
      normalizeLineageEdges(items, [
        { source: "flow-a", target: "flow-b", relation: "dataflow" },
        { source: "flow-a", target: "flow-b", relation: "dataflow" },
        { source: "flow-a", target: "mart", relation: "dataflow" },
        { source: "mart", target: "flow-b", relation: "datamart" },
        {
          source: "model-a",
          target: "model-b",
          relation: "semantic model",
        },
      ]),
    ).toEqual([
      {
        source: "flow-a",
        target: "flow-b",
        relation: "dataflow",
        broken: undefined,
      },
      {
        source: "flow-a",
        target: "mart",
        relation: "dataflow",
        broken: undefined,
      },
      {
        source: "mart",
        target: "flow-b",
        relation: "datamart",
        broken: undefined,
      },
      {
        source: "model-a",
        target: "model-b",
        relation: "semantic model",
        broken: undefined,
      },
    ]);
  });

  it("orients supported IQ and KQL relations from source to consumer", () => {
    const items = [
      item("eventhouse", "Eventhouse"),
      item("database", "KQLDatabase"),
      item("lakehouse", "Lakehouse"),
      item("ontology", "Ontology"),
      item("graph", "GraphModel"),
      item("agent-a", "DataAgent"),
      item("agent-b", "DataAgent"),
      item("queryset", "KQLQueryset"),
      item("dashboard", "KQLDashboard"),
    ];

    expect(
      normalizeLineageEdges(items, [
        { source: "database", target: "eventhouse", relation: "contains" },
        { source: "ontology", target: "lakehouse", relation: "source" },
        { source: "graph", target: "lakehouse", relation: "source" },
        { source: "agent-a", target: "ontology", relation: "semantic model" },
        { source: "agent-b", target: "graph", relation: "source" },
        { source: "queryset", target: "database", relation: "source" },
        { source: "dashboard", target: "database", relation: "source" },
      ]),
    ).toEqual([
      {
        source: "eventhouse",
        target: "database",
        relation: "database",
        broken: undefined,
      },
      {
        source: "lakehouse",
        target: "ontology",
        relation: "binds ontology",
        broken: undefined,
      },
      {
        source: "lakehouse",
        target: "graph",
        relation: "maps graph",
        broken: undefined,
      },
      {
        source: "ontology",
        target: "agent-a",
        relation: "grounds",
        broken: undefined,
      },
      {
        source: "graph",
        target: "agent-b",
        relation: "grounds",
        broken: undefined,
      },
      {
        source: "database",
        target: "queryset",
        relation: "queries",
        broken: undefined,
      },
      {
        source: "database",
        target: "dashboard",
        relation: "visualizes",
        broken: undefined,
      },
    ]);
  });

  it("keeps normalized IQ and KQL relations stable without adding edges", () => {
    const items = [
      item("lakehouse", "Lakehouse"),
      item("ontology", "Ontology"),
      item("agent", "DataAgent"),
      item("unrelated", "Report"),
    ];
    const input = [
      { source: "agent", target: "ontology", relation: "uses" },
      { source: "ontology", target: "lakehouse", relation: "source" },
    ];
    const once = normalizeLineageEdges(items, input);

    expect(normalizeLineageEdges(items, once)).toEqual(once);
    expect(once).toHaveLength(input.length);
    expect(once.some((edge) => edge.source === "unrelated")).toBe(false);
  });
});
