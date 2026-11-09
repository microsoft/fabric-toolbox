import type { HistoricalSnapshot } from "./history";
import {
  buildStagedLayout,
  normalizeLineageEdges,
  type StagedLayout,
} from "./lineage";
import type { Edge, Item } from "./model";

// Item-level comparison of two validated snapshots on one union graph. The
// layout depends only on the snapshot pair, so switching between the before,
// changes and after views never moves a node.

export type TimeMachineNodeState = "retained" | "added" | "removed" | "changed";
export type TimeMachineEdgeState =
  | "retained"
  | "added"
  | "removed"
  | "reversed"
  | "changed";
export type TimeMachineView = "before" | "changes" | "after";

export const TIME_MACHINE_VIEWS: readonly TimeMachineView[] = [
  "before",
  "changes",
  "after",
];

/** Item fields compared on retained nodes; descriptions and timestamps are not. */
export const TIME_MACHINE_ITEM_FIELDS = [
  "displayName",
  "itemType",
  "health",
  "ownerName",
  "ownerEmail",
  "sensitivity",
  "endorsement",
] as const;

export type TimeMachineItemField = (typeof TIME_MACHINE_ITEM_FIELDS)[number];

export interface TimeMachineNode {
  id: string;
  /** The newest known state: `after` when present, otherwise `before`. */
  item: Item;
  before?: Item;
  after?: Item;
  state: TimeMachineNodeState;
  changedFields: TimeMachineItemField[];
}

export interface TimeMachineEdge {
  key: string;
  state: TimeMachineEdgeState;
  before?: Edge;
  after?: Edge;
}

export interface LineageTimeMachine {
  fromSnapshotId: string;
  toSnapshotId: string;
  nodes: TimeMachineNode[];
  edges: TimeMachineEdge[];
  layout: StagedLayout;
  counts: {
    nodes: Record<TimeMachineNodeState, number>;
    edges: Record<TimeMachineEdgeState, number>;
  };
}

export interface TimeMachineLayoutOptions {
  nodeWidth?: number;
  nodeHeight?: number;
  columnGap?: number;
  rowGap?: number;
  componentGap?: number;
}

function normalized(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function fieldValue(item: Item, field: TimeMachineItemField): string {
  if (field === "sensitivity") {
    return normalized(item.sensitivityLabelId) || normalized(item.sensitivity);
  }
  return normalized(item[field]);
}

function edgeId(edge: Edge): string {
  return `${edge.source}\u0000${edge.target}\u0000${normalized(edge.relation)}`;
}

function pairKey(edge: Edge): string {
  return edge.source <= edge.target
    ? `${edge.source}\u0000${edge.target}`
    : `${edge.target}\u0000${edge.source}`;
}

function groupByPair(edges: readonly Edge[]): Map<string, Edge[]> {
  const groups = new Map<string, Edge[]>();
  for (const edge of edges) {
    const key = pairKey(edge);
    groups.set(key, [...(groups.get(key) ?? []), edge]);
  }
  return groups;
}

function compareEdges(
  before: readonly Edge[],
  after: readonly Edge[],
): TimeMachineEdge[] {
  const result: TimeMachineEdge[] = [];
  const beforeByPair = groupByPair(before);
  const afterByPair = groupByPair(after);
  const pairs = [...new Set([...beforeByPair.keys(), ...afterByPair.keys()])].sort();
  for (const pair of pairs) {
    const remainingBefore = [...(beforeByPair.get(pair) ?? [])];
    const remainingAfter = [...(afterByPair.get(pair) ?? [])];
    for (const edge of [...remainingBefore]) {
      const index = remainingAfter.findIndex(
        (candidate) => edgeId(candidate) === edgeId(edge),
      );
      if (index < 0) continue;
      const [match] = remainingAfter.splice(index, 1);
      remainingBefore.splice(remainingBefore.indexOf(edge), 1);
      result.push({
        key: `same\u0001${edgeId(edge)}`,
        state: !!edge.broken === !!match.broken ? "retained" : "changed",
        before: edge,
        after: match,
      });
    }
    for (const edge of remainingBefore) {
      const reversed = remainingAfter.findIndex(
        (candidate) =>
          candidate.source === edge.target && candidate.target === edge.source,
      );
      const sameDirection = remainingAfter.findIndex(
        (candidate) =>
          candidate.source === edge.source && candidate.target === edge.target,
      );
      const index = reversed >= 0 ? reversed : sameDirection;
      if (index < 0) {
        result.push({ key: `removed\u0001${edgeId(edge)}`, state: "removed", before: edge });
        continue;
      }
      const [match] = remainingAfter.splice(index, 1);
      result.push({
        key: `${reversed >= 0 ? "reversed" : "changed"}\u0001${edgeId(edge)}`,
        state: reversed >= 0 ? "reversed" : "changed",
        before: edge,
        after: match,
      });
    }
    for (const edge of remainingAfter) {
      result.push({ key: `added\u0001${edgeId(edge)}`, state: "added", after: edge });
    }
  }
  return result;
}

function emptyCounts<T extends string>(states: readonly T[]): Record<T, number> {
  return Object.fromEntries(states.map((state) => [state, 0])) as Record<T, number>;
}

/** Builds the union graph of two snapshots, ordered from older to newer. */
export function buildLineageTimeMachine(
  from: HistoricalSnapshot,
  to: HistoricalSnapshot,
  options: TimeMachineLayoutOptions = {},
): LineageTimeMachine {
  const beforeItems = new Map(from.catalog.items.map((item) => [item.fabricId, item]));
  const afterItems = new Map(to.catalog.items.map((item) => [item.fabricId, item]));
  const nodes: TimeMachineNode[] = [
    ...new Set([...beforeItems.keys(), ...afterItems.keys()]),
  ]
    .sort()
    .map((id) => {
      const before = beforeItems.get(id);
      const after = afterItems.get(id);
      const changedFields =
        before && after
          ? TIME_MACHINE_ITEM_FIELDS.filter(
              (field) => fieldValue(before, field) !== fieldValue(after, field),
            )
          : [];
      const state: TimeMachineNodeState = !before
        ? "added"
        : !after
          ? "removed"
          : changedFields.length > 0
            ? "changed"
            : "retained";
      return { id, item: after ?? before!, before, after, state, changedFields };
    });

  const beforeEdges = normalizeLineageEdges(from.catalog.items, from.catalog.edges);
  const afterEdges = normalizeLineageEdges(to.catalog.items, to.catalog.edges);
  const edges = compareEdges(beforeEdges, afterEdges);
  const unionItems = nodes.map((node) => node.item);
  const layout = buildStagedLayout(
    unionItems,
    normalizeLineageEdges(unionItems, [...beforeEdges, ...afterEdges]),
    {
      nodeWidth: options.nodeWidth,
      nodeHeight: options.nodeHeight,
      columnGap: options.columnGap,
      rowGap: options.rowGap,
      componentGap: options.componentGap,
    },
  );

  const nodeCounts = emptyCounts<TimeMachineNodeState>([
    "retained",
    "added",
    "removed",
    "changed",
  ]);
  for (const node of nodes) nodeCounts[node.state] += 1;
  const edgeCounts = emptyCounts<TimeMachineEdgeState>([
    "retained",
    "added",
    "removed",
    "reversed",
    "changed",
  ]);
  for (const edge of edges) edgeCounts[edge.state] += 1;

  return {
    fromSnapshotId: from.snapshotId,
    toSnapshotId: to.snapshotId,
    nodes,
    edges,
    layout,
    counts: { nodes: nodeCounts, edges: edgeCounts },
  };
}

export function nodeVisibleIn(node: TimeMachineNode, view: TimeMachineView): boolean {
  if (view === "before") return !!node.before;
  if (view === "after") return !!node.after;
  return true;
}

/** The edge orientation to draw in a view, or `undefined` when hidden. */
export function edgeInView(
  edge: TimeMachineEdge,
  view: TimeMachineView,
): Edge | undefined {
  if (view === "before") return edge.before;
  if (view === "after") return edge.after;
  return edge.after ?? edge.before;
}
