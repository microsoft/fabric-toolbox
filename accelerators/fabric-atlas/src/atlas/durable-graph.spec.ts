// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { SyncJob } from '../../rayfin/data/SyncJob';
import type { SyncRootRun } from '../../rayfin/data/SyncRootRun';
import {
  GraphOrchestrator, type GraphAdapters, type GraphData, type GraphRuntime,
} from '../../rayfin/functions/src/sync/graph-orchestrator';
import {
  GraphError, hash, identity, jobIdFor, parseStart, reference, rootTransition, SERIALIZATION_SCOPE, STAGES, taskIdFor,
  type ExternalSerializer, type GraphResponse,
} from '../../rayfin/functions/src/sync/graph-protocol';
import {
  prepareSnapshot, SnapshotPublisher, type SnapshotDraft,
} from '../../rayfin/functions/src/sync/snapshot-publisher';
import { graphStart, graphStatus } from '../../rayfin/functions/src/sync/graph-functions';
import { SYNCHRONIZER_AUTHORITY_ID } from '../../rayfin/functions/src/synchronizer-gate';

const WORKSPACE = '11111111-1111-4111-8111-111111111111';
const OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REQUEST = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-10-02T12:00:00.000Z');
const EMAIL = 'writer@example.test';
const START = { protocolVersion: 2 as const, requestId: REQUEST, workspaceIds: [WORKSPACE] };
const ROOT = identity('root', REQUEST);
const JOB = jobIdFor(ROOT, WORKSPACE);
type Row = { id: string; [key: string]: unknown };
type Write = { entity: string; action: 'create' | 'update'; values: Row };

function memoryData() {
  const tables = new Map<string, Map<string, Row>>();
  const writes: Write[] = [];
  const failures: { match: (write: Write) => boolean; after: boolean; error: Error }[] = [];
  const readFailures: { match: (entity: string, id: string) => boolean }[] = [];
  let onWrite: ((write: Write) => Promise<void>) | undefined;
  let activeCreates = 0;
  let maxCreates = 0;
  const get = (entity: string) => {
    if (!tables.has(entity)) tables.set(entity, new Map());
    return tables.get(entity)!;
  };
  async function write(entity: string, action: Write['action'], values: Row) {
    const entry = { entity, action, values };
    if (action === 'create') { activeCreates++; maxCreates = Math.max(maxCreates, activeCreates); }
    try {
      await onWrite?.(entry);
      const index = failures.findIndex((failure) => failure.match(entry));
      const failure = index < 0 ? undefined : failures.splice(index, 1)[0];
      if (failure && !failure.after) throw failure.error;
      const rows = get(entity);
      if (action === 'create' && rows.has(values.id)) throw new Error('duplicate ID');
      for (const field of ['activeKey', 'taskKey', 'recordKey']) {
        if (values[field] && [...rows.values()].some((row) => row.id !== values.id && row[field] === values[field])) throw new Error('duplicate unique key');
      }
      const row = action === 'create' ? values : { ...rows.get(values.id), ...values };
      rows.set(values.id, structuredClone(row));
      writes.push(structuredClone(entry));
      if (failure) throw failure.error;
      return structuredClone(row);
    } finally { if (action === 'create') activeCreates--; }
  }
  const clients = Object.fromEntries([
    'SyncRootRun', 'SyncJob', 'SyncTask', 'SyncCommand', 'Workspace', 'SyncRun',
    'FabricItem', 'Principal', 'AccessGrant', 'JobRun', 'LineageEdge', 'ConfigEntry',
  ].map((entity) => [entity, {
    create: (row: Row) => write(entity, 'create', row),
    update: ({ id }: { id: string }, patch: Record<string, unknown>) => write(entity, 'update', { ...patch, id }),
    async findById(id: string) {
      const failure = readFailures.findIndex((rule) => rule.match(entity, id));
      if (failure >= 0) { readFailures.splice(failure, 1); throw new Error('private read detail'); }
      return structuredClone(get(entity).get(id) ?? null);
    },
    select(fields: string[]) {
      let filter: Record<string, { eq: unknown }> = {};
      let count = 100;
      let offset = 0;
      const selected = () => [...get(entity).values()].filter((row) =>
        Object.entries(filter).every(([key, value]) => row[key] === value.eq));
      const query = {
        where(next: typeof filter) { filter = next; return query; },
        first(next: number) { count = next; return query; },
        after(next: string) { offset = Number(next); return query; },
        async execute() {
          return selected().slice(offset, offset + count)
            .map((row) => structuredClone(Object.fromEntries(fields.map((field) => [field, row[field]]))));
        },
        async executePaginated() {
          const items = await query.execute();
          return { items, hasNextPage: offset + count < selected().length, endCursor: String(offset + count) };
        },
      };
      return query;
    },
  }]));
  return {
    data: clients as unknown as GraphData, writes, get,
    hook(value?: typeof onWrite) { onWrite = value; },
    maxCreates: () => maxCreates,
    fail(match: (write: Write) => boolean, after = false, error = Object.assign(new Error('private error Bearer NEVER_STORE https://private.invalid'), { status: 503 })) {
      failures.push({ match, after, error });
    },
    failRead(match: (entity: string, id: string) => boolean) { readFailures.push({ match }); },
  };
}

// Test-only external host: no lease expiry or process-boundary claim is inferred.
function testSerializer() {
  let active = false;
  let held = true;
  const run = vi.fn(async <T>(scope: typeof SERIALIZATION_SCOPE, work: Parameters<ExternalSerializer['run']>[1]): Promise<T> => {
    expect(scope).toBe(SERIALIZATION_SCOPE);
    if (active) throw new GraphError('SERIALIZATION_REQUIRED');
    active = true;
    try { return await work({ assertHeld: async () => { if (!held) throw new GraphError('SERIALIZATION_REQUIRED'); } }) as T; }
    finally { active = false; }
  });
  return { serializer: { run } as ExternalSerializer, revoke() { held = false; }, restore() { held = true; } };
}
function draft(count = 1): SnapshotDraft {
  return {
    workspace: { displayName: 'Metadata workspace' },
    rows: {
      FabricItem: Array.from({ length: count }, (_, index) => ({
        fabricId: identity('item', index), displayName: `Item ${index}`, itemType: 'Lakehouse',
        health: 'healthy', endorsement: 'none',
      })),
      Principal: [], AccessGrant: [], JobRun: [], LineageEdge: [], ConfigEntry: [],
    },
  };
}
function fixture(count = 1) {
  const db = memoryData();
  const serial = testSerializer();
  const collected: string[] = [];
  const snapshot = draft(count);
  const collectors = Object.fromEntries(STAGES.slice(0, 6).map((stage) => [
    stage, vi.fn(async () => {
      collected.push(stage);
      return { done: true as const, payload: { id: identity('payload', stage), hash: hash(['payload', stage]) } };
    }),
  ])) as unknown as GraphAdapters['collectors'];
  const adapters: GraphAdapters = { collectors, writerEmail: EMAIL, assemble: vi.fn(async () => snapshot) };
  const runtime: GraphRuntime = { serializer: serial.serializer, adapters };
  let request = 0;
  return {
    db, serial, runtime, adapters, collected, snapshot,
    engine: () => new GraphOrchestrator(db.data, runtime, () => new Date(NOW), async () => {}),
    input: () => ({ protocolVersion: 2 as const, rootRunId: ROOT, workspaceId: WORKSPACE, requestId: identity('next', ++request) }),
  };
}
function ok(response: GraphResponse) {
  expect(response).toMatchObject({ ok: true, protocolVersion: 2 });
  if (!response.ok) throw new Error(response.error.code);
  return response.run;
}
function failure(response: GraphResponse, code: string) {
  expect(response).toMatchObject({ ok: false, error: { code } });
  expect(JSON.stringify(response)).not.toMatch(/NEVER_STORE|private\.invalid|private error/);
}
async function collect(f: ReturnType<typeof fixture>) {
  ok(await f.engine().start(START));
  for (let i = 0; i < 6; i++) ok(await f.engine().continue(f.input()));
}
function cancelOutOfBand(f: ReturnType<typeof fixture>) {
  const root = f.db.get('SyncRootRun').get(ROOT)!;
  f.db.get('SyncRootRun').set(ROOT, { ...root, state: 'cancelled', cancelRequestedAt: NOW, finishedAt: NOW });
}

describe('v2 graph validation and fail-closed boundary', () => {
  it('requires an installed serializer, not a caller flag, process mutex or expiring row', async () => {
    const db = memoryData();
    const engine = new GraphOrchestrator(db.data);
    failure(await engine.start(START), 'SERIALIZATION_REQUIRED');
    failure(await engine.continue({ protocolVersion: 2, rootRunId: ROOT, workspaceId: WORKSPACE, requestId: REQUEST }), 'SERIALIZATION_REQUIRED');
    failure(await engine.cancel({ protocolVersion: 2, rootRunId: ROOT, requestId: REQUEST }), 'SERIALIZATION_REQUIRED');
    failure(await engine.start({ ...START, externallySerialized: true }), 'INVALID_INPUT');
    expect(db.writes).toHaveLength(0);
  });

  it('uses strict UUIDs, bounded plans, exact keys and version-separated deterministic identities', () => {
    expect(parseStart({ ...START, workspaceIds: [OTHER, WORKSPACE] }).workspaceIds).toEqual([WORKSPACE, OTHER]);
    for (const bad of [
      { ...START, protocolVersion: 1 }, { ...START, requestId: ` ${REQUEST}` },
      { ...START, workspaceIds: [WORKSPACE, WORKSPACE] }, { ...START, workspaceIds: [] },
      { ...START, workspaceIds: Array(17).fill(WORKSPACE) }, { ...START, token: 'NEVER_STORE' },
      { ...START, requestId: '00000000-0000-0000-0000-000000000000' },
      { ...START, workspaceIds: ['https://private.invalid'] },
    ]) expect(() => parseStart(bad)).toThrow(GraphError);
    expect(identity('root', REQUEST)).toBe(ROOT);
    expect(identity('root', REQUEST)).not.toBe(identity('job', REQUEST));
    expect(() => reference({ id: REQUEST, hash: hash('payload'), token: 'NEVER_STORE' })).toThrow();
  });

  it('has explicit terminal root states without resurrection', () => {
    const root = { state: 'ready' } as SyncRootRun;
    expect(rootTransition(root, 'running', NOW)).toMatchObject({ state: 'running' });
    expect(() => rootTransition(root, 'completed', NOW)).toThrow();
    for (const state of ['cancelled', 'completed'] as const) {
      expect(() => rootTransition({ state } as SyncRootRun, 'running', NOW)).toThrow();
    }
  });

  it('keeps shared status read-only and gates public mutations before reaching the disabled runtime', async () => {
    const f = fixture();
    ok(await f.engine().start(START));
    const ctx = {
      getDataClient: () => ({
        ...f.db.data,
        SynchronizerAuthority: {
          findById: vi.fn(async () => null),
          create: vi.fn(async () => { throw new Error('private error Bearer NEVER_STORE'); }),
        },
      }),
    } as unknown as Parameters<typeof graphStart>[0];
    const before = f.db.writes.length;
    failure(await graphStart(ctx, START), 'NOT_AUTHORIZED');
    ok(await graphStatus(ctx, { protocolVersion: 2, rootRunId: ROOT }));
    expect(f.db.writes).toHaveLength(before);
    const allowed = {
      getDataClient: () => ({
        ...f.db.data,
        SynchronizerAuthority: { findById: async () => ({ id: SYNCHRONIZER_AUTHORITY_ID, createdAt: NOW }) },
      }),
    } as unknown as Parameters<typeof graphStart>[0];
    failure(await graphStart(allowed, START), 'SERIALIZATION_REQUIRED');
    expect(f.db.writes).toHaveLength(before);
  });

  it('rejects past and future lease records; an elapsed timeout never authorizes takeover', async () => {
    for (const leaseExpiresAt of [new Date('2020-01-01'), new Date('2099-01-01')]) {
      const f = fixture();
      ok(await f.engine().start(START));
      f.db.get('SyncTask').get(taskIdFor(JOB, 'core'))!.leaseExpiresAt = leaseExpiresAt;
      failure(await f.engine().continue(f.input()), 'LEASE_UNSUPPORTED');
      expect(f.collected).toHaveLength(0);
    }
  });
});

describe('persisted graph continuation', () => {
  it('plans roots/workspaces deterministically, recovers interrupted planning and rejects changed retries', async () => {
    const f = fixture();
    f.db.fail((write) => write.entity === 'SyncTask' && write.values.kind === 'relations');
    failure(await f.engine().start(START), 'PERSISTENCE_UNAVAILABLE');
    expect(f.db.get('SyncRootRun').get(ROOT)!.state).toBe('planning');
    ok(await f.engine().start(START));
    ok(await f.engine().start(START));
    expect(f.db.get('SyncTask').size).toBe(8);
    expect(f.db.get('SyncJob').size).toBe(1);
    failure(await f.engine().start({ ...START, workspaceIds: [OTHER] }), 'REQUEST_CONFLICT');
    failure(await f.engine().start({ ...START, requestId: identity('other-start') }), 'WORKSPACE_BUSY');
  });

  it('runs bounded collector/persist/publish phases without a browser or automatic background work', async () => {
    const f = fixture();
    const run = ok(await f.engine().start(START));
    expect(run).toMatchObject({ backgroundExecution: false, distributedClaims: false, state: 'ready' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(f.collected).toEqual([]);
    for (let i = 0; i < 8; i++) {
      const current = ok(await f.engine().continue(f.input()));
      if (i < 7) expect(current.workspaces[0].snapshotPublished).toBe(false);
    }
    expect(f.collected).toEqual(STAGES.slice(0, 6));
    expect(ok(await f.engine().status({ protocolVersion: 2, rootRunId: ROOT }))).toMatchObject({
      state: 'completed', workspaces: [{ snapshotPublished: true, completedTasks: 8 }],
    });
    const manifestIndex = f.db.writes.findIndex((write) => write.entity === 'Workspace');
    const auditIndex = f.db.writes.findIndex((write) => write.entity === 'SyncRun' && write.values.status === 'completed');
    expect(manifestIndex).toBeGreaterThan(auditIndex);
    expect(f.db.writes.slice(manifestIndex + 1).every((write) => ['SyncTask', 'SyncJob', 'SyncCommand', 'SyncRootRun'].includes(write.entity))).toBe(true);
  });

  it('publishes workspaces independently and completes the root only after every workspace', async () => {
    const f = fixture();
    ok(await f.engine().start({ ...START, workspaceIds: [OTHER, WORKSPACE] }));
    for (let i = 0; i < 8; i++) ok(await f.engine().continue(f.input()));
    let run = ok(await f.engine().status({ protocolVersion: 2, rootRunId: ROOT }));
    expect(run.state).toBe('running');
    expect(run.workspaces.map((job) => job.snapshotPublished)).toEqual([true, false]);
    for (let i = 0; i < 8; i++) ok(await f.engine().continue({ ...f.input(), workspaceId: OTHER }));
    run = ok(await f.engine().status({ protocolVersion: 2, rootRunId: ROOT }));
    expect(run.state).toBe('completed');
    expect(run.workspaces.map((job) => job.snapshotPublished)).toEqual([true, true]);
    expect(f.db.get('Workspace').size).toBe(2);
  });

  it('rejects out-of-order graph checkpoints instead of treating a forged publish task as completion', async () => {
    const f = fixture();
    ok(await f.engine().start(START));
    f.db.get('SyncTask').get(taskIdFor(JOB, 'publish'))!.state = 'completed';
    failure(await f.engine().continue(f.input()), 'CHECKPOINT_INVALID');
    expect(f.db.get('Workspace').size).toBe(0);
    expect(f.collected).toHaveLength(0);
  });

  it('duplicates and committed writes with lost responses cannot advance another task', async () => {
    const f = fixture();
    f.db.fail((write) => write.entity === 'SyncRootRun' && write.action === 'create', true);
    ok(await f.engine().start(START));
    const input = f.input();
    f.db.fail((write) => write.entity === 'SyncTask' && write.values.state === 'completed', true);
    f.db.fail((write) => write.entity === 'SyncCommand' && write.values.state === 'completed', true);
    ok(await f.engine().continue(input));
    ok(await f.engine().continue(input));
    expect(f.collected).toEqual(['core']);
    expect(f.db.get('SyncTask').get(taskIdFor(JOB, 'definitions'))!.state).toBe('pending');
    failure(await f.engine().continue({ ...input, workspaceId: OTHER }), 'NOT_FOUND');
  });

  it('recovers a completed slice when its subsequent command acknowledgement never committed', async () => {
    const f = fixture();
    ok(await f.engine().start(START));
    const input = f.input();
    f.db.fail((write) => write.entity === 'SyncCommand' && write.values.state === 'completed');
    failure(await f.engine().continue(input), 'PERSISTENCE_UNAVAILABLE');
    ok(await f.engine().continue(input));
    expect(f.collected).toEqual(['core']);
  });

  it('checkpoints paged collectors and replays an acknowledged partial slice without repeating it', async () => {
    const f = fixture();
    const checkpoint = { id: identity('page'), hash: hash('page') };
    let slices = 0;
    f.adapters.collectors.core = vi.fn(async (context) => {
      slices++;
      if (!context.checkpoint) return { done: false as const, checkpoint };
      expect(context.checkpoint).toEqual(checkpoint);
      return { done: true as const, payload: { id: identity('core-final'), hash: hash('core-final') } };
    });
    ok(await f.engine().start(START));
    const input = f.input();
    ok(await f.engine().continue(input));
    ok(await f.engine().continue(input));
    expect(slices).toBe(1);
    ok(await f.engine().continue(f.input()));
    expect(slices).toBe(2);
  });

  it('does not steal a running claim and only resumes it under the external serialization contract', async () => {
    const f = fixture();
    ok(await f.engine().start(START));
    const input = f.input();
    f.adapters.collectors.core = vi.fn(async () => { throw new Error('private error Bearer NEVER_STORE'); });
    failure(await f.engine().continue(input), 'PERSISTENCE_UNAVAILABLE');
    failure(await f.engine().continue(f.input()), 'TASK_CLAIMED');
    f.adapters.collectors.core = vi.fn(async () => ({ done: true as const, payload: { id: identity('core'), hash: hash('core') } }));
    ok(await f.engine().continue(input));
    expect(JSON.stringify(f.db.writes)).not.toMatch(/NEVER_STORE|private error/);
  });

  it('never advances a stale partial command after newer slices have overwritten the task checkpoint', async () => {
    const f = fixture();
    let slices = 0;
    f.adapters.collectors.core = async () => {
      slices++;
      return { done: false, checkpoint: { id: identity('page', slices), hash: hash(['page', slices]) } };
    };
    ok(await f.engine().start(START));
    const old = f.input();
    f.db.fail((write) => write.entity === 'SyncCommand' && write.values.state === 'completed');
    failure(await f.engine().continue(old), 'PERSISTENCE_UNAVAILABLE');
    ok(await f.engine().continue(f.input()));
    expect(slices).toBe(2);
    ok(await f.engine().continue(old));
    expect(slices).toBe(2);
    expect(f.db.get('SyncTask').get(taskIdFor(JOB, 'core'))!.attemptCount).toBe(2);
  });

  it('stops at a revoked serialization guard and never turns it into an expired-lease retry', async () => {
    const f = fixture();
    ok(await f.engine().start(START));
    f.serial.revoke();
    failure(await f.engine().continue(f.input()), 'SERIALIZATION_REQUIRED');
    expect(f.collected).toEqual([]);
    expect(f.db.get('Workspace').size).toBe(0);
  });

  it('bounds persistence to 64 rows per invocation and recovers an interrupted batch using the same IDs', async () => {
    const f = fixture(72);
    await collect(f);
    const input = f.input();
    f.db.fail((write) => write.entity === 'FabricItem', true);
    f.db.fail((write) => write.entity === 'FabricItem');
    ok(await f.engine().continue(input));
    expect(f.db.get('FabricItem').size).toBe(64);
    ok(await f.engine().continue(input));
    expect(f.db.get('FabricItem').size).toBe(64);
    ok(await f.engine().continue(f.input()));
    expect(f.db.get('FabricItem').size).toBe(72);
    expect(f.db.get('Workspace').size).toBe(0);
    ok(await f.engine().continue(f.input()));
    expect(f.db.get('Workspace').size).toBe(1);
    expect(f.db.maxCreates()).toBeLessThanOrEqual(8);
  });
});

describe('cancellation and publication', () => {
  it.each(['collection', 'persistence', 'publication'] as const)('prevents a later marker after cancellation during %s', async (phase) => {
    const f = fixture(10);
    if (phase === 'collection') {
      ok(await f.engine().start(START));
      f.adapters.collectors.core = async () => {
        cancelOutOfBand(f);
        return { done: true, payload: { id: identity('core'), hash: hash('core') } };
      };
    } else {
      await collect(f);
      if (phase === 'publication') ok(await f.engine().continue(f.input()));
      f.db.hook(async (write) => {
        if ((phase === 'persistence' && write.entity === 'FabricItem') ||
            (phase === 'publication' && write.entity === 'SyncRun' && write.values.status === 'completed')) cancelOutOfBand(f);
      });
    }
    failure(await f.engine().continue(f.input()), 'CANCELLED');
    expect(f.db.get('Workspace').size).toBe(0);
    f.db.hook();
    ok(await f.engine().cancel({ protocolVersion: 2, rootRunId: ROOT, requestId: identity('cancel') }));
    ok(await f.engine().continue(f.input()));
    expect(f.db.get('Workspace').size).toBe(0);
  });

  it('durably cancels first, recovers interrupted cleanup and leaves the previous snapshot untouched', async () => {
    const f = fixture();
    const previous = { id: identity('previous'), fabricId: WORKSPACE, snapshotId: identity('old'), writerEmail: EMAIL };
    f.db.get('Workspace').set(previous.id, previous);
    await collect(f);
    ok(await f.engine().continue(f.input()));
    f.db.fail((write) => write.entity === 'SyncJob' && write.values.state === 'cancelled');
    const cancel = { protocolVersion: 2 as const, rootRunId: ROOT, requestId: identity('cancel') };
    failure(await f.engine().cancel(cancel), 'PERSISTENCE_UNAVAILABLE');
    expect(f.db.get('SyncRootRun').get(ROOT)!.state).toBe('cancelled');
    ok(await f.engine().continue(f.input()));
    ok(await f.engine().cancel(cancel));
    expect(f.db.get('SyncJob').get(JOB)!.state).toBe('cancelled');
    expect(f.db.get('SyncTask').get(taskIdFor(JOB, 'publish'))!.state).toBe('cancelled');
    expect(f.db.get('SyncRun').get(identity('audit', JOB))).toMatchObject({ status: 'failed', failureCode: 'CANCELLED' });
    expect([...f.db.get('Workspace').values()]).toEqual([previous]);
    expect(f.db.writes.every((write) => write.action !== ('delete' as string))).toBe(true);
  });

  it('recovers a lost manifest response; cancellation cannot retract a marker committed before it', async () => {
    const f = fixture();
    await collect(f);
    ok(await f.engine().continue(f.input()));
    f.db.fail((write) => write.entity === 'Workspace', true);
    f.db.hook(async (write) => {
      if (write.entity === 'Workspace') {
        f.db.failRead((entity) => entity === 'Workspace');
      }
    });
    const input = f.input();
    failure(await f.engine().continue(input), 'PERSISTENCE_UNAVAILABLE');
    expect(f.db.get('Workspace').size).toBe(1);
    f.db.hook();
    const run = ok(await f.engine().cancel({ protocolVersion: 2, rootRunId: ROOT, requestId: identity('cancel') }));
    expect(run.workspaces[0]).toMatchObject({ state: 'completed', snapshotPublished: true });
    expect(f.db.get('Workspace').size).toBe(1);
    ok(await f.engine().continue(input));
    expect(f.db.get('Workspace').size).toBe(1);
  });

  it('publishes no manifest on incomplete read-back or unconfirmed audit completion', async () => {
    for (const fault of ['row', 'audit']) {
      const f = fixture();
      await collect(f);
      ok(await f.engine().continue(f.input()));
      if (fault === 'row') f.db.get('FabricItem').clear();
      else f.db.fail((write) => write.entity === 'SyncRun' && write.values.status === 'completed');
      failure(await f.engine().continue(f.input()), 'PERSISTENCE_UNAVAILABLE');
      expect(f.db.get('Workspace').size).toBe(0);
    }
  });

  it('detects immutable assembly drift before any later snapshot write', async () => {
    const f = fixture(65);
    await collect(f);
    ok(await f.engine().continue(f.input()));
    f.snapshot.rows.FabricItem[0].displayName = 'Changed after checkpoint';
    failure(await f.engine().continue(f.input()), 'PAYLOAD_INVALID');
    expect(f.db.get('FabricItem').size).toBe(64);
    expect(f.db.get('Workspace').size).toBe(0);
  });

  it('verifies beyond the first inventory page and rejects an unexpected staged row', async () => {
    const f = fixture(105);
    await collect(f);
    ok(await f.engine().continue(f.input()));
    ok(await f.engine().continue(f.input()));
    const extraId = identity('extra-row');
    const row = [...f.db.get('FabricItem').values()][0];
    f.db.get('FabricItem').set(extraId, { ...row, id: extraId });
    const input = f.input();
    failure(await f.engine().continue(input), 'PAYLOAD_INVALID');
    expect(f.db.get('Workspace').size).toBe(0);
    f.db.get('FabricItem').delete(extraId);
    ok(await f.engine().continue(input));
    expect(f.db.get('Workspace').size).toBe(1);
  });
});

describe('internal publisher and storage boundary', () => {
  it('writes at most eight rows concurrently and retries failures sequentially after settling the batch', async () => {
    const f = fixture(9);
    ok(await f.engine().start(START));
    const job = f.db.get('SyncJob').get(JOB) as unknown as SyncJob;
    const prepared = prepareSnapshot(f.snapshot, job, EMAIL);
    f.db.fail((write) => write.entity === 'FabricItem');
    f.db.fail((write) => write.entity === 'FabricItem');
    const publisher = new SnapshotPublisher(f.db.data, async () => {}, async () => {});
    await publisher.persistSlice(prepared, 0);
    expect(f.db.maxCreates()).toBe(8);
    expect(f.db.get('FabricItem').size).toBe(9);
    await publisher.persistSlice(prepared, 0);
    expect(f.db.get('FabricItem').size).toBe(9);
    expect(f.db.get('Workspace').size).toBe(0);
  });

  it('rejects extra fields, oversized metadata, secret-shaped values, arbitrary URLs and duplicate rows', async () => {
    const f = fixture();
    ok(await f.engine().start(START));
    const job = f.db.get('SyncJob').get(JOB) as unknown as SyncJob;
    for (const mutate of [
      (value: SnapshotDraft) => { Object.assign(value.rows.FabricItem[0], { token: 'NEVER_STORE' }); },
      (value: SnapshotDraft) => { value.rows.FabricItem[0].displayName = 'x'.repeat(201); },
      (value: SnapshotDraft) => { value.rows.FabricItem[0].description = 'Bearer NEVER_STORE'; },
      (value: SnapshotDraft) => { value.rows.FabricItem[0].description = 'https://private.invalid'; },
      (value: SnapshotDraft) => { value.rows.FabricItem.push(value.rows.FabricItem[0]); },
    ]) {
      const value = draft();
      mutate(value);
      expect(() => prepareSnapshot(value, job, EMAIL)).toThrow();
    }
  });

  it('normalizes optional SQL nulls and date representations before hashing and read-back', async () => {
    const f = fixture();
    ok(await f.engine().start(START));
    const job = f.db.get('SyncJob').get(JOB) as unknown as SyncJob;
    const left = draft();
    const right = draft();
    Object.assign(left.rows.FabricItem[0], { description: undefined, lastRefresh: '2026-10-02T00:00:00Z' });
    Object.assign(right.rows.FabricItem[0], { description: null, lastRefresh: new Date('2026-10-02T00:00:00.000Z') });
    expect(prepareSnapshot(left, job, EMAIL)).toEqual(prepareSnapshot(right, job, EMAIL));
  });

  it('registers typed Functions but installs no production serializer, browser mutations or payload endpoint', () => {
    const registration = readFileSync(resolve('rayfin/functions/src/function_app.ts'), 'utf8');
    for (const name of ['Start', 'Continue', 'Status', 'Cancel']) expect(registration).toContain(`'syncGraph${name}'`);
    const entry = readFileSync(resolve('rayfin/functions/src/sync/graph-functions.ts'), 'utf8');
    expect(entry).toContain('new GraphOrchestrator(ctx.getDataClient())');
    expect(entry).not.toMatch(/process\.env|accessToken|\.Tokens|fetch\(/);
    for (const entity of ['SyncRootRun', 'SyncJob', 'SyncTask', 'SyncCommand']) {
      const source = readFileSync(resolve(`rayfin/data/${entity}.ts`), 'utf8');
      expect(source).toContain('claims.sub.eq(SYNC_WRITER_SUBJECT)');
      expect(source).not.toMatch(/(?:accessToken|endpoint|payloadJson|url)\??!?:/i);
      for (const text of source.matchAll(/@text\(([^)]*)\)/g)) expect(text[1]).toMatch(/max:\s*\d+/);
    }
  });
});
