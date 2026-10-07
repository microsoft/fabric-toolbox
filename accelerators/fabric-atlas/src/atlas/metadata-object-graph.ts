import {
  metadataObjectKindLabel,
  metadataObjectRefKey,
  verifiedMetadataEdgesForItem,
} from "./catalog-objects";
import type {
  MetadataObjectKind,
  MetadataObjectLineageEdge,
  MetadataObjectRef,
} from "./item-metadata";
import { typeMeta, type Item } from "./model";

const OBJECT_ROW_GAP = 100;
export const MAX_VISIBLE_OBJECT_EDGES = 250;

export interface ObjectGraphNode {
  id: string;
  label: string;
  subtitle: string;
  code: string;
  color: string;
  table?: string;
  itemId?: string;
  kind: "source" | "table" | "field" | "owner" | "consumer" | "metadata";
  metadataRef?: MetadataObjectRef;
  collapsedItemGroup?: boolean;
  objectCount?: number;
  x: number;
  y: number;
}

export interface ObjectGraphEdge {
  source: string;
  target: string;
  relation: string;
  structural?: boolean;
}

export interface ObjectGraph {
  nodes: ObjectGraphNode[];
  edges: ObjectGraphEdge[];
  width: number;
  height: number;
  table?: string;
  stageLabels: string[];
  verifiedMetadata: boolean;
  truncated: boolean;
}

export interface MetadataObjectGraphFilters {
  query?: string;
  sourceItemId?: string;
  tableName?: string;
  objectKind?: MetadataObjectKind | "all";
}

export interface ObjectItemGroup {
  itemId: string;
  label: string;
  objectCount: number;
}

const METADATA_NATIVE_ITEM_TYPES = new Set([
  "Ontology",
  "GraphModel",
  "DataAgent",
  "KQLDatabase",
]);

export function shouldUseVerifiedMetadataGraph(
  item: Item | undefined,
  schemaCount: number,
  edgeCount: number,
): boolean {
  return (
    edgeCount > 0 &&
    (!!item &&
      (schemaCount === 0 || METADATA_NATIVE_ITEM_TYPES.has(item.itemType)))
  );
}

function objectNodeItemId(node: ObjectGraphNode, activeItemId: string): string {
  return node.itemId ?? activeItemId;
}

export function objectItemGroups(
  graph: ObjectGraph,
  activeItemId: string,
  itemById: ReadonlyMap<string, Item>,
): ObjectItemGroup[] {
  const counts = new Map<string, number>();
  for (const node of graph.nodes) {
    const itemId = objectNodeItemId(node, activeItemId);
    if (!itemId) continue;
    counts.set(itemId, (counts.get(itemId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([itemId, objectCount]) => ({
      itemId,
      objectCount,
      label: itemById.get(itemId)?.displayName ?? itemId,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function groupObjectGraphByItem(
  graph: ObjectGraph,
  activeItemId: string,
  itemById: ReadonlyMap<string, Item>,
  expandedItemIds: ReadonlySet<string>,
): ObjectGraph {
  const groupedNodes = new Map<string, ObjectGraphNode[]>();
  const ungroupedNodes: ObjectGraphNode[] = [];
  for (const node of graph.nodes) {
    const itemId = objectNodeItemId(node, activeItemId);
    if (!itemId) {
      ungroupedNodes.push(node);
      continue;
    }
    groupedNodes.set(itemId, [...(groupedNodes.get(itemId) ?? []), node]);
  }

  const replacementByNodeId = new Map<string, string>();
  const nodes = [...ungroupedNodes];
  for (const [itemId, itemNodes] of groupedNodes) {
    if (expandedItemIds.has(itemId)) {
      nodes.push(...itemNodes);
      continue;
    }
    const item = itemById.get(itemId);
    const meta = item ? typeMeta(item.itemType) : undefined;
    const groupId = `item-group:${itemId}`;
    for (const node of itemNodes) replacementByNodeId.set(node.id, groupId);
    nodes.push({
      id: groupId,
      label: item?.displayName ?? itemId,
      subtitle: `${itemNodes.length} ${itemNodes.length === 1 ? "object" : "objects"} · collapsed`,
      code: meta?.code ?? "IT",
      color: meta?.color ?? "var(--color-primary)",
      itemId,
      kind: "owner",
      collapsedItemGroup: true,
      objectCount: itemNodes.length,
      x: Math.min(...itemNodes.map((node) => node.x)),
      y: Math.min(...itemNodes.map((node) => node.y)),
    });
  }

  const edgeKeys = new Set<string>();
  const edges = graph.edges.flatMap((edge) => {
    const source = replacementByNodeId.get(edge.source) ?? edge.source;
    const target = replacementByNodeId.get(edge.target) ?? edge.target;
    const key = `${source}\u0000${target}\u0000${edge.relation}`;
    if (source === target || edgeKeys.has(key)) return [];
    edgeKeys.add(key);
    return [{ ...edge, source, target }];
  });

  return { ...graph, nodes, edges };
}

function metadataNodeStyle(kind: MetadataObjectKind): {
  code: string;
  color: string;
} {
  if (kind === "sourceObject" || kind === "sourceElement") {
    return { code: "SO", color: "var(--color-object-source)" };
  }
  if (kind === "sourceField") {
    return { code: "SF", color: "var(--color-object-column)" };
  }
  if (kind === "ontologyRelationship" || kind === "graphEdge") {
    return { code: "RL", color: "var(--color-lineage-downstream)" };
  }
  if (
    kind === "ontologyProperty" ||
    kind === "graphProperty" ||
    kind === "dataAgentElement"
  ) {
    return { code: "PR", color: "var(--color-object-column)" };
  }
  if (kind === "dataAgentSource") {
    return { code: "DA", color: "var(--color-primary)" };
  }
  if (kind === "kqlFunction") {
    return { code: "FN", color: "var(--color-primary)" };
  }
  if (kind === "kqlMaterializedView") {
    return { code: "MV", color: "var(--color-lineage-upstream)" };
  }
  if (kind === "graphNode") {
    return { code: "GN", color: "var(--color-primary)" };
  }
  if (kind === "ontologyContextualization") {
    return { code: "CX", color: "var(--color-status-warning)" };
  }
  return { code: "EN", color: "var(--color-primary)" };
}

export function buildMetadataObjectGraph(
  edges: readonly MetadataObjectLineageEdge[],
  selectedItemId: string,
  itemById: ReadonlyMap<string, Item>,
  filters: MetadataObjectGraphFilters = {},
): ObjectGraph {
  const selectedEdges = verifiedMetadataEdgesForItem(edges, selectedItemId);
  const query = filters.query?.trim().toLowerCase() ?? "";
  const sourceItemId = filters.sourceItemId ?? "all";
  const tableName = filters.tableName ?? "all";
  const objectKind = filters.objectKind ?? "all";
  const queryMatches = (reference: MetadataObjectRef) =>
    !query ||
    reference.name.toLowerCase().includes(query) ||
    reference.id.toLowerCase().includes(query) ||
    metadataObjectKindLabel(reference.kind).toLowerCase().includes(query) ||
    (reference.tableName ?? "").toLowerCase().includes(query) ||
    (reference.parentPath ?? []).some((part) =>
      part.toLowerCase().includes(query),
    );
  const filtered = selectedEdges.filter((edge) => {
    const refs = [edge.source, edge.target];
    return (
      (sourceItemId === "all" ||
        refs.some((reference) => reference.itemId === sourceItemId)) &&
      (tableName === "all" ||
        refs.some((reference) => reference.tableName === tableName)) &&
      (objectKind === "all" ||
        refs.some((reference) => reference.kind === objectKind)) &&
      (!query || refs.some(queryMatches))
    );
  });
  const ordered = [...filtered].sort((left, right) =>
    [
      metadataObjectRefKey(left.source),
      metadataObjectRefKey(left.target),
      left.relation,
    ]
      .join("\u0001")
      .localeCompare(
        [
          metadataObjectRefKey(right.source),
          metadataObjectRefKey(right.target),
          right.relation,
        ].join("\u0001"),
      ),
  );
  const visibleEdges = ordered.slice(0, MAX_VISIBLE_OBJECT_EDGES);
  const refs = new Map<string, MetadataObjectRef>();
  const graphEdges: ObjectGraphEdge[] = [];
  for (const edge of visibleEdges) {
    const source = metadataObjectRefKey(edge.source);
    const target = metadataObjectRefKey(edge.target);
    refs.set(source, edge.source);
    refs.set(target, edge.target);
    graphEdges.push({ source, target, relation: edge.relation });
  }

  const incomingCount = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const id of refs.keys()) incomingCount.set(id, 0);
  for (const edge of graphEdges) {
    outgoing.set(edge.source, [
      ...(outgoing.get(edge.source) ?? []),
      edge.target,
    ]);
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
  }
  const rank = new Map<string, number>();
  const queue = [...refs.keys()]
    .filter((id) => (incomingCount.get(id) ?? 0) === 0)
    .sort();
  for (const id of queue) rank.set(id, 0);
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    for (const target of [...(outgoing.get(current) ?? [])].sort()) {
      rank.set(
        target,
        Math.max(rank.get(target) ?? 0, (rank.get(current) ?? 0) + 1),
      );
      incomingCount.set(target, (incomingCount.get(target) ?? 1) - 1);
      if (incomingCount.get(target) === 0) queue.push(target);
    }
  }
  for (const id of refs.keys()) {
    if (!rank.has(id)) rank.set(id, 0);
  }
  const byRank = new Map<number, string[]>();
  for (const id of refs.keys()) {
    const value = rank.get(id) ?? 0;
    byRank.set(value, [...(byRank.get(value) ?? []), id]);
  }
  for (const ids of byRank.values()) ids.sort();
  const maxRank = Math.max(0, ...rank.values());
  const nodes = [...refs.entries()].map(([id, reference]) => {
    const column = rank.get(id) ?? 0;
    const row = byRank.get(column)?.indexOf(id) ?? 0;
    const style = metadataNodeStyle(reference.kind);
    const context = [
      metadataObjectKindLabel(reference.kind),
      reference.tableName,
      itemById.get(reference.itemId)?.displayName ?? reference.itemId,
    ].filter(Boolean);
    return {
      id,
      label: reference.name,
      subtitle: context.join(" · "),
      code: style.code,
      color: style.color,
      table: reference.tableName,
      itemId: reference.itemId,
      kind: "metadata" as const,
      metadataRef: reference,
      x: 24 + column * 282,
      y: 58 + row * OBJECT_ROW_GAP,
    };
  });
  const maxRows = Math.max(
    1,
    ...[...byRank.values()].map((ids) => ids.length),
  );
  const defaultLabels = [
    "Physical sources",
    "Bindings and fields",
    "Discovered objects",
    "Consumers",
  ];
  return {
    nodes,
    edges: graphEdges,
    width: Math.max(1080, 48 + (maxRank + 1) * 282),
    height: Math.max(520, 110 + maxRows * OBJECT_ROW_GAP),
    table: tableName === "all" ? undefined : tableName,
    stageLabels: Array.from(
      { length: maxRank + 1 },
      (_, index) => defaultLabels[index] ?? `Stage ${index + 1}`,
    ),
    verifiedMetadata: selectedEdges.length > 0,
    truncated: ordered.length > visibleEdges.length,
  };
}
