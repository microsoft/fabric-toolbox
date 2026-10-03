import type { TypedDataClients } from '@microsoft/rayfin-data';
import type { AtlasSchema } from '../../../data/schema.js';
import type { SyncJob } from '../../../data/SyncJob.js';
import type { SyncRun } from '../../../data/SyncRun.js';
import type { Workspace } from '../../../data/Workspace.js';
import { canonical, GraphError, hash, identity, objectInput, uuid } from './graph-protocol.js';

export const SNAPSHOT_ENTITIES = ['FabricItem', 'Principal', 'AccessGrant', 'JobRun', 'LineageEdge', 'ConfigEntry'] as const;
export type SnapshotEntity = typeof SNAPSHOT_ENTITIES[number];
type OwnedFields = 'id' | 'workspace_id' | 'snapshotId' | 'writerEmail';
export type SnapshotDraft = {
  workspace: Pick<Workspace, 'displayName' | 'capacity' | 'region'>;
  rows: { [K in SnapshotEntity]: Omit<AtlasSchema[K], OwnedFields>[] };
};
export type SnapshotData = Pick<TypedDataClients<AtlasSchema>, SnapshotEntity | 'Workspace' | 'SyncRun'>;
type Row = Record<string, unknown> & { id: string };
type Rule = number | readonly string[] | 'boolean' | 'date' | 'integer';
const RULES: Record<SnapshotEntity, Record<string, Rule>> = {
  FabricItem: {
    fabricId: 100, displayName: 200, itemType: 60, size: 200, description: 600, ownerName: 120,
    ownerEmail: 150, configuredBy: 160, modifiedBy: 160, endorsementRaw: 60, endorsementBy: 160,
    sensitivity: 60, sensitivityLabelId: 100, tags: 300, tagIds: 2000,
    health: ['healthy', 'stale', 'failing', 'unknown'], endorsement: ['none', 'promoted', 'certified'],
    ownerMetadataAvailable: 'boolean', sensitivityMetadataAvailable: 'boolean',
    endorsementMetadataAvailable: 'boolean', tagMetadataAvailable: 'boolean',
    lastRefresh: 'date', itemCreatedAt: 'date', itemUpdatedAt: 'date',
  },
  Principal: { principalId: 150, displayName: 200, kind: ['user', 'group', 'servicePrincipal', 'guest'],
    email: 150, external: 'boolean', workspaceRole: ['Admin', 'Member', 'Contributor', 'Viewer'] },
  AccessGrant: { itemFabricId: 100, principalRef: 150, accessLevel: ['owner', 'edit', 'view', 'none'],
    source: ['workspaceRole', 'directShare', 'group', 'orgLink', 'itemOwner'], roleName: 60, flag: 80 },
  JobRun: { itemFabricId: 100, itemName: 200, jobType: 60, status: ['completed', 'failed', 'running', 'cancelled'],
    startedAt: 'date', durationSec: 'integer', message: 400 },
  LineageEdge: { sourceFabricId: 100, targetFabricId: 100, relation: 60, broken: 'boolean' },
  ConfigEntry: { itemFabricId: 100, section: 80, label: 160, value: 2000 },
};
const REQUIRED: Record<SnapshotEntity, string[]> = {
  FabricItem: ['fabricId', 'displayName', 'itemType', 'health', 'endorsement'],
  Principal: ['principalId', 'displayName', 'kind'],
  AccessGrant: ['principalRef', 'accessLevel', 'source'],
  JobRun: ['itemFabricId', 'itemName', 'jobType', 'status'],
  LineageEdge: ['sourceFabricId', 'targetFabricId', 'relation', 'broken'],
  ConfigEntry: ['itemFabricId', 'section', 'label'],
};
const MAX_ROWS = 50_000;
const RETRY_DELAYS = [1_000, 3_000, 8_000];

function validateFields(value: unknown, rules: Record<string, Rule>, required: string[]) {
  let row: Record<string, unknown>;
  try { row = objectInput(value, Object.keys(rules)); } catch { throw new GraphError('PAYLOAD_INVALID'); }
  if (required.some((key) => row[key] === undefined || row[key] === null || row[key] === '')) throw new GraphError('PAYLOAD_INVALID');
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined || value === null) continue;
    const rule = rules[key];
    const valid = typeof rule === 'number'
      ? typeof value === 'string' && value.length <= rule
      : Array.isArray(rule) ? rule.includes(value as string)
      : rule === 'boolean' ? typeof value === 'boolean'
      : rule === 'integer' ? Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 2_147_483_647
      : (value instanceof Date || typeof value === 'string') && Number.isFinite(new Date(value).getTime());
    if (!valid) throw new GraphError('PAYLOAD_INVALID');
    if (typeof value === 'string' &&
        /(?:[a-z][a-z0-9+.-]*:\/\/|Bearer\s+\S+|eyJ[\w-]+\.[\w-]+\.[\w-]+|(?:password|client_secret|access_token)\s*[:=])/i.test(value)) {
      throw new GraphError('PAYLOAD_INVALID');
    }
  }
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [key, rules[key] === 'date' ? new Date(value as string | Date) : value]));
}

export interface PreparedSnapshot {
  hash: string;
  rows: { entity: SnapshotEntity; row: Row }[];
  manifest: Workspace;
}

export function prepareSnapshot(draft: SnapshotDraft, job: SyncJob, writerEmail: string): PreparedSnapshot {
  uuid(job.id); uuid(job.workspace_id); uuid(job.snapshotId);
  if (!writerEmail || writerEmail.length > 160 || !/^[^@\s]+@[^@\s]+$/.test(writerEmail) ||
      job.protocolVersion !== 2 || !Number.isFinite(new Date(job.createdAt).getTime())) throw new GraphError('PAYLOAD_INVALID');
  objectInput(draft, ['workspace', 'rows']);
  const workspace = validateFields(draft.workspace, { displayName: 200, capacity: 120, region: 120 }, ['displayName']);
  objectInput(draft.rows, [...SNAPSHOT_ENTITIES]);
  const rows: PreparedSnapshot['rows'] = [];
  const ids = new Set<string>();
  const scope = { workspace_id: job.workspace_id, snapshotId: job.snapshotId, writerEmail };
  for (const entity of SNAPSHOT_ENTITIES) {
    if (!Array.isArray(draft.rows[entity]) || draft.rows[entity].length + rows.length > MAX_ROWS) throw new GraphError('PAYLOAD_INVALID');
    for (const value of draft.rows[entity]) {
      const metadata = validateFields(value, RULES[entity], REQUIRED[entity]);
      const id = identity('snapshot-row', job.snapshotId, entity, metadata);
      if (ids.has(id)) throw new GraphError('PAYLOAD_INVALID');
      ids.add(id);
      rows.push({ entity, row: { ...metadata, ...scope, id } });
    }
  }
  const itemIds = new Set(draft.rows.FabricItem.map((item) => item.fabricId));
  const principalIds = new Set(draft.rows.Principal.map((item) => item.principalId));
  if (itemIds.size !== draft.rows.FabricItem.length || principalIds.size !== draft.rows.Principal.length ||
      draft.rows.AccessGrant.some((row) => !principalIds.has(row.principalRef) ||
        (row.itemFabricId && !itemIds.has(row.itemFabricId))) ||
      draft.rows.JobRun.some((row) => !itemIds.has(row.itemFabricId)) ||
      draft.rows.ConfigEntry.some((row) => !itemIds.has(row.itemFabricId) &&
        !(row.section === '__object_edges__' && row.itemFabricId === job.workspace_id))) throw new GraphError('PAYLOAD_INVALID');
  // Adapters own the reviewed schema/object-lineage codecs. These are the legacy
  // hidden ConfigEntry sections, not arbitrary payload blobs in graph rows.
  const hidden = draft.rows.ConfigEntry.filter((row) => row.section === '__schema__' || row.section === '__object_edges__').length;
  const manifest: Workspace = {
    id: identity('manifest', job.snapshotId), snapshotId: job.snapshotId, writerEmail,
    fabricId: job.workspace_id, displayName: String(workspace.displayName),
    ...(workspace.capacity == null ? {} : { capacity: String(workspace.capacity) }),
    ...(workspace.region == null ? {} : { region: String(workspace.region) }),
    syncedAt: new Date(job.createdAt),
    itemCount: draft.rows.FabricItem.length, principalCount: draft.rows.Principal.length,
    grantCount: draft.rows.AccessGrant.length, jobCount: draft.rows.JobRun.length,
    edgeCount: draft.rows.LineageEdge.length, configCount: draft.rows.ConfigEntry.length - hidden,
    schemaEntryCount: hidden,
  };
  rows.sort((a, b) => a.entity.localeCompare(b.entity) || a.row.id.localeCompare(b.row.id));
  const publicationHash = hash({ rows, manifest });
  return { rows, manifest: { ...manifest, publicationHash }, hash: publicationHash };
}

function matches(actual: Record<string, unknown> | null, expected: Record<string, unknown>): boolean {
  return !!actual && Object.entries(expected).every(([key, value]) => {
    const stored = actual[key];
    if (value instanceof Date) return (stored instanceof Date || typeof stored === 'string') &&
      new Date(stored).getTime() === value.getTime();
    return canonical(stored) === canonical(value);
  });
}

export async function confirmedWrite<T extends object>(
  write: () => Promise<unknown>, read: () => Promise<T | null>, expected: Partial<T>,
): Promise<T> {
  try { await write(); } catch { /* Only read-back proves a committed write after a lost response. */ }
  const row = await read();
  if (!matches(row as Record<string, unknown> | null, expected as Record<string, unknown>)) throw new GraphError('PERSISTENCE_UNAVAILABLE');
  return row!;
}

function retryable(error: unknown): boolean {
  const status = Number((error as { status?: unknown } | null)?.status);
  return [408, 429, 500, 502, 503, 504].includes(status) ||
    (error instanceof Error && /GraphQL errors:\s*Internal server error|Request timed out after \d+ms|HTTP (?:Error )?(?:408|429|5\d\d)\b/i.test(error.message));
}
interface SnapshotTable {
  create(row: Row): Promise<unknown>;
  findById(id: string): Promise<Record<string, unknown> | null>;
  select(fields: string[]): SnapshotQuery;
}
interface SnapshotQuery {
  where(filter: Record<string, { eq: string }>): SnapshotQuery;
  first(count: number): SnapshotQuery;
  after(cursor: string): SnapshotQuery;
  executePaginated(): Promise<{ items: { id: string }[]; hasNextPage: boolean; endCursor?: string | null }>;
}

/** Internal only: no Function accepts a draft or exposes these writes to a browser. */
export class SnapshotPublisher {
  constructor(
    private readonly data: SnapshotData,
    private readonly check: () => Promise<void>,
    private readonly sleep: (milliseconds: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  private table(entity: SnapshotEntity | 'Workspace'): SnapshotTable {
    return this.data[entity] as unknown as SnapshotTable;
  }
  private async confirmedCreate(entity: SnapshotEntity | 'Workspace', row: Row): Promise<void> {
    const table = this.table(entity);
    await this.check();
    const existing = await table.findById(row.id);
    if (existing) {
      if (!matches(existing, row)) throw new GraphError('PAYLOAD_INVALID');
      return;
    }
    let failure: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      if (attempt) { await this.check(); await this.sleep(RETRY_DELAYS[attempt - 1]); }
      await this.check();
      try { await table.create(row); failure = undefined; } catch (error) { failure = error; }
      const stored = await table.findById(row.id);
      if (stored) {
        if (!matches(stored, row)) throw new GraphError('PAYLOAD_INVALID');
        return;
      }
      if (failure && !retryable(failure)) throw new GraphError('PERSISTENCE_UNAVAILABLE');
    }
    throw new GraphError('PERSISTENCE_UNAVAILABLE');
  }

  async beginAudit(job: SyncJob, writerEmail: string): Promise<void> {
    const row: SyncRun = {
      id: identity('audit', job.id), workspace_id: job.workspace_id, snapshotId: job.snapshotId,
      correlationId: job.rootRunId, writerEmail, startedAt: new Date(job.createdAt),
      status: 'running', triggeredBy: writerEmail,
    };
    await this.check();
    const existing = await this.data.SyncRun.findById(row.id);
    const { status: _status, ...immutable } = row;
    void _status;
    if (existing) {
      if (!matches(existing as unknown as Record<string, unknown>, immutable)) throw new GraphError('PAYLOAD_INVALID');
      return;
    }
    await confirmedWrite(() => this.data.SyncRun.create(row), () => this.data.SyncRun.findById(row.id), row);
  }

  async persistSlice(snapshot: PreparedSnapshot, offset: number): Promise<number> {
    if (!Number.isInteger(offset) || offset < 0 || offset > snapshot.rows.length || offset % 64 !== 0) throw new GraphError('CHECKPOINT_INVALID');
    const end = Math.min(offset + 64, snapshot.rows.length);
    for (let start = offset; start < end; start += 8) {
      await this.check();
      const batch = snapshot.rows.slice(start, Math.min(start + 8, end));
      const results = await Promise.allSettled(batch.map(async ({ entity, row }) => {
        const table = this.table(entity);
        const existing = await table.findById(row.id);
        if (existing) {
          if (!matches(existing, row)) throw new GraphError('PAYLOAD_INVALID');
        } else { await this.check(); await table.create(row); }
      }));
      // Wait for every fast write before retrying failures one at a time.
      for (let i = 0; i < batch.length; i++) {
        await this.check();
        const result = results[i];
        if (result.status === 'rejected') {
          if (result.reason instanceof GraphError) throw result.reason;
          const stored = await this.table(batch[i].entity).findById(batch[i].row.id);
          if (stored && !matches(stored, batch[i].row)) throw new GraphError('PAYLOAD_INVALID');
          if (!stored && !retryable(result.reason)) throw new GraphError('PERSISTENCE_UNAVAILABLE');
        }
        await this.confirmedCreate(batch[i].entity, batch[i].row);
      }
    }
    await this.check();
    return end;
  }

  async verify(snapshot: PreparedSnapshot): Promise<void> {
    for (const entity of SNAPSHOT_ENTITIES) {
      const expected = new Set(snapshot.rows.filter((row) => row.entity === entity).map(({ row }) => row.id));
      const seen = new Set<string>();
      const cursors = new Set<string>();
      let cursor: string | undefined;
      let pages = 0;
      do {
        await this.check();
        if (++pages > Math.ceil(MAX_ROWS / 100) + 1) throw new GraphError('PERSISTENCE_UNAVAILABLE');
        let query = this.table(entity).select(['id']).where({
          workspace_id: { eq: snapshot.manifest.fabricId },
          snapshotId: { eq: snapshot.manifest.snapshotId! },
          writerEmail: { eq: snapshot.manifest.writerEmail! },
        }).first(100);
        if (cursor) query = query.after(cursor);
        const page = await query.executePaginated();
        for (const row of page.items) {
          if (!expected.has(row.id) || seen.has(row.id)) throw new GraphError('PAYLOAD_INVALID');
          seen.add(row.id);
        }
        if (!page.hasNextPage) break;
        if (!page.endCursor || cursors.has(page.endCursor)) throw new GraphError('PERSISTENCE_UNAVAILABLE');
        cursors.add(page.endCursor);
        cursor = page.endCursor;
      } while (cursor !== undefined);
      if (seen.size !== expected.size) throw new GraphError('PERSISTENCE_UNAVAILABLE');
    }
    for (let offset = 0; offset < snapshot.rows.length; offset += 8) {
      await this.check();
      const batch = snapshot.rows.slice(offset, offset + 8);
      const rows = await Promise.all(batch.map(({ entity, row }) => this.table(entity).findById(row.id)));
      if (rows.some((row, index) => !matches(row, batch[index].row))) throw new GraphError('PERSISTENCE_UNAVAILABLE');
    }
  }

  async publish(snapshot: PreparedSnapshot, job: SyncJob): Promise<void> {
    await this.check();
    await this.verify(snapshot);
    const id = identity('audit', job.id);
    const audit = await this.data.SyncRun.findById(id);
    if (!audit || audit.snapshotId !== job.snapshotId || audit.workspace_id !== job.workspace_id ||
        audit.writerEmail !== snapshot.manifest.writerEmail) throw new GraphError('CHECKPOINT_INVALID');
    const finishedAt = audit.status === 'completed' && audit.finishedAt ? new Date(audit.finishedAt) : new Date();
    const patch: Partial<SyncRun> = {
      status: 'completed', finishedAt,
      itemsSynced: snapshot.manifest.itemCount,
      durationMs: Math.min(2_147_483_647, Math.max(0, finishedAt.getTime() - new Date(job.createdAt).getTime())),
      summary: 'Server graph metadata verified; publication is confirmed by the workspace manifest.',
    };
    await this.check();
    await confirmedWrite(() => this.data.SyncRun.update({ id }, patch), () => this.data.SyncRun.findById(id), patch);
    await this.check();
    await this.confirmedCreate('Workspace', snapshot.manifest as unknown as Row);
    // No pruning here: active v2 staging must first be supported by retention.
  }

  async hasManifest(job: SyncJob): Promise<boolean> {
    const manifest = await this.data.Workspace.findById(identity('manifest', job.snapshotId));
    if (!manifest) return false;
    if (!job.snapshotHash || manifest.publicationHash !== job.snapshotHash ||
        manifest.snapshotId !== job.snapshotId || manifest.fabricId !== job.workspace_id ||
        manifest.writerEmail !== job.initiatedByEmail) throw new GraphError('CHECKPOINT_INVALID');
    return true;
  }

  async cancelAudit(job: SyncJob): Promise<void> {
    const id = identity('audit', job.id);
    const audit = await this.data.SyncRun.findById(id);
    if (!audit) return;
    if (audit.workspace_id !== job.workspace_id || audit.snapshotId !== job.snapshotId ||
        audit.writerEmail !== job.initiatedByEmail) throw new GraphError('CHECKPOINT_INVALID');
    const finishedAt = audit.status === 'failed' && audit.failureCode === 'CANCELLED' && audit.finishedAt
      ? new Date(audit.finishedAt) : new Date();
    const patch: Partial<SyncRun> = {
      status: 'failed', finishedAt, failureCode: 'CANCELLED',
      failureMessage: 'The root run was cancelled before this workspace snapshot was published.',
      durationMs: Math.min(2_147_483_647, Math.max(0, finishedAt.getTime() - new Date(job.createdAt).getTime())),
    };
    await this.check();
    await confirmedWrite(() => this.data.SyncRun.update({ id }, patch), () => this.data.SyncRun.findById(id), patch);
  }
}
