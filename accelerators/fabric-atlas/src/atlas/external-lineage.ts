/**
 * External lineage (v2.7): links OpenLineage datasets to Fabric items and
 * stores imported files outside the Fabric snapshot.
 *
 * Linking is exact only: a dataset whose namespace/name is a OneLake path of a
 * loaded item links automatically; everything else waits for a person. Atlas
 * never guesses on names, and a manual decision is never overwritten.
 */
import type { AtlasData, Edge, Item, ItemType } from './model';
import {
  checkOpenLineageFile,
  decodeColumns,
  encodeColumns,
  parseOpenLineage,
  type OlColumnPair,
  type OlDataset,
  type OlParseResult,
} from './openlineage';

export type LinkState = 'linked' | 'to_link' | 'external';
export const EXACT_PATH = 'exact_path';

export interface LinkDecision {
  state: LinkState;
  fabricItemId?: string;
  fabricObjectName?: string;
  /** `exact_path` for automatic links, otherwise the person who decided. */
  linkedBy?: string;
  linkedAt?: string;
}

export const LINKABLE_TYPES: ReadonlySet<ItemType> = new Set<ItemType>([
  'Lakehouse',
  'Warehouse',
  'SQLDatabase',
  'MirroredDatabase',
  'Datamart',
  'KQLDatabase',
]);

export interface FabricIndex {
  workspaceKeys: Set<string>;
  itemsByKey: Map<string, Item>;
  /** Every item by `<name>.<Type>` and id, for item-level OneLake paths. */
  typedItems: Map<string, Item>;
  tablesByItem: Map<string, Set<string>>;
}

export function buildFabricIndex(data: Pick<AtlasData, 'workspace' | 'items' | 'schema'>): FabricIndex {
  const workspaceKeys = new Set<string>();
  for (const k of [data.workspace?.fabricId, data.workspace?.displayName]) {
    if (k) workspaceKeys.add(k.trim().toLowerCase());
  }
  const itemsByKey = new Map<string, Item>();
  const typedItems = new Map<string, Item>();
  const tablesByItem = new Map<string, Set<string>>();
  for (const item of data.items) {
    typedItems.set(`${item.displayName}.${item.itemType}`.toLowerCase(), item);
    typedItems.set(item.fabricId.toLowerCase(), item);
    if (!LINKABLE_TYPES.has(item.itemType)) continue;
    itemsByKey.set(item.fabricId.toLowerCase(), item);
    itemsByKey.set(item.displayName.toLowerCase(), item);
    const tables = data.schema?.[item.fabricId];
    if (tables?.length) {
      tablesByItem.set(
        item.fabricId,
        new Set(tables.map((t) => t.name.toLowerCase())),
      );
    }
  }
  return { workspaceKeys, itemsByKey, typedItems, tablesByItem };
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Matches `abfss://<workspace>@…onelake.dfs.fabric.microsoft.com` +
 * `<item>[.Type]/Tables/[schema/]<table>` (or `/Files/…`) against loaded items.
 * A bare `<item>.<Type>` (item root, as written by the export) links any item.
 */
export function matchOneLakePath(
  namespace: string,
  name: string,
  index: FabricIndex,
): { fabricItemId: string; fabricObjectName: string } | null {
  const ns = /^abfss:\/\/([^@/]+)@([^/]+)\/?$/i.exec(namespace.trim());
  if (!ns || !ns[2].toLowerCase().endsWith('onelake.dfs.fabric.microsoft.com')) return null;
  if (!index.workspaceKeys.has(decode(ns[1]).toLowerCase())) return null;

  const parts = name.trim().replace(/^\/+|\/+$/g, '').split('/').map(decode);
  if (parts.length === 1) {
    const whole = index.typedItems.get(parts[0].toLowerCase());
    return whole ? { fabricItemId: whole.fabricId, fabricObjectName: '' } : null;
  }
  if (parts.length < 3) return null;
  const [rawItem, area, ...rest] = parts;
  const lowerArea = area.toLowerCase();
  if (lowerArea !== 'tables' && lowerArea !== 'files') return null;

  const typed = /^(.*)\.([A-Za-z]+)$/.exec(rawItem);
  const exact = index.typedItems.get(rawItem.toLowerCase());
  let item = exact && LINKABLE_TYPES.has(exact.itemType) ? exact : index.itemsByKey.get(rawItem.toLowerCase());
  if (!item && typed) {
    const candidate = index.itemsByKey.get(typed[1].toLowerCase());
    if (candidate && candidate.itemType.toLowerCase() === typed[2].toLowerCase()) item = candidate;
  }
  if (!item) return null;

  if (lowerArea === 'files') {
    return { fabricItemId: item.fabricId, fabricObjectName: `Files/${rest.join('/')}` };
  }
  if (rest.length > 2) return null;
  const objectName = rest.join('.');
  const tables = index.tablesByItem.get(item.fabricId);
  if (tables && !tables.has(objectName.toLowerCase()) && !tables.has(rest[rest.length - 1].toLowerCase())) {
    return null;
  }
  return { fabricItemId: item.fabricId, fabricObjectName: objectName };
}

/**
 * Decides the link of every dataset. Manual links and "keep external"
 * decisions in `existing` are kept as they are; automatic links are
 * recomputed so a renamed or removed table falls back to "to link".
 */
export function resolveLinks(
  datasets: readonly Pick<OlDataset, 'key' | 'namespace' | 'name'>[],
  index: FabricIndex,
  existing: ReadonlyMap<string, LinkDecision> = new Map(),
): Map<string, LinkDecision> {
  const out = new Map<string, LinkDecision>();
  for (const ds of datasets) {
    const prior = existing.get(ds.key);
    if (prior && (prior.state === 'external' || (prior.state === 'linked' && prior.linkedBy !== EXACT_PATH))) {
      out.set(ds.key, prior);
      continue;
    }
    const match = matchOneLakePath(ds.namespace, ds.name, index);
    if (match) {
      out.set(ds.key, {
        state: 'linked',
        fabricItemId: match.fabricItemId,
        fabricObjectName: match.fabricObjectName,
        linkedBy: EXACT_PATH,
        linkedAt: prior?.linkedBy === EXACT_PATH && prior.fabricItemId === match.fabricItemId ? prior.linkedAt : undefined,
      });
    } else {
      out.set(ds.key, { state: 'to_link' });
    }
  }
  return out;
}

/* --------------------------- persistence --------------------------- */

export type ExternalTable = 'OpenLineageImport' | 'ExternalDataset' | 'ExternalLineageEdge';
type Row = Record<string, unknown>;

/** Minimal storage port: Rayfin in Fabric, memory in preview and tests. */
export interface ExternalRepo {
  list(table: ExternalTable, workspaceId: string): Promise<Row[]>;
  create(table: ExternalTable, row: Row): Promise<void>;
  update(table: ExternalTable, id: string, values: Row): Promise<void>;
  remove(table: ExternalTable, id: string): Promise<void>;
}

export interface ExternalImport {
  id: string;
  /** Name given at import time (falls back to the file name). */
  label: string;
  fileName: string;
  fileHash: string;
  namespace?: string;
  platform?: string;
  importedById: string;
  importedByEmail: string;
  importedAt: string;
  eventCount: number;
  datasetCount: number;
  edgeCount: number;
  toLinkCount: number;
  status: 'accepted' | 'rejected';
  rejectReason?: string;
}

export interface ExternalDatasetRecord extends LinkDecision {
  id: string;
  namespace: string;
  name: string;
  platform: string;
  lastSeenAt: string;
}

export interface ExternalEdgeRecord {
  id: string;
  importId: string;
  sourceDatasetId: string;
  targetDatasetId: string;
  jobNamespace: string;
  jobName: string;
  lastRunState?: string;
  lastRunTime?: string;
  runId?: string;
  columns: OlColumnPair[];
  columnTruncated: boolean;
}

export interface ExternalLineage {
  imports: ExternalImport[];
  datasets: ExternalDatasetRecord[];
  edges: ExternalEdgeRecord[];
}

export const EMPTY_EXTERNAL_LINEAGE: ExternalLineage = { imports: [], datasets: [], edges: [] };

export interface ExternalActor {
  id: string;
  email: string;
}

export interface ImportFileInput {
  name: string;
  /** Name shown in Atlas; defaults to the file name without extension. */
  label?: string;
  size: number;
  text: string;
}

/** File name without its extension, used when no name is given. */
export function defaultImportLabel(fileName: string): string {
  return fileName.trim().replace(/\.(ndjson|jsonl|json)$/i, '') || fileName.trim();
}

async function sha256Hex(value: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Deterministic uuid (v5 layout) from a SHA-256 of the parts. */
export async function stableId(...parts: string[]): Promise<string> {
  const h = await sha256Hex(parts.join('\u0000'));
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function datasetIdFor(workspaceId: string, key: string): Promise<string> {
  return stableId(workspaceId.toLowerCase(), 'dataset', key);
}

const iso = (v: unknown): string | undefined => {
  if (v == null || v === '') return undefined;
  const d = new Date(v as string);
  return Number.isFinite(d.valueOf()) ? d.toISOString() : undefined;
};
const opt = (v: unknown): string | undefined => (v == null || v === '' ? undefined : String(v));
const LINK_STATES: ReadonlySet<string> = new Set(['linked', 'to_link', 'external']);

function importFromRow(r: Row): ExternalImport {
  return {
    id: String(r.id),
    label: opt(r.label) ?? defaultImportLabel(String(r.fileName ?? '')),
    fileName: String(r.fileName ?? ''),
    fileHash: String(r.fileHash ?? ''),
    namespace: opt(r.namespace),
    platform: opt(r.platform),
    importedById: String(r.importedById ?? ''),
    importedByEmail: String(r.importedByEmail ?? ''),
    importedAt: iso(r.importedAt) ?? new Date(0).toISOString(),
    eventCount: Number(r.eventCount ?? 0),
    datasetCount: Number(r.datasetCount ?? 0),
    edgeCount: Number(r.edgeCount ?? 0),
    toLinkCount: Number(r.toLinkCount ?? 0),
    status: r.status === 'rejected' ? 'rejected' : 'accepted',
    rejectReason: opt(r.rejectReason),
  };
}

function datasetFromRow(r: Row): ExternalDatasetRecord {
  const state = String(r.state ?? 'to_link');
  return {
    id: String(r.id),
    namespace: String(r.namespace ?? ''),
    name: String(r.name ?? ''),
    platform: String(r.platform ?? ''),
    state: (LINK_STATES.has(state) ? state : 'to_link') as LinkState,
    fabricItemId: opt(r.fabricItemId),
    fabricObjectName: opt(r.fabricObjectName),
    linkedBy: opt(r.linkedBy),
    linkedAt: iso(r.linkedAt),
    lastSeenAt: iso(r.lastSeenAt) ?? new Date(0).toISOString(),
  };
}

function edgeFromRow(r: Row): ExternalEdgeRecord {
  return {
    id: String(r.id),
    importId: String(r.importId),
    sourceDatasetId: String(r.sourceDatasetId),
    targetDatasetId: String(r.targetDatasetId),
    jobNamespace: String(r.jobNamespace ?? ''),
    jobName: String(r.jobName ?? ''),
    lastRunState: opt(r.lastRunState),
    lastRunTime: iso(r.lastRunTime),
    runId: opt(r.runId),
    columns: decodeColumns(opt(r.columnLineage)),
    columnTruncated: r.columnTruncated === true,
  };
}

export async function loadExternalLineage(repo: ExternalRepo, workspaceId: string): Promise<ExternalLineage> {
  const [imports, datasets, edges] = await Promise.all([
    repo.list('OpenLineageImport', workspaceId),
    repo.list('ExternalDataset', workspaceId),
    repo.list('ExternalLineageEdge', workspaceId),
  ]);
  return {
    imports: imports.map(importFromRow).sort((a, b) => b.importedAt.localeCompare(a.importedAt)),
    datasets: datasets.map(datasetFromRow),
    edges: edges.map(edgeFromRow),
  };
}

async function inBatches<T>(items: readonly T[], run: (item: T) => Promise<void>, size = 20): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(run));
  }
}

/** Deletes datasets no edge points to any more, unless a person decided on them. */
async function removeOrphans(
  repo: ExternalRepo,
  candidateIds: Iterable<string>,
  current: ExternalLineage,
  remainingEdges: readonly ExternalEdgeRecord[],
): Promise<void> {
  const used = new Set(remainingEdges.flatMap((e) => [e.sourceDatasetId, e.targetDatasetId]));
  const byId = new Map(current.datasets.map((d) => [d.id, d]));
  const orphans = [...new Set(candidateIds)].filter((id) => {
    const ds = byId.get(id);
    if (!ds || used.has(id)) return false;
    const manual = ds.state === 'external' || (ds.state === 'linked' && ds.linkedBy !== EXACT_PATH);
    return !manual;
  });
  await inBatches(orphans, (id) => repo.remove('ExternalDataset', id));
}

export interface ImportOutcome {
  importId: string;
  status: 'accepted' | 'rejected';
  replaced: boolean;
  rejectReason?: string;
  warnings: number;
}

/**
 * Imports one OpenLineage file. A file with the same name replaces the
 * previous import (its edges are deleted, then re-inserted). Rejected files
 * are recorded with zero counts so they can be seen and deleted.
 */
export async function importOpenLineageFile(
  repo: ExternalRepo,
  workspaceId: string,
  actor: ExternalActor,
  file: ImportFileInput,
  index: FabricIndex,
  current: ExternalLineage,
  now: Date = new Date(),
): Promise<ImportOutcome> {
  const importId = await stableId(workspaceId.toLowerCase(), 'import', file.name.trim().toLowerCase());
  const fileHash = await sha256Hex(file.text);
  const prior = current.imports.find((i) => i.id === importId);
  const priorEdges = current.edges.filter((e) => e.importId === importId);

  const precheck = checkOpenLineageFile(file.name, file.size);
  const parsed: OlParseResult = precheck
    ? { status: 'rejected', rejectReason: precheck, eventCount: 0, datasets: [], edges: [], jobs: [], warnings: [] }
    : parseOpenLineage(file.text);
  const rejected = parsed.status === 'rejected';

  if (priorEdges.length) {
    await inBatches(priorEdges, (e) => repo.remove('ExternalLineageEdge', e.id));
  }

  const keyToId = new Map<string, string>();
  for (const ds of parsed.datasets) keyToId.set(ds.key, await datasetIdFor(workspaceId, ds.key));
  const existingById = new Map(current.datasets.map((d) => [d.id, d]));
  const existingDecisions = new Map<string, LinkDecision>();
  for (const [key, id] of keyToId) {
    const d = existingById.get(id);
    if (d) existingDecisions.set(key, d);
  }
  const decisions = resolveLinks(parsed.datasets, index, existingDecisions);
  const toLinkCount = [...decisions.values()].filter((d) => d.state === 'to_link').length;

  const importRow: Row = {
    workspace_id: workspaceId,
    label: (file.label?.trim() || prior?.label || defaultImportLabel(file.name)).slice(0, 120),
    fileName: file.name.slice(0, 260),
    fileHash,
    namespace: parsed.namespace?.slice(0, 400) ?? null,
    platform: parsed.platform?.slice(0, 40) ?? null,
    importedById: actor.id,
    importedByEmail: actor.email,
    importedAt: now,
    eventCount: rejected ? 0 : parsed.eventCount,
    datasetCount: rejected ? 0 : parsed.datasets.length,
    edgeCount: rejected ? 0 : parsed.edges.length,
    toLinkCount: rejected ? 0 : toLinkCount,
    status: rejected ? 'rejected' : 'accepted',
    rejectReason: rejected ? (parsed.rejectReason ?? 'Rejected').slice(0, 400) : null,
  };
  if (prior) await repo.update('OpenLineageImport', importId, importRow);
  else await repo.create('OpenLineageImport', { id: importId, ...importRow });

  const remainingEdges = current.edges.filter((e) => e.importId !== importId);
  if (rejected) {
    await removeOrphans(repo, priorEdges.flatMap((e) => [e.sourceDatasetId, e.targetDatasetId]), current, remainingEdges);
    return { importId, status: 'rejected', replaced: !!prior, rejectReason: parsed.rejectReason, warnings: 0 };
  }

  await inBatches(parsed.datasets, async (ds) => {
    const id = keyToId.get(ds.key)!;
    const d = decisions.get(ds.key)!;
    const link: Row = {
      state: d.state,
      fabricItemId: d.fabricItemId ?? null,
      fabricObjectName: d.fabricObjectName ?? null,
      linkedBy: d.linkedBy ?? null,
      linkedAt: d.state === 'linked' ? (d.linkedAt ? new Date(d.linkedAt) : now) : null,
      lastSeenAt: now,
    };
    if (existingById.has(id)) {
      await repo.update('ExternalDataset', id, link);
    } else {
      await repo.create('ExternalDataset', {
        id,
        workspace_id: workspaceId,
        namespace: ds.namespace.slice(0, 400),
        name: ds.name.slice(0, 400),
        platform: ds.platform.slice(0, 40),
        createdById: actor.id,
        createdByEmail: actor.email,
        ...link,
      });
    }
  });

  const newEdges: ExternalEdgeRecord[] = [];
  await inBatches(parsed.edges, async (edge) => {
    const id = await stableId(importId, 'edge', edge.key);
    const cols = encodeColumns(edge.columns);
    const record: ExternalEdgeRecord = {
      id,
      importId,
      sourceDatasetId: keyToId.get(edge.sourceKey)!,
      targetDatasetId: keyToId.get(edge.targetKey)!,
      jobNamespace: edge.jobNamespace.slice(0, 400),
      jobName: edge.jobName.slice(0, 400),
      lastRunState: edge.lastRunState?.slice(0, 20),
      lastRunTime: edge.lastRunTime,
      runId: edge.runId?.slice(0, 100),
      columns: edge.columns,
      columnTruncated: cols.truncated,
    };
    newEdges.push(record);
    await repo.create('ExternalLineageEdge', {
      id,
      workspace_id: workspaceId,
      importId,
      sourceDatasetId: record.sourceDatasetId,
      targetDatasetId: record.targetDatasetId,
      jobNamespace: record.jobNamespace,
      jobName: record.jobName,
      lastRunState: record.lastRunState ?? null,
      lastRunTime: record.lastRunTime ? new Date(record.lastRunTime) : null,
      runId: record.runId ?? null,
      columnLineage: cols.text || null,
      columnTruncated: cols.truncated,
      importedById: actor.id,
      importedByEmail: actor.email,
    });
  });

  await removeOrphans(
    repo,
    priorEdges.flatMap((e) => [e.sourceDatasetId, e.targetDatasetId]),
    current,
    [...remainingEdges, ...newEdges],
  );
  return { importId, status: 'accepted', replaced: !!prior, warnings: parsed.warnings.length };
}

/** Deletes an import, its edges, and the datasets nothing points to any more. */
export async function deleteImport(
  repo: ExternalRepo,
  importId: string,
  current: ExternalLineage,
): Promise<void> {
  const edges = current.edges.filter((e) => e.importId === importId);
  await inBatches(edges, (e) => repo.remove('ExternalLineageEdge', e.id));
  await repo.remove('OpenLineageImport', importId);
  await removeOrphans(
    repo,
    edges.flatMap((e) => [e.sourceDatasetId, e.targetDatasetId]),
    current,
    current.edges.filter((e) => e.importId !== importId),
  );
}

/** Manual decision: link to a Fabric item, keep external, or unlink (to_link). */
export async function setLink(
  repo: ExternalRepo,
  datasetId: string,
  decision: { state: LinkState; fabricItemId?: string; fabricObjectName?: string },
  actor: ExternalActor,
  now: Date = new Date(),
): Promise<void> {
  if (decision.state === 'linked' && !decision.fabricItemId) {
    throw new Error('Choose a Fabric item to link to.');
  }
  const linked = decision.state === 'linked';
  await repo.update('ExternalDataset', datasetId, {
    state: decision.state,
    fabricItemId: linked ? decision.fabricItemId : null,
    fabricObjectName: linked ? (decision.fabricObjectName?.slice(0, 260) ?? null) : null,
    linkedBy: decision.state === 'to_link' ? null : actor.email,
    linkedAt: decision.state === 'to_link' ? null : now,
  });
}

/* ----------------------------- read path ----------------------------- */

export const EXTERNAL_NODE_PREFIX = 'ext:';
export const OPENLINEAGE_RELATION = 'openlineage';

/** Graph node of a dataset: the Fabric item when linked, else an external node. */
export function externalNodeId(ds: Pick<ExternalDatasetRecord, 'id' | 'state' | 'fabricItemId'>): string {
  return ds.state === 'linked' && ds.fabricItemId ? ds.fabricItemId : `${EXTERNAL_NODE_PREFIX}${ds.id}`;
}

/** Read path: snapshot edges ∪ external edges. Snapshot rows are never modified. */
export function mergeLineageEdges(snapshot: readonly Edge[], external: ExternalLineage): Edge[] {
  const byId = new Map(external.datasets.map((d) => [d.id, d]));
  const seen = new Set(snapshot.map((e) => `${e.source}|${e.target}`));
  const out: Edge[] = [...snapshot];
  for (const e of external.edges) {
    const s = byId.get(e.sourceDatasetId);
    const t = byId.get(e.targetDatasetId);
    if (!s || !t) continue;
    const source = externalNodeId(s);
    const target = externalNodeId(t);
    const key = `${source}|${target}`;
    if (source === target || seen.has(key)) continue;
    seen.add(key);
    out.push({ source, target, relation: OPENLINEAGE_RELATION });
  }
  return out;
}

/* ----------------------------- repositories ----------------------------- */

export function createMemoryRepo(): ExternalRepo {
  const tables = new Map<ExternalTable, Map<string, Row>>();
  const table = (t: ExternalTable) => {
    let m = tables.get(t);
    if (!m) tables.set(t, (m = new Map()));
    return m;
  };
  return {
    async list(t, ws) {
      return [...table(t).values()].filter((r) => r.workspace_id === ws).map((r) => ({ ...r }));
    },
    async create(t, row) {
      const id = String(row.id);
      if (table(t).has(id)) throw new Error(`${t} ${id} already exists`);
      table(t).set(id, { ...row });
    },
    async update(t, id, values) {
      const r = table(t).get(id);
      if (!r) throw new Error(`${t} ${id} not found`);
      table(t).set(id, { ...r, ...values });
    },
    async remove(t, id) {
      table(t).delete(id);
    },
  };
}

/** In preview, imports live in memory only (lost on reload). */
export const previewExternalRepo: ExternalRepo = createMemoryRepo();

interface RayfinEntity {
  select: (fields: readonly string[]) => {
    where: (f: Row) => {
      first: (n: number) => {
        after: (c: string) => unknown;
        executePaginated: () => Promise<{ items: Row[]; endCursor?: string; hasNextPage: boolean }>;
      };
    };
  };
  create: (v: Row) => Promise<unknown>;
  update: (f: Row, v: Row) => Promise<unknown>;
  delete: (f: Row) => Promise<unknown>;
}

const FIELDS: Record<ExternalTable, readonly string[]> = {
  OpenLineageImport: ['id', 'workspace_id', 'label', 'fileName', 'fileHash', 'namespace', 'platform', 'importedById', 'importedByEmail', 'importedAt', 'eventCount', 'datasetCount', 'edgeCount', 'toLinkCount', 'status', 'rejectReason'],
  ExternalDataset: ['id', 'workspace_id', 'namespace', 'name', 'platform', 'fabricItemId', 'fabricObjectName', 'state', 'linkedBy', 'linkedAt', 'createdById', 'createdByEmail', 'lastSeenAt'],
  ExternalLineageEdge: ['id', 'workspace_id', 'importId', 'sourceDatasetId', 'targetDatasetId', 'jobNamespace', 'jobName', 'lastRunState', 'lastRunTime', 'runId', 'columnLineage', 'columnTruncated', 'importedById', 'importedByEmail'],
};

export function createRayfinRepo(): ExternalRepo {
  const entity = async (t: ExternalTable): Promise<RayfinEntity> => {
    const { getRayfinClient } = await import('@/lib/rayfin-client');
    return (getRayfinClient().data as unknown as Record<string, RayfinEntity>)[t];
  };
  return {
    async list(t, ws) {
      const api = await entity(t);
      const rows: Row[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 1000; page++) {
        const base = api.select(FIELDS[t]).where({ workspace_id: { eq: ws } }).first(1000);
        const q = (cursor ? base.after(cursor) : base) as typeof base;
        const res = await q.executePaginated();
        rows.push(...res.items);
        if (!res.hasNextPage || !res.endCursor || res.endCursor === cursor) break;
        cursor = res.endCursor;
      }
      return rows;
    },
    async create(t, row) {
      await (await entity(t)).create(row);
    },
    async update(t, id, values) {
      await (await entity(t)).update({ id }, values);
    },
    async remove(t, id) {
      await (await entity(t)).delete({ id });
    },
  };
}

export function externalRepoFor(isPreview: boolean): ExternalRepo {
  return isPreview ? previewExternalRepo : createRayfinRepo();
}

export function externalCounts(lineage: ExternalLineage) {
  const datasets = lineage.datasets;
  const linked = datasets.filter((d) => d.state === "linked").length;
  const toLink = datasets.filter((d) => d.state === "to_link").length;
  const external = datasets.filter((d) => d.state === "external").length;
  const linkedIds = new Set(datasets.filter((d) => d.state === "linked").map((d) => d.id));
  const crossEdges = lineage.edges.filter(
    (e) => linkedIds.has(e.sourceDatasetId) !== linkedIds.has(e.targetDatasetId),
  ).length;
  return { total: datasets.length, linked, toLink, external, crossEdges };
}
