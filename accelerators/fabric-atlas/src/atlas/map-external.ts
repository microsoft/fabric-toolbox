import {
  EXACT_PATH,
  EXTERNAL_NODE_PREFIX,
  externalNodeId,
  mergeLineageEdges,
  type ExternalDatasetRecord,
  type ExternalEdgeRecord,
  type ExternalLineage,
} from './external-lineage';
import { createLineageIndex, getLineageImpact } from './lineage';
import type { Edge, Item } from './model';
import { platformOf } from './openlineage';

/**
 * Map overlay for imported OpenLineage files. Pure geometry: the Map draws an
 * "External" lane on the left with jobs and the datasets that are not exactly
 * the same as a Fabric item, and link points on the Fabric items.
 */
export type ExternalNodeKind = 'dataset' | 'job';

export interface ExternalMapNode {
  key: string;
  kind: ExternalNodeKind;
  label: string;
  namespace: string;
  platform: string;
  x: number;
  y: number;
  datasetId?: string;
  linkedItemId?: string;
}

export interface ExternalMapEdge {
  key: string;
  kind: 'openlineage' | 'link';
  source: string;
  target: string;
  /** Job lane key of an OpenLineage edge. */
  jobKey?: string;
  datasetId?: string;
}

export interface ExternalLinkBadge {
  itemId: string;
  kind: 'exact' | 'manual';
  label: string;
  datasetIds: string[];
}

export interface ExternalOverlay {
  nodes: ExternalMapNode[];
  edges: ExternalMapEdge[];
  badges: ExternalLinkBadge[];
  platforms: string[];
  /** Width reserved on the left of the Fabric graph (0 when empty). */
  width: number;
  height: number;
}

export interface ExternalOverlayOptions {
  visibleItemIds: ReadonlySet<string>;
  nodeWidth: number;
  nodeHeight: number;
  columnGap: number;
  rowGap: number;
  top: number;
  left?: number;
}

export const JOB_NODE_PREFIX = 'job:';
export const EMPTY_EXTERNAL_OVERLAY: ExternalOverlay = {
  nodes: [],
  edges: [],
  badges: [],
  platforms: [],
  width: 0,
  height: 0,
};

export function jobKeyOf(edge: Pick<ExternalEdgeRecord, 'jobNamespace' | 'jobName'>): string {
  return `${JOB_NODE_PREFIX}${edge.jobNamespace}|${edge.jobName}`;
}

export function isExactLink(ds: Pick<ExternalDatasetRecord, 'state' | 'fabricItemId' | 'linkedBy'>): boolean {
  return ds.state === 'linked' && !!ds.fabricItemId && ds.linkedBy === EXACT_PATH;
}

function isManualLink(ds: ExternalDatasetRecord): boolean {
  return ds.state === 'linked' && !!ds.fabricItemId && ds.linkedBy !== EXACT_PATH;
}

function personOf(linkedBy?: string): string {
  return linkedBy ? linkedBy.split('@')[0] : 'unknown';
}

export function buildExternalOverlay(
  lineage: ExternalLineage,
  opts: ExternalOverlayOptions,
): ExternalOverlay {
  const datasets = new Map(lineage.datasets.map((d) => [d.id, d]));
  const visible = opts.visibleItemIds;
  const lane = new Map<string, Omit<ExternalMapNode, 'x' | 'y'>>();
  const edges = new Map<string, ExternalMapEdge>();
  const badgeSets = new Map<string, Map<string, ExternalDatasetRecord>>();

  const reachable = (ds: ExternalDatasetRecord) => !isExactLink(ds) || visible.has(ds.fabricItemId!);
  const endpoint = (ds: ExternalDatasetRecord): string => {
    if (isExactLink(ds)) {
      addBadge(ds);
      return ds.fabricItemId!;
    }
    const key = `${EXTERNAL_NODE_PREFIX}${ds.id}`;
    if (!lane.has(key)) {
      lane.set(key, {
        key,
        kind: 'dataset',
        label: ds.name,
        namespace: ds.namespace,
        platform: ds.platform,
        datasetId: ds.id,
        linkedItemId: isManualLink(ds) && visible.has(ds.fabricItemId!) ? ds.fabricItemId : undefined,
      });
      if (isManualLink(ds) && visible.has(ds.fabricItemId!)) {
        addBadge(ds);
        edges.set(`link|${ds.id}`, {
          key: `link|${ds.id}`,
          kind: 'link',
          source: key,
          target: ds.fabricItemId!,
          datasetId: ds.id,
        });
      }
    }
    return key;
  };
  function addBadge(ds: ExternalDatasetRecord) {
    const set = badgeSets.get(ds.fabricItemId!) ?? new Map<string, ExternalDatasetRecord>();
    set.set(ds.id, ds);
    badgeSets.set(ds.fabricItemId!, set);
  }

  for (const e of lineage.edges) {
    const s = datasets.get(e.sourceDatasetId);
    const t = datasets.get(e.targetDatasetId);
    if (!s || !t) continue;
    if (!reachable(s) || !reachable(t)) continue;
    const jobKey = jobKeyOf(e);
    const source = endpoint(s);
    const target = endpoint(t);
    if (!lane.has(jobKey)) {
      lane.set(jobKey, {
        key: jobKey,
        kind: 'job',
        label: e.jobName,
        namespace: e.jobNamespace,
        platform: platformOf(e.jobNamespace),
      });
    }
    for (const [from, to] of [[source, jobKey], [jobKey, target]]) {
      const key = `ol|${from}|${to}`;
      if (!edges.has(key)) edges.set(key, { key, kind: 'openlineage', source: from, target: to, jobKey });
    }
  }

  if (!lane.size) return EMPTY_EXTERNAL_OVERLAY;

  // Longest-path columns inside the lane; Fabric endpoints do not count.
  const depth = new Map<string, number>([...lane.keys()].map((k) => [k, 0]));
  const laneEdges = [...edges.values()].filter((e) => e.kind === 'openlineage' && lane.has(e.source) && lane.has(e.target));
  for (let pass = 0; pass < lane.size; pass += 1) {
    let changed = false;
    for (const e of laneEdges) {
      const next = depth.get(e.source)! + 1;
      if (next > depth.get(e.target)! && next < lane.size) {
        depth.set(e.target, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const columns: Omit<ExternalMapNode, 'x' | 'y'>[][] = [];
  for (const node of lane.values()) {
    const col = depth.get(node.key)!;
    (columns[col] ??= []).push(node);
  }
  const left = opts.left ?? 28;
  const nodes: ExternalMapNode[] = [];
  let rows = 0;
  columns.forEach((column, col) => {
    column
      .sort((a, b) => a.platform.localeCompare(b.platform) || a.label.localeCompare(b.label))
      .forEach((node, row) => {
        nodes.push({ ...node, x: left + col * opts.columnGap, y: opts.top + row * opts.rowGap });
      });
    rows = Math.max(rows, column.length);
  });

  const badges: ExternalLinkBadge[] = [...badgeSets.entries()]
    .map(([itemId, set]) => {
      const list = [...set.values()].sort((a, b) => a.name.localeCompare(b.name));
      const manual = list.find(isManualLink);
      const base = manual ? `Linked · manual (${personOf(manual.linkedBy)})` : 'Linked · exact OneLake path';
      return {
        itemId,
        kind: manual ? ('manual' as const) : ('exact' as const),
        label: list.length > 1 ? `${base} +${list.length - 1}` : base,
        datasetIds: list.map((d) => d.id),
      };
    })
    .sort((a, b) => a.itemId.localeCompare(b.itemId));

  return {
    nodes,
    edges: [...edges.values()],
    badges,
    platforms: [...new Set(nodes.map((n) => n.platform))].sort(),
    width: left + (columns.length - 1) * opts.columnGap + opts.nodeWidth + left,
    height: opts.top + rows * opts.rowGap + opts.nodeHeight,
  };
}

/** External datasets (not linked to Fabric) among the ids reached by an impact traversal. */
export function externalDatasetsIn(ids: Iterable<string>, lineage: ExternalLineage): ExternalDatasetRecord[] {
  const byNode = new Map(
    lineage.datasets
      .filter((d) => externalNodeId(d).startsWith(EXTERNAL_NODE_PREFIX))
      .map((d) => [externalNodeId(d), d]),
  );
  const out: ExternalDatasetRecord[] = [];
  for (const id of ids) {
    const ds = byNode.get(id);
    if (ds) out.push(ds);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export interface ExternalImpact {
  items: Item[];
  workspaces: number;
  reports: number;
}

/** Fabric items reached downstream from external datasets, across the link points. */
export function externalDownstream(
  lineage: ExternalLineage,
  snapshot: readonly Edge[],
  datasetIds: readonly string[],
  itemById: ReadonlyMap<string, Item>,
): ExternalImpact {
  const index = createLineageIndex(mergeLineageEdges(snapshot, lineage));
  const byId = new Map(lineage.datasets.map((d) => [d.id, d]));
  const reached = new Map<string, Item>();
  for (const id of datasetIds) {
    const ds = byId.get(id);
    if (!ds) continue;
    const start = externalNodeId(ds);
    const impact = getLineageImpact(index, start);
    for (const itemId of [start, ...impact.downstream.ids]) {
      const item = itemById.get(itemId);
      if (item) reached.set(itemId, item);
    }
  }
  const items = [...reached.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  return {
    items,
    workspaces: items.length ? 1 : 0,
    reports: items.filter((i) => /report/i.test(i.itemType)).length,
  };
}

export interface ExternalImpactEntry {
  dataset: ExternalDatasetRecord;
  distance: number;
}

export interface ExternalItemImpact {
  upstream: ExternalImpactEntry[];
  downstream: ExternalImpactEntry[];
  /** OpenLineage jobs that move data between the impacted nodes. */
  jobs: string[];
}

/** Full transitive OpenLineage datasets and jobs around a Fabric item, across the link points. */
export function externalItemImpact(
  lineage: ExternalLineage,
  snapshot: readonly Edge[],
  itemId: string,
): ExternalItemImpact {
  if (!itemId || lineage.edges.length === 0) return { upstream: [], downstream: [], jobs: [] };
  const index = createLineageIndex(mergeLineageEdges(snapshot, lineage));
  const impact = getLineageImpact(index, itemId);
  const entries = (ids: Set<string>, distance: Map<string, number>) =>
    externalDatasetsIn(ids, lineage)
      .map((dataset) => ({ dataset, distance: distance.get(externalNodeId(dataset)) ?? 0 }))
      .sort((a, b) => a.distance - b.distance || a.dataset.name.localeCompare(b.dataset.name));
  const reached = new Set([itemId, ...impact.upstream.ids, ...impact.downstream.ids]);
  const byId = new Map(lineage.datasets.map((d) => [d.id, d]));
  const jobs = new Set<string>();
  for (const edge of lineage.edges) {
    const source = byId.get(edge.sourceDatasetId);
    const target = byId.get(edge.targetDatasetId);
    if (source && target && reached.has(externalNodeId(source)) && reached.has(externalNodeId(target))) {
      jobs.add(edge.jobName);
    }
  }
  return {
    upstream: entries(impact.upstream.ids, impact.upstream.distance),
    downstream: entries(impact.downstream.ids, impact.downstream.distance),
    jobs: [...jobs].sort((a, b) => a.localeCompare(b)),
  };
}