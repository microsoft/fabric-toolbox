import type {
  Edge,
  Item,
  ModelTableSchema,
} from "./model";
import { diagnosticStart, recordDiagnostic } from "./diagnostics";
import {
  modelObjectKey,
  normalizeObjectName,
  tableObjectKey,
  type ObjectLineageState,
} from "./object-lineage-state";
import {
  xrayImpact,
  type SemanticModelXRay,
  type XRayObject,
} from "./semantic-xray";

export const OBJECT_LINEAGE_LIMITS = {
  maxRowsPerBlock: 24,
  maxRenderedFieldRows: 192,
  maxDaxEdges: 250,
} as const;

export const SEMANTIC_GRAPH_LAYOUT = {
  sourceX: 24,
  tableX: 300,
  tableTop: 102,
  tableWidth: 292,
  tableRowHeight: 44,
  fieldX: 660,
  fieldWidth: 348,
  fieldHeaderHeight: 48,
  fieldRowHeight: 32,
  fieldFooterHeight: 32,
  modelX: 1050,
  modelY: 74,
  modelWidth: 230,
  consumerX: 1330,
  consumerTop: 74,
  consumerGap: 92,
  itemNodeWidth: 230,
  itemNodeHeight: 76,
} as const;

export interface SemanticTableRow {
  key: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  measureCount: number;
  columnCount: number;
  isHidden?: boolean;
}

export interface SemanticFieldRow {
  key: string;
  kind: "measure" | "column";
  name: string;
  table: string;
  dataType?: string;
  expressionStatus?: "sanitized" | "unsupported";
  isHidden?: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SemanticFieldBlock {
  tableKey: string;
  tableName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fields: SemanticFieldRow[];
  totalFieldCount: number;
  withheldFieldCount: number;
}

export interface SemanticItemNode {
  key: string;
  itemId: string;
  label: string;
  subtitle: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SemanticGraphPoint {
  x: number;
  y: number;
}

export interface SemanticGraphEdge {
  key: string;
  source: SemanticGraphPoint;
  target: SemanticGraphPoint;
  relation: string;
  kind: "dax" | "source" | "item";
  tone: "upstream" | "downstream" | "neutral";
  inferred?: boolean;
  collapsedEndpoint?: boolean;
}

export interface SemanticObjectGraph {
  tableRows: SemanticTableRow[];
  blocks: SemanticFieldBlock[];
  sourceNodes: SemanticItemNode[];
  consumerNodes: SemanticItemNode[];
  modelNode: SemanticItemNode;
  edges: SemanticGraphEdge[];
  width: number;
  height: number;
  renderedFieldRows: number;
  daxEdgeCount: number;
  daxEdgesTruncated: boolean;
}

export function semanticTableRows(
  tables: readonly ModelTableSchema[],
): SemanticTableRow[] {
  return tables.map((table, index) => ({
    key: normalizeObjectName(table.name),
    name: table.name,
    x: SEMANTIC_GRAPH_LAYOUT.tableX,
    y:
      SEMANTIC_GRAPH_LAYOUT.tableTop +
      index * SEMANTIC_GRAPH_LAYOUT.tableRowHeight,
    width: SEMANTIC_GRAPH_LAYOUT.tableWidth,
    height: SEMANTIC_GRAPH_LAYOUT.tableRowHeight,
    measureCount: table.measures.length,
    columnCount: table.columns.length,
    isHidden: table.isHidden,
  }));
}

export function semanticBlockHeight(table: ModelTableSchema): number {
  const fieldCount = table.measures.length + table.columns.length;
  const visible = Math.min(
    fieldCount,
    OBJECT_LINEAGE_LIMITS.maxRowsPerBlock,
  );
  return (
    SEMANTIC_GRAPH_LAYOUT.fieldHeaderHeight +
    visible * SEMANTIC_GRAPH_LAYOUT.fieldRowHeight +
    (fieldCount > visible ? SEMANTIC_GRAPH_LAYOUT.fieldFooterHeight : 0)
  );
}

function visibleObjects(
  table: ModelTableSchema,
  xray: SemanticModelXRay,
  focus: string | undefined,
): XRayObject[] {
  const tableEvidence = xray.tables.find(
    (entry) => normalizeObjectName(entry.name) === normalizeObjectName(table.name),
  );
  const values = (tableEvidence?.objectKeys ?? [])
    .map((key) => xray.objects.get(key))
    .filter((object): object is XRayObject => !!object);
  if (values.length <= OBJECT_LINEAGE_LIMITS.maxRowsPerBlock) return values;
  const visible = values.slice(0, OBJECT_LINEAGE_LIMITS.maxRowsPerBlock);
  const focused = focus ? xray.objects.get(focus) : undefined;
  if (
    focused &&
    normalizeObjectName(focused.table) === normalizeObjectName(table.name) &&
    !visible.some((object) => object.key === focused.key)
  ) {
    visible[visible.length - 1] = focused;
  }
  return visible;
}

function fieldBlocks(
  tables: readonly ModelTableSchema[],
  xray: SemanticModelXRay,
  state: ObjectLineageState,
): SemanticFieldBlock[] {
  const tablesByKey = new Map(
    tables.map((table) => [normalizeObjectName(table.name), table]),
  );
  let rendered = 0;
  const blocks: SemanticFieldBlock[] = [];
  for (const placement of state.blocks) {
    const table = tablesByKey.get(placement.table);
    if (!table || rendered >= OBJECT_LINEAGE_LIMITS.maxRenderedFieldRows) {
      continue;
    }
    const remaining =
      OBJECT_LINEAGE_LIMITS.maxRenderedFieldRows - rendered;
    const objects = visibleObjects(table, xray, state.focus).slice(0, remaining);
    const fields = objects.map((object, index) => ({
      key: object.key,
      kind: object.kind,
      name: object.name,
      table: object.table,
      dataType: object.dataType,
      expressionStatus: object.expressionStatus,
      isHidden: object.isHidden,
      x: SEMANTIC_GRAPH_LAYOUT.fieldX,
      y:
        placement.y +
        SEMANTIC_GRAPH_LAYOUT.fieldHeaderHeight +
        index * SEMANTIC_GRAPH_LAYOUT.fieldRowHeight,
      width: SEMANTIC_GRAPH_LAYOUT.fieldWidth,
      height: SEMANTIC_GRAPH_LAYOUT.fieldRowHeight,
    }));
    rendered += fields.length;
    const totalFieldCount = table.measures.length + table.columns.length;
    blocks.push({
      tableKey: placement.table,
      tableName: table.name,
      x: SEMANTIC_GRAPH_LAYOUT.fieldX,
      y: placement.y,
      width: SEMANTIC_GRAPH_LAYOUT.fieldWidth,
      height: placement.height,
      fields,
      totalFieldCount,
      withheldFieldCount: Math.max(0, totalFieldCount - fields.length),
    });
  }
  return blocks;
}

function itemNodes(
  item: Item,
  tables: readonly ModelTableSchema[],
  tableRows: readonly SemanticTableRow[],
  items: readonly Item[],
  edges: readonly Edge[],
  schema: Record<string, ModelTableSchema[]> | undefined,
): {
  sourceNodes: SemanticItemNode[];
  consumerNodes: SemanticItemNode[];
  sourceEdges: SemanticGraphEdge[];
  itemEdges: SemanticGraphEdge[];
} {
  const itemById = new Map(items.map((entry) => [entry.fabricId, entry]));
  const incoming = edges.filter((edge) => edge.target === item.fabricId);
  const outgoing = edges.filter((edge) => edge.source === item.fabricId);
  const sourceNodes: SemanticItemNode[] = [];
  const sourceEdges: SemanticGraphEdge[] = [];
  const tableRowByName = new Map(
    tableRows.map((row) => [normalizeObjectName(row.name), row]),
  );
  for (const table of tables) {
    const row = tableRowByName.get(normalizeObjectName(table.name));
    if (!row) continue;
    const matches = incoming
      .map((edge) => ({
        edge,
        item: itemById.get(edge.source),
      }))
      .filter(
        (entry): entry is { edge: Edge; item: Item } =>
          !!entry.item &&
          (schema?.[entry.item.fabricId] ?? []).some(
            (sourceTable) =>
              normalizeObjectName(sourceTable.name) ===
              normalizeObjectName(table.name),
          ),
      );
    matches.forEach(({ edge, item: source }, index) => {
      const node: SemanticItemNode = {
        key: `source\u0000${source.fabricId}\u0000${row.key}`,
        itemId: source.fabricId,
        label: table.name,
        subtitle: source.displayName,
        x: SEMANTIC_GRAPH_LAYOUT.sourceX,
        y: row.y + index * 12,
        width: SEMANTIC_GRAPH_LAYOUT.itemNodeWidth,
        height: SEMANTIC_GRAPH_LAYOUT.itemNodeHeight,
      };
      sourceNodes.push(node);
      sourceEdges.push({
        key: `${node.key}\u0000${row.key}`,
        source: {
          x: node.x + node.width,
          y: node.y + node.height / 2,
        },
        target: { x: row.x, y: row.y + row.height / 2 },
        relation: edge.relation,
        kind: "source",
        tone: "neutral",
        inferred: true,
      });
    });
  }

  const consumerNodes = outgoing.flatMap((edge, index) => {
    const consumer = itemById.get(edge.target);
    if (!consumer) return [];
    return [
      {
        key: `consumer\u0000${consumer.fabricId}`,
        itemId: consumer.fabricId,
        label: consumer.displayName,
        subtitle: consumer.itemType,
        x: SEMANTIC_GRAPH_LAYOUT.consumerX,
        y:
          SEMANTIC_GRAPH_LAYOUT.consumerTop +
          index * SEMANTIC_GRAPH_LAYOUT.consumerGap,
        width: SEMANTIC_GRAPH_LAYOUT.itemNodeWidth,
        height: SEMANTIC_GRAPH_LAYOUT.itemNodeHeight,
      },
    ];
  });
  const itemEdges = consumerNodes.map((consumer, index) => ({
    key: `item\u0000${item.fabricId}\u0000${consumer.itemId}`,
    source: {
      x:
        SEMANTIC_GRAPH_LAYOUT.modelX +
        SEMANTIC_GRAPH_LAYOUT.modelWidth,
      y:
        SEMANTIC_GRAPH_LAYOUT.modelY +
        SEMANTIC_GRAPH_LAYOUT.itemNodeHeight / 2,
    },
    target: {
      x: consumer.x,
      y: consumer.y + consumer.height / 2,
    },
    relation: outgoing[index]?.relation ?? "depends on",
    kind: "item" as const,
    tone: "downstream" as const,
  }));
  return { sourceNodes, consumerNodes, sourceEdges, itemEdges };
}

function objectPoint(
  key: string,
  xray: SemanticModelXRay,
  tableRows: readonly SemanticTableRow[],
  blocks: readonly SemanticFieldBlock[],
): { point: SemanticGraphPoint; collapsed: boolean } | undefined {
  const object = xray.objects.get(key);
  if (!object) return undefined;
  const field = blocks
    .flatMap((block) => block.fields)
    .find((entry) => entry.key === key);
  if (field) {
    return {
      point: {
        x: field.x + field.width / 2,
        y: field.y + field.height / 2,
      },
      collapsed: false,
    };
  }
  const table = tableRows.find(
    (row) => row.key === normalizeObjectName(object.table),
  );
  return table
    ? {
        point: {
          x: table.x + table.width,
          y: table.y + table.height / 2,
        },
        collapsed: true,
      }
    : undefined;
}

function daxEdges(
  xray: SemanticModelXRay,
  state: ObjectLineageState,
  tableRows: readonly SemanticTableRow[],
  blocks: readonly SemanticFieldBlock[],
): {
  edges: SemanticGraphEdge[];
  truncated: boolean;
} {
  if (!state.focus || state.dax === "off" || !xray.objects.has(state.focus)) {
    return { edges: [], truncated: false };
  }
  const transitive = state.dax === "transitive";
  const upstream = xrayImpact(xray, state.focus, "dependsOn", transitive);
  const downstream = xrayImpact(xray, state.focus, "usedBy", transitive);
  const visible = new Set([
    state.focus,
    ...upstream.keys,
    ...downstream.keys,
  ]);
  const edges: SemanticGraphEdge[] = [];
  for (const [consumer, references] of xray.dependsOn) {
    if (!visible.has(consumer)) continue;
    for (const reference of references) {
      if (!visible.has(reference)) continue;
      const source = objectPoint(reference, xray, tableRows, blocks);
      const target = objectPoint(consumer, xray, tableRows, blocks);
      if (!source || !target) continue;
      const tone =
        consumer === state.focus || upstream.keys.has(consumer)
          ? "upstream"
          : "downstream";
      edges.push({
        key: `dax\u0000${reference}\u0000${consumer}`,
        source: source.point,
        target: target.point,
        relation: "DAX reference",
        kind: "dax",
        tone,
        collapsedEndpoint: source.collapsed || target.collapsed,
      });
      if (edges.length >= OBJECT_LINEAGE_LIMITS.maxDaxEdges) {
        return { edges, truncated: true };
      }
    }
  }
  return { edges, truncated: false };
}

export function buildSemanticObjectGraph({
  item,
  tables,
  xray,
  state,
  items,
  edges,
  schema,
}: {
  item: Item;
  tables: readonly ModelTableSchema[];
  xray: SemanticModelXRay;
  state: ObjectLineageState;
  items: readonly Item[];
  edges: readonly Edge[];
  schema?: Record<string, ModelTableSchema[]>;
}): SemanticObjectGraph {
  const diagnosticStartedAt = diagnosticStart();
  const tableRows = semanticTableRows(tables);
  const blocks = fieldBlocks(tables, xray, state);
  const { sourceNodes, consumerNodes, sourceEdges, itemEdges } = itemNodes(
    item,
    tables,
    tableRows,
    items,
    edges,
    schema,
  );
  const dax = daxEdges(xray, state, tableRows, blocks);
  const modelNode: SemanticItemNode = {
    key: modelObjectKey(item.fabricId),
    itemId: item.fabricId,
    label: item.displayName,
    subtitle: `${tables.length} tables, ${xray.measureCount} measures, ${xray.columnCount} columns`,
    x: SEMANTIC_GRAPH_LAYOUT.modelX,
    y: SEMANTIC_GRAPH_LAYOUT.modelY,
    width: SEMANTIC_GRAPH_LAYOUT.modelWidth,
    height: SEMANTIC_GRAPH_LAYOUT.itemNodeHeight,
  };
  const height = Math.max(
    540,
    (tableRows.at(-1)?.y ?? 0) +
      SEMANTIC_GRAPH_LAYOUT.tableRowHeight +
      80,
    ...blocks.map((block) => block.y + block.height + 80),
    ...consumerNodes.map((node) => node.y + node.height + 80),
  );
  const result: SemanticObjectGraph = {
    tableRows,
    blocks,
    sourceNodes,
    consumerNodes,
    modelNode,
    edges: [...sourceEdges, ...dax.edges, ...itemEdges],
    width: 1600,
    height,
    renderedFieldRows: blocks.reduce(
      (total, block) => total + block.fields.length,
      0,
    ),
    daxEdgeCount: dax.edges.length,
    daxEdgesTruncated: dax.truncated,
  };
  recordDiagnostic("atlas.object-lineage.build", diagnosticStartedAt);
  return result;
}

export function semanticTableGeometry(
  tables: readonly ModelTableSchema[],
) {
  const rows = semanticTableRows(tables);
  return rows.map((row) => {
    const table = tables.find(
      (entry) => normalizeObjectName(entry.name) === row.key,
    )!;
    return {
      key: row.key,
      anchorY: row.y,
      height: semanticBlockHeight(table),
    };
  });
}

export function semanticTableKey(table: ModelTableSchema): string {
  return tableObjectKey(table.name);
}
