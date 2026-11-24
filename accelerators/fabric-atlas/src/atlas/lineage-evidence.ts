import {
  buildItemRelationsGraph,
  compareItemRelationsWithLineage,
  itemRelationsNodeKey,
  type ItemRelationsComparisonStatus,
  type ItemRelationsEvidence,
  type ItemRelationsGraph,
  type ItemRelationsGraphEdge,
  type ItemRelationsLineageComparison,
} from "./item-relations-evidence";
import type { AtlasChange, HistoricalSnapshot } from "./history";
import { compareSnapshots } from "./history";
import { lineageEdgeKey, normalizeLineageEdges, type StagedLayout } from "./lineage";
import type { Edge, Item } from "./model";

// Unified, read-only view of lineage evidence by source. Atlas snapshot edges
// stay authoritative; Item Relations API (Beta) edges stay out of persisted
// snapshot lineage. The Map uses a transient projection for Preview layout.

export type RelationshipAgreement =
  | "conflict"
  | "agree"
  | "unverified"
  | "preview-only"
  | "cross-workspace"
  | "not-lineage"
  | "snapshot-only"
  | "not-covered"
  | "snapshot";

export const RELATIONSHIP_AGREEMENT_ORDER: readonly RelationshipAgreement[] = [
  "conflict",
  "unverified",
  "preview-only",
  "cross-workspace",
  "agree",
  "snapshot-only",
  "not-covered",
  "not-lineage",
  "snapshot",
];

export const RELATIONSHIP_AGREEMENT_LABEL: Record<
  RelationshipAgreement,
  string
> = {
  conflict: "Direction differs",
  agree: "Sources agree",
  unverified: "Direction unverified",
  "preview-only": "Item Relations only",
  "cross-workspace": "Cross-workspace",
  "not-lineage": "Visibility only",
  "snapshot-only": "Atlas snapshot only",
  "not-covered": "No Preview coverage",
  snapshot: "Not compared",
};

export interface RelationshipEndpoint {
  key: string;
  id: string;
  workspaceId: string;
  workspaceName?: string;
  displayName: string;
  itemType?: string;
  inSnapshot: boolean;
  isLocal: boolean;
}

export interface PreviewRelationshipEvidence {
  edge: ItemRelationsGraphEdge;
  status: ItemRelationsComparisonStatus;
}

export interface RelationshipEvidence {
  /** Unordered endpoint pair, stable across selection and source changes. */
  id: string;
  source: RelationshipEndpoint;
  target: RelationshipEndpoint;
  agreement: RelationshipAgreement;
  crossWorkspace: boolean;
  authoritative: Edge[];
  preview: PreviewRelationshipEvidence[];
}

export interface LineageEvidenceModel {
  relationships: RelationshipEvidence[];
  byId: ReadonlyMap<string, RelationshipEvidence>;
  counts: Record<RelationshipAgreement, number>;
  /** Normalized source-to-consumer Atlas snapshot edges. */
  authoritativeEdges: Edge[];
  previewGraph?: ItemRelationsGraph;
  comparison?: ItemRelationsLineageComparison;
}

export interface LineageEvidenceInput {
  items: readonly Item[];
  edges: readonly Edge[];
  workspaceId: string;
  workspaceName?: string;
  evidence?: ItemRelationsEvidence | null;
}

export function relationshipPairId(leftKey: string, rightKey: string): string {
  return leftKey <= rightKey
    ? `${leftKey}~${rightKey}`
    : `${rightKey}~${leftKey}`;
}

function agreementFor(
  authoritative: readonly Edge[],
  preview: readonly PreviewRelationshipEvidence[],
  hasEvidence: boolean,
  authoritativeOnly: ReadonlySet<string>,
): RelationshipAgreement {
  const statuses = new Set(preview.map((entry) => entry.status));
  if (statuses.has("direction-conflict")) return "conflict";
  if (statuses.has("matching")) return "agree";
  if (statuses.has("unverified-direction")) return "unverified";
  if (statuses.has("preview-only")) return "preview-only";
  if (statuses.has("cross-workspace")) return "cross-workspace";
  if (authoritative.length === 0) return "not-lineage";
  if (!hasEvidence) return "snapshot";
  return authoritative.some((edge) =>
    authoritativeOnly.has(lineageEdgeKey(edge)),
  )
    ? "snapshot-only"
    : "not-covered";
}

function emptyCounts(): Record<RelationshipAgreement, number> {
  return Object.fromEntries(
    RELATIONSHIP_AGREEMENT_ORDER.map((agreement) => [agreement, 0]),
  ) as Record<RelationshipAgreement, number>;
}

/**
 * Groups Atlas snapshot lineage and optional Item Relations evidence by
 * endpoint pair. Snapshot edges are normalized from source to consumer first;
 * Preview edges keep their own orientation and comparison status.
 */
export function buildLineageEvidence(
  input: LineageEvidenceInput,
): LineageEvidenceModel {
  const workspaceId = input.workspaceId.toLowerCase();
  const items = [...input.items];
  const authoritativeEdges = normalizeLineageEdges(items, [...input.edges]);
  const evidence =
    input.evidence && input.evidence.workspaceId === workspaceId
      ? input.evidence
      : undefined;
  const previewGraph = evidence
    ? buildItemRelationsGraph(evidence, {
        localItems: items,
        workspaceName: input.workspaceName,
      })
    : undefined;
  const comparison = previewGraph
    ? compareItemRelationsWithLineage(previewGraph, authoritativeEdges)
    : undefined;
  const authoritativeOnly = new Set(comparison?.authoritativeOnly ?? []);
  const itemByLowerId = new Map(
    items.map((item) => [item.fabricId.toLowerCase(), item]),
  );
  const previewNodes = new Map(
    (previewGraph?.nodes ?? []).map((node) => [node.key, node]),
  );

  const endpoint = (key: string): RelationshipEndpoint => {
    const node = previewNodes.get(key);
    const separator = key.indexOf(":");
    const endpointWorkspaceId = node?.workspaceId ?? key.slice(0, separator);
    const id = node?.id ?? key.slice(separator + 1);
    const isLocal = endpointWorkspaceId === workspaceId;
    const item = isLocal ? itemByLowerId.get(id) : undefined;
    return {
      key,
      id: item?.fabricId ?? id,
      workspaceId: endpointWorkspaceId,
      workspaceName: isLocal
        ? input.workspaceName ?? node?.workspaceName
        : node?.workspaceName,
      displayName: item?.displayName ?? node?.displayName ?? id,
      itemType: item?.itemType ?? node?.itemType,
      inSnapshot: Boolean(item),
      isLocal,
    };
  };

  const groups = new Map<
    string,
    {
      sourceKey: string;
      targetKey: string;
      authoritative: Edge[];
      preview: PreviewRelationshipEvidence[];
    }
  >();
  const group = (sourceKey: string, targetKey: string) => {
    const id = relationshipPairId(sourceKey, targetKey);
    let current = groups.get(id);
    if (!current) {
      current = { sourceKey, targetKey, authoritative: [], preview: [] };
      groups.set(id, current);
    }
    return current;
  };

  for (const edge of authoritativeEdges) {
    group(
      itemRelationsNodeKey(workspaceId, edge.source),
      itemRelationsNodeKey(workspaceId, edge.target),
    ).authoritative.push(edge);
  }
  for (const edge of previewGraph?.edges ?? []) {
    const status = comparison?.edges.get(edge.id);
    if (!status) continue;
    group(edge.sourceKey, edge.targetKey).preview.push({ edge, status });
  }

  const counts = emptyCounts();
  const relationships = [...groups.entries()].map(([id, entry]) => {
    const source = endpoint(entry.sourceKey);
    const target = endpoint(entry.targetKey);
    const agreement = agreementFor(
      entry.authoritative,
      entry.preview,
      Boolean(evidence),
      authoritativeOnly,
    );
    counts[agreement] += 1;
    return {
      id,
      source,
      target,
      agreement,
      crossWorkspace: !source.isLocal || !target.isLocal,
      authoritative: entry.authoritative,
      preview: entry.preview,
    } satisfies RelationshipEvidence;
  });
  const rank = new Map(
    RELATIONSHIP_AGREEMENT_ORDER.map((agreement, index) => [agreement, index]),
  );
  relationships.sort(
    (left, right) =>
      rank.get(left.agreement)! - rank.get(right.agreement)! ||
      left.source.displayName.localeCompare(right.source.displayName) ||
      left.target.displayName.localeCompare(right.target.displayName) ||
      left.id.localeCompare(right.id),
  );

  return {
    relationships,
    byId: new Map(relationships.map((entry) => [entry.id, entry])),
    counts,
    authoritativeEdges,
    previewGraph,
    comparison,
  };
}

export function relationshipMatches(
  relationship: RelationshipEvidence,
  query: string,
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    relationship.source.displayName,
    relationship.target.displayName,
    relationship.source.workspaceName ?? "",
    relationship.target.workspaceName ?? "",
    ...relationship.authoritative.map((edge) => edge.relation),
    ...relationship.preview.map((entry) => entry.edge.relation.relationType),
  ].some((value) => value.toLowerCase().includes(normalized));
}

/** Preview graph edges include agreement with Atlas, but not visibility or self relations. */
export function isDrawnPreviewEdge(entry: PreviewRelationshipEvidence): boolean {
  return (
    entry.status !== "not-lineage" &&
    !entry.edge.selfRelation
  );
}

export interface PreviewLaneNode {
  key: string;
  endpoint: RelationshipEndpoint;
  x: number;
  y: number;
  /** 0 for endpoints next to the snapshot, then one column per expansion hop. */
  column: number;
  /** Stored Beta neighbours outside the snapshot that are still hidden. */
  hiddenNeighbors: number;
  expanded: boolean;
}

export interface PreviewExpansion {
  key: string;
  endpoint: RelationshipEndpoint;
  revealed: number;
  withheld: number;
}

export interface PreviewOverlay {
  edges: Array<{
    relationshipId: string;
    entry: PreviewRelationshipEvidence;
    sourceKey: string;
    targetKey: string;
  }>;
  laneNodes: PreviewLaneNode[];
  laneWidth: number;
  laneHeight: number;
  /** Applied expansions in order; unknown or hidden keys are ignored. */
  expansions: PreviewExpansion[];
}

export interface PreviewOverlayOptions {
  /** Snapshot item IDs currently placed by the staged layout. */
  visibleItemIds: ReadonlySet<string>;
  laneX: number;
  nodeWidth: number;
  rowGap: number;
  top: number;
  /** Horizontal distance between lane columns. */
  columnGap?: number;
  /** Composite keys of expanded lane nodes, in the order they were expanded. */
  expandedKeys?: readonly string[];
  maxRevealPerExpansion?: number;
  maxLaneNodes?: number;
}

export const PREVIEW_MAX_REVEAL_PER_EXPANSION = 12;
export const PREVIEW_MAX_LANE_NODES = 60;

function endpointOrder(left: RelationshipEndpoint, right: RelationshipEndpoint): number {
  return (
    (left.workspaceName ?? left.workspaceId).localeCompare(
      right.workspaceName ?? right.workspaceId,
    ) ||
    left.displayName.localeCompare(right.displayName) ||
    left.key.localeCompare(right.key)
  );
}

/**
 * Places endpoints that are not in the snapshot in lanes to the right of the
 * staged layout. Column 0 holds endpoints next to visible snapshot items;
 * expanding a lane node reveals its other stored neighbours in the next
 * column, appended below existing nodes so nothing already shown moves.
 * Expansion only reads persisted evidence and is bounded per step and in
 * total. Snapshot node positions are never changed.
 */
export function buildPreviewOverlay(
  model: LineageEvidenceModel,
  workspaceId: string,
  options: PreviewOverlayOptions,
): PreviewOverlay {
  const visibleSnapshotKeys = new Set(
    [...options.visibleItemIds].map((id) => itemRelationsNodeKey(workspaceId, id)),
  );
  const maxReveal = options.maxRevealPerExpansion ?? PREVIEW_MAX_REVEAL_PER_EXPANSION;
  const maxLane = options.maxLaneNodes ?? PREVIEW_MAX_LANE_NODES;
  const columnGap = options.columnGap ?? options.nodeWidth + 72;

  const candidates: Array<PreviewOverlay["edges"][number] & {
    endpoints: [RelationshipEndpoint, RelationshipEndpoint];
  }> = [];
  const endpoints = new Map<string, RelationshipEndpoint>();
  const neighbors = new Map<string, Set<string>>();
  for (const relationship of model.relationships) {
    for (const entry of relationship.preview) {
      if (!isDrawnPreviewEdge(entry)) continue;
      const pair = [entry.edge.sourceKey, entry.edge.targetKey].map((key) =>
        key === relationship.source.key ? relationship.source : relationship.target,
      ) as [RelationshipEndpoint, RelationshipEndpoint];
      candidates.push({
        relationshipId: relationship.id,
        entry,
        sourceKey: entry.edge.sourceKey,
        targetKey: entry.edge.targetKey,
        endpoints: pair,
      });
      for (const endpoint of pair) endpoints.set(endpoint.key, endpoint);
      const [left, right] = pair;
      neighbors.set(left.key, (neighbors.get(left.key) ?? new Set()).add(right.key));
      neighbors.set(right.key, (neighbors.get(right.key) ?? new Set()).add(left.key));
    }
  }

  const lane = new Map<string, { column: number; row: number }>();
  const rowsPerColumn: number[] = [];
  const place = (key: string, column: number) => {
    const row = rowsPerColumn[column] ?? 0;
    rowsPerColumn[column] = row + 1;
    lane.set(key, { column, row });
  };
  const isOutside = (key: string) => endpoints.get(key)?.inSnapshot === false;

  const firstColumn = [...endpoints.values()]
    .filter(
      (endpoint) =>
        !endpoint.inSnapshot &&
        [...(neighbors.get(endpoint.key) ?? [])].some((neighbor) =>
          visibleSnapshotKeys.has(neighbor),
        ),
    )
    .sort(endpointOrder)
    .slice(0, maxLane);
  for (const endpoint of firstColumn) place(endpoint.key, 0);

  const expansions: PreviewExpansion[] = [];
  const expanded = new Set<string>();
  for (const key of options.expandedKeys ?? []) {
    const origin = lane.get(key);
    if (!origin || expanded.has(key)) continue;
    expanded.add(key);
    const hidden = [...(neighbors.get(key) ?? [])]
      .filter((neighbor) => isOutside(neighbor) && !lane.has(neighbor))
      .map((neighbor) => endpoints.get(neighbor)!)
      .sort(endpointOrder);
    const room = Math.max(0, Math.min(maxReveal, maxLane - lane.size));
    for (const endpoint of hidden.slice(0, room)) place(endpoint.key, origin.column + 1);
    expansions.push({
      key,
      endpoint: endpoints.get(key)!,
      revealed: Math.min(room, hidden.length),
      withheld: Math.max(0, hidden.length - room),
    });
  }

  const shown = (endpoint: RelationshipEndpoint) =>
    endpoint.inSnapshot ? visibleSnapshotKeys.has(endpoint.key) : lane.has(endpoint.key);
  const edges = candidates
    .filter((candidate) => candidate.endpoints.every(shown))
    .map(({ relationshipId, entry, sourceKey, targetKey }) => ({
      relationshipId,
      entry,
      sourceKey,
      targetKey,
    }));

  const laneNodes: PreviewLaneNode[] = [...lane.entries()].map(([key, slot]) => ({
    key,
    endpoint: endpoints.get(key)!,
    x: options.laneX + slot.column * columnGap,
    y: options.top + slot.row * options.rowGap,
    column: slot.column,
    hiddenNeighbors: [...(neighbors.get(key) ?? [])].filter(
      (neighbor) => isOutside(neighbor) && !lane.has(neighbor),
    ).length,
    expanded: expanded.has(key),
  }));
  const columns = rowsPerColumn.length;
  return {
    edges,
    laneNodes,
    laneWidth: columns > 0 ? (columns - 1) * columnGap + options.nodeWidth + 96 : 0,
    laneHeight:
      columns > 0 ? options.top + Math.max(...rowsPerColumn) * options.rowGap : 0,
    expansions,
  };
}

/** Preview ranks follow normalized API edges, never Atlas item-type stages. */
export function layoutPreviewGraph(
  items: readonly Item[],
  overlay: PreviewOverlay | undefined,
  workspaceId: string,
  { nodeWidth, nodeHeight, columnGap, rowGap }: {
    nodeWidth: number; nodeHeight: number; columnGap: number; rowGap: number;
  },
  model?: LineageEvidenceModel,
): StagedLayout {
  const nodes = new Map(items.map((item) => [
    itemRelationsNodeKey(workspaceId, item.fabricId), { id: item.fabricId, label: item.displayName },
  ]));
  for (const node of overlay?.laneNodes ?? []) nodes.set(node.key, { id: node.key, label: node.endpoint.displayName });
  // Reserve positions for stored neighbours before expansion, including upstream neighbours.
  for (const node of model?.previewGraph?.nodes ?? []) {
    if (!node.inSnapshot) nodes.set(node.key, { id: node.key, label: node.displayName ?? node.id });
  }
  const outgoing = new Map<string, string[]>();
  const incoming = new Map([...nodes.keys()].map((key) => [key, 0]));
  const rankedEdges = model
    ? model.relationships.flatMap((relationship) => relationship.preview.filter(isDrawnPreviewEdge)
      .map((entry) => ({ entry, sourceKey: entry.edge.sourceKey, targetKey: entry.edge.targetKey })))
    : overlay?.edges ?? [];
  for (const edge of rankedEdges) {
    // A cycle cannot run entirely left-to-right; keep its evidence without using it to rank nodes.
    if (edge.entry.edge.inCycle || !nodes.has(edge.sourceKey) || !nodes.has(edge.targetKey)) continue;
    outgoing.set(edge.sourceKey, [...(outgoing.get(edge.sourceKey) ?? []), edge.targetKey]);
    incoming.set(edge.targetKey, (incoming.get(edge.targetKey) ?? 0) + 1);
  }
  const ordered = [...nodes.keys()].sort((left, right) =>
    nodes.get(left)!.label.localeCompare(nodes.get(right)!.label) || left.localeCompare(right));
  const ranks = new Map(ordered.map((key) => [key, 0]));
  const queue = ordered.filter((key) => incoming.get(key) === 0);
  for (let head = 0; head < queue.length; head++) {
    const key = queue[head];
    for (const target of outgoing.get(key) ?? []) {
      ranks.set(target, Math.max(ranks.get(target)!, ranks.get(key)! + 1));
      incoming.set(target, incoming.get(target)! - 1);
      if (incoming.get(target) === 0) queue.push(target);
    }
  }
  const rows = new Map<number, number>();
  const positions: StagedLayout["positions"] = new Map();
  for (const key of ordered) {
    const rank = ranks.get(key)!;
    const row = rows.get(rank) ?? 0;
    rows.set(rank, row + 1);
    positions.set(nodes.get(key)!.id, { x: 28 + rank * columnGap, y: 62 + row * rowGap });
  }
  const stageCount = Math.max(1, ...ranks.values()) + 1;
  return {
    positions, groups: [], stageCount,
    width: 56 + (stageCount - 1) * columnGap + nodeWidth,
    height: Math.max(520, 90 + (Math.max(1, ...rows.values()) - 1) * rowGap + nodeHeight),
  };
}

export interface LineageChangeRow {
  change: AtlasChange;
  sourceName: string;
  targetName: string;
  relation: string;
}

function isEdge(value: unknown): value is Edge {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Edge).source === "string" &&
    typeof (value as Edge).target === "string"
  );
}

/** Lineage-only snapshot changes, labelled with the names each snapshot knew. */
export function lineageChangesBetween(
  previous: HistoricalSnapshot,
  current: HistoricalSnapshot,
): LineageChangeRow[] {
  const names = new Map<string, string>();
  for (const item of previous.catalog.items) {
    names.set(item.fabricId, item.displayName);
  }
  for (const item of current.catalog.items) {
    names.set(item.fabricId, item.displayName);
  }
  return compareSnapshots(previous, current)
    .filter((change) => change.domain === "lineage")
    .map((change) => {
      const edge = isEdge(change.after)
        ? change.after
        : isEdge(change.before)
          ? change.before
          : undefined;
      const [labelSource = change.label, labelTarget = ""] =
        change.label.split(" → ");
      const sourceId = edge?.source ?? labelSource;
      const targetId = edge?.target ?? labelTarget;
      const relation =
        edge?.relation ??
        current.catalog.edges.find(
          (candidate) =>
            candidate.source === sourceId && candidate.target === targetId,
        )?.relation ??
        "";
      return {
        change,
        sourceName: names.get(sourceId) ?? sourceId,
        targetName: names.get(targetId) ?? targetId,
        relation,
      };
    });
}
