import { describe, expect, it } from "vitest";
import type { Item, ModelTableSchema } from "./model";
import {
  objectLineageReducer,
  type ObjectLineageState,
} from "./object-lineage-state";
import {
  buildSemanticObjectGraph,
  semanticBlockHeight,
  semanticTableGeometry,
} from "./semantic-object-graph";
import {
  buildSemanticModelXRay,
  xrayObjectKey,
} from "./semantic-xray";

const MODEL = "253bc19c-8fe0-4c83-b52c-c525c11598d0";
const item: Item = {
  fabricId: MODEL,
  displayName: "HealthcareOperationsModel",
  itemType: "SemanticModel",
  health: "healthy",
  endorsement: "none",
  tags: [],
};

function fixture(): ModelTableSchema[] {
  return Array.from({ length: 21 }, (_, index) => {
    const name = index === 0 ? "Laboratory Results" : `Table ${index}`;
    const measureCount =
      index === 0 ? 4 : index <= 3 ? 3 : 2;
    const columnCount =
      index === 0 ? 9 : index <= 5 ? 7 : 6;
    return {
      name,
      columns: Array.from({ length: columnCount }, (__, column) => ({
        name: column === 0 ? "Id" : `Column ${column}`,
        dataType: "string",
      })),
      measures: Array.from({ length: measureCount }, (__, measure) => ({
        name:
          index === 0 && measure === 0
            ? "Laboratory Tests"
            : index === 0 && measure === 1
              ? "Abnormal Laboratory Tests"
              : index === 0 && measure === 2
                ? "Critical Laboratory Tests"
                : index === 0 && measure === 3
                  ? "Abnormal Laboratory Rate"
                  : `Measure ${index}-${measure}`,
        expr:
          index === 0 && measure === 0
            ? "SUM('Table 1'[Id])"
            : "1",
        expressionStatus: "sanitized",
      })),
    };
  });
}

function graphFor(
  tables: ModelTableSchema[],
  state: ObjectLineageState,
) {
  const xray = buildSemanticModelXRay(MODEL, tables);
  return {
    xray,
    graph: buildSemanticObjectGraph({
      item,
      tables,
      xray,
      state,
      items: [item],
      edges: [],
      schema: { [MODEL]: tables },
    }),
  };
}

describe("Semantic Model Object Lineage graph", () => {
  it("keeps the complete model discoverable without rendering fields by default", () => {
    const tables = fixture();
    const { graph, xray } = graphFor(tables, {
      itemId: MODEL,
      blocks: [],
      dax: "direct",
    });

    expect(tables).toHaveLength(21);
    expect(xray.measureCount).toBe(47);
    expect(xray.columnCount).toBe(134);
    expect(graph.tableRows).toHaveLength(21);
    expect(graph.blocks).toEqual([]);
    expect(graph.renderedFieldRows).toBe(0);
  });

  it("opens Laboratory Results with all four measures visible", () => {
    const tables = fixture();
    const geometry = semanticTableGeometry(tables)[0];
    const state = objectLineageReducer(
      { itemId: MODEL, blocks: [], dax: "direct" },
      {
        type: "expand",
        table: geometry.key,
        anchorY: geometry.anchorY,
        height: geometry.height,
      },
    );
    const { graph } = graphFor(tables, state);
    const block = graph.blocks[0];

    expect(
      block.fields
        .filter((field) => field.kind === "measure")
        .map((field) => field.name),
    ).toEqual([
      "Laboratory Tests",
      "Abnormal Laboratory Tests",
      "Critical Laboratory Tests",
      "Abnormal Laboratory Rate",
    ]);
  });

  it("uses table-qualified field keys and collapses remote DAX endpoints to table rows", () => {
    const tables = fixture();
    tables[1].columns[0].name = "Id";
    const focus = xrayObjectKey(
      "measure",
      "Laboratory Results",
      "Laboratory Tests",
    );
    const geometry = semanticTableGeometry(tables)[0];
    let state = objectLineageReducer(
      { itemId: MODEL, blocks: [], dax: "direct" },
      {
        type: "expand",
        table: geometry.key,
        anchorY: geometry.anchorY,
        height: geometry.height,
      },
    );
    state = objectLineageReducer(state, { type: "focus", key: focus });
    const { graph, xray } = graphFor(tables, state);

    expect(
      xrayObjectKey("column", "Laboratory Results", "Id"),
    ).not.toBe(xrayObjectKey("column", "Table 1", "Id"));
    expect(xray.dependsOn.get(focus)).toEqual([
      xrayObjectKey("column", "Table 1", "Id"),
    ]);
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "dax",
          tone: "upstream",
          collapsedEndpoint: true,
        }),
      ]),
    );
  });

  it("does not move table rows or existing blocks after focus changes", () => {
    const tables = fixture();
    const geometries = semanticTableGeometry(tables);
    let state = objectLineageReducer(
      { itemId: MODEL, blocks: [], dax: "direct" },
      {
        type: "expand",
        table: geometries[0].key,
        anchorY: geometries[0].anchorY,
        height: semanticBlockHeight(tables[0]),
      },
    );
    const first = graphFor(tables, state).graph;
    state = objectLineageReducer(state, {
      type: "focus",
      key: xrayObjectKey(
        "measure",
        "Laboratory Results",
        "Laboratory Tests",
      ),
    });
    state = objectLineageReducer(state, {
      type: "expand",
      table: geometries[1].key,
      anchorY: geometries[1].anchorY,
      height: semanticBlockHeight(tables[1]),
    });
    const second = graphFor(tables, state).graph;

    expect(second.tableRows).toEqual(first.tableRows);
    expect(second.blocks[0]).toMatchObject({
      tableKey: first.blocks[0].tableKey,
      x: first.blocks[0].x,
      y: first.blocks[0].y,
    });
  });
});
