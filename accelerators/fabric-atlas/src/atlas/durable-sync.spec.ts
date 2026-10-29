// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { SyncCommand } from '../../rayfin/data/SyncCommand';
import type { SyncJob, SyncJobState } from '../../rayfin/data/SyncJob';
import type { SyncTask } from '../../rayfin/data/SyncTask';
import { SyncOrchestrator, type SyncDataClient } from '../../rayfin/functions/src/sync/orchestrator';
import {
  activeJobKey,
  commandIdentity,
  isTerminal,
  jobIdentity,
  jobTransition,
  projectJob,
  releasedJobKey,
  safeSyncCall,
  safeSyncFailure,
  strictUuid,
  SyncError,
  taskIdentity,
  validateInput,
  type SyncJobCommandInput,
  type SyncJobProjection,
  type SyncResponse,
  type SyncStartInput,
} from '../../rayfin/functions/src/sync/protocol';
import type { AppFunctionsSchema } from '../../rayfin/functions/src/types';

const WORKSPACE = '11111111-1111-4111-8111-111111111111';
const OTHER_WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const START_REQUEST = '22222222-2222-4222-8222-222222222222';
const NEXT_REQUEST = '33333333-3333-4333-8333-333333333333';
const THIRD_REQUEST = '44444444-4444-4444-8444-444444444444';
const FOURTH_REQUEST = '55555555-5555-4555-8555-555555555555';
const NOW = new Date('2026-10-02T08:00:00.000Z');
const BASE = { protocolVersion: 1 as const, workspaceId: WORKSPACE };
const startInput = (requestId = START_REQUEST): SyncStartInput => ({ ...BASE, requestId });
const jobInput = (jobId: string, requestId = NEXT_REQUEST): SyncJobCommandInput => ({ ...BASE, jobId, requestId });

type EntityName = 'SyncJob' | 'SyncTask' | 'SyncCommand';
interface Write {
  entity: EntityName;
  action: 'create' | 'update';
  values: Record<string, unknown>;
}
interface FailureRule {
  entity: EntityName;
  action: Write['action'];
  state: string;
  afterCommit: boolean;
}

function testDatabase() {
  const writes: Write[] = [];
  const reads: { entity: EntityName; limit?: number }[] = [];
  const failures: FailureRule[] = [];
  const secretError = new Error('private-token https://private.example.test details must not escape');

  function table<T extends { id: string }>(entity: EntityName, unique: (keyof T)[]) {
    const rows = new Map<string, T>();
    let hideQuery = false;
    let readBarrier: (() => Promise<void>) | undefined;

    async function mutate(action: Write['action'], values: T | Partial<T>, id?: string): Promise<T> {
      const record = action === 'create' ? values as T : { ...rows.get(id!), ...values } as T;
      const failureIndex = failures.findIndex((rule) => rule.entity === entity &&
        rule.action === action && rule.state === (values as { state?: string }).state);
      const failure = failureIndex >= 0 ? failures.splice(failureIndex, 1)[0] : undefined;
      if (failure && !failure.afterCommit) throw secretError;
      if (action === 'update' && !rows.has(id!)) throw new Error('missing row');
      if ([...rows.values()].some((row) => row.id !== id &&
        ['id', ...unique].some((key) => row[key as keyof T] === record[key as keyof T]))) {
        throw new Error('unique constraint');
      }
      rows.set(record.id, structuredClone(record));
      writes.push({ entity, action, values: structuredClone(values) as Record<string, unknown> });
      if (failure) throw secretError;
      return structuredClone(record);
    }

    return {
      rows,
      hideNextQuery() { hideQuery = true; },
      blockNextRead(barrier: () => Promise<void>) { readBarrier = barrier; },
      client: {
        async create(values: T) { return mutate('create', values); },
        async update(where: { id: string }, values: Partial<T>) { return mutate('update', values, where.id); },
        async findById(id: string) {
          reads.push({ entity });
          return rows.has(id) ? structuredClone(rows.get(id)!) : null;
        },
        select(fields: (keyof T)[]) {
          let filter: Record<string, { eq: unknown }> = {};
          let order: Record<string, 'asc' | 'desc'> = {};
          let limit = 100;
          const query = {
            where(value: typeof filter) { filter = value; return query; },
            orderBy(value: typeof order) { order = value; return query; },
            first(value: number) { limit = value; return query; },
            async execute() {
              reads.push({ entity, limit });
              const barrier = readBarrier;
              readBarrier = undefined;
              if (barrier) await barrier();
              if (hideQuery) { hideQuery = false; return []; }
              const selected = [...rows.values()].filter((row) =>
                Object.entries(filter).every(([key, condition]) => row[key as keyof T] === condition.eq));
              selected.sort((a, b) => {
                for (const [key, direction] of Object.entries(order)) {
                  const leftValue = a[key as keyof T];
                  const rightValue = b[key as keyof T];
                  const left = leftValue instanceof Date ? leftValue.toISOString() : String(leftValue);
                  const right = rightValue instanceof Date ? rightValue.toISOString() : String(rightValue);
                  if (left !== right) {
                    const comparison = left < right ? -1 : 1;
                    return direction === 'asc' ? comparison : -comparison;
                  }
                }
                return 0;
              });
              return selected.slice(0, limit).map((row) =>
                structuredClone(Object.fromEntries(fields.map((field) => [field, row[field]]))) as unknown as T);
            },
          };
          return query;
        },
      },
    };
  }

  const tables = {
    SyncJob: table<SyncJob>('SyncJob', ['activeKey']),
    SyncTask: table<SyncTask>('SyncTask', ['taskKey']),
    SyncCommand: table<SyncCommand>('SyncCommand', ['recordKey']),
  };
  const data = new Proxy({
    SyncJob: tables.SyncJob.client,
    SyncTask: tables.SyncTask.client,
    SyncCommand: tables.SyncCommand.client,
  }, {
    get(target, name) {
      if (!Object.hasOwn(target, name)) throw new Error(`Snapshot access forbidden: ${String(name)}`);
      return Reflect.get(target, name);
    },
  }) as unknown as SyncDataClient;
  return {
    data, tables, writes, reads,
    fail(entity: EntityName, action: Write['action'], state: string, afterCommit = false) {
      failures.push({ entity, action, state, afterCommit });
    },
    orchestrator: () => new SyncOrchestrator(data, () => new Date(NOW)),
  };
}

function requireProjection(response: SyncResponse): SyncJobProjection {
  expect(response.ok).toBe(true);
  if (!response.ok || !response.job) throw new Error('Expected a persisted probe projection');
  return response.job;
}

function fixtureJob(state: SyncJobState = 'queued'): SyncJob {
  const identity = jobIdentity(WORKSPACE, START_REQUEST);
  return {
    ...identity,
    workspace_id: WORKSPACE,
    protocolVersion: 1,
    state,
    phase: 'probe',
    revision: 0,
    totalTasks: 1,
    completedTasks: state === 'waiting' || state === 'completed' ? 1 : 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...(isTerminal(state) ? { finishedAt: NOW } : {}),
    activeKey: isTerminal(state) ? releasedJobKey(identity.id) : activeJobKey(WORKSPACE),
  };
}

describe('durable sync protocol', () => {
  it.each([
    '', ` ${WORKSPACE}`, `${WORKSPACE} `, WORKSPACE.replaceAll('-', ''),
    '00000000-0000-0000-0000-000000000000', WORKSPACE.replace('-4111-', '-0111-'),
    WORKSPACE.replace('-8111-', '-7111-'), `https://example.test/${WORKSPACE}`,
    null, undefined, 12, {}, ['private-token'],
  ])('rejects non-UUID input without echoing %j', (value) => {
    expect(() => strictUuid(value)).toThrow(SyncError);
    try { strictUuid(value); } catch (error) {
      expect(safeSyncFailure(error)).toMatchObject({ error: { code: 'INVALID_INPUT' } });
      expect(JSON.stringify(safeSyncFailure(error))).not.toContain('private-token');
    }
  });

  it('normalizes UUID case and rejects versions, missing inputs, tokens and endpoints', () => {
    expect(strictUuid(OTHER_WORKSPACE.toUpperCase())).toBe(OTHER_WORKSPACE);
    expect(validateInput('start', { ...startInput(), workspaceId: OTHER_WORKSPACE.toUpperCase() }).workspaceId)
      .toBe(OTHER_WORKSPACE);
    for (const input of [
      { ...startInput(), protocolVersion: '1' }, { ...startInput(), protocolVersion: 2 },
      { ...BASE }, { ...startInput(), token: 'private-token' },
      { ...startInput(), endpoint: 'https://private.example.test' },
      Object.create(startInput()), null, [],
    ]) expect(() => validateInput('start', input)).toThrow(SyncError);
    expect(() => validateInput('continue', startInput())).toThrow(SyncError);
    expect(() => validateInput('cancel', { ...startInput(), jobId: null })).toThrow(SyncError);
    expect(validateInput('status', BASE)).toEqual(BASE);
    expect(() => validateInput('status', { ...BASE, requestId: START_REQUEST })).toThrow(SyncError);
  });

  it('uses canonical, domain-separated SHA-256 identities with fixed golden values', () => {
    expect(commandIdentity('start', startInput())).toEqual({
      id: '52506d4a-86d4-8fa2-926e-b3d24f6e7a57',
      recordKey: 'v1:command:52506d4a86d4ffa2d26eb3d24f6e7a572cd24cdc3b65646518c7fd6432802e10',
      inputHash: '625396222596af705b171b2881286fdc0171bc7c5f5872af9521aea2d01c165f',
    });
    const job = jobIdentity(WORKSPACE, START_REQUEST);
    expect(job.id).toBe('bd54749e-8ae6-88c1-b9b2-0b1d81809367');
    expect(strictUuid(job.snapshotId)).toBe(job.snapshotId);
    const task = taskIdentity(job.id);
    expect(taskIdentity(job.id)).toEqual(task);
    expect(strictUuid(task.id)).toBe(task.id);
    expect(new Set([job.id, job.snapshotId, task.id]).size).toBe(3);
    expect(task.taskKey.length).toBeLessThanOrEqual(80);
    expect(activeJobKey(WORKSPACE).length).toBeLessThanOrEqual(80);
    expect(commandIdentity('cancel', jobInput(job.id, START_REQUEST)).recordKey)
      .toBe(commandIdentity('start', startInput()).recordKey);
    expect(commandIdentity('cancel', jobInput(job.id, START_REQUEST)).inputHash)
      .not.toBe(commandIdentity('start', startInput()).inputHash);
    expect(commandIdentity('start', { ...startInput(), workspaceId: OTHER_WORKSPACE }).inputHash)
      .not.toBe(commandIdentity('start', startInput()).inputHash);
    expect(commandIdentity('start', { ...startInput(), workspaceId: OTHER_WORKSPACE.toUpperCase() }))
      .toEqual(commandIdentity('start', { ...startInput(), workspaceId: OTHER_WORKSPACE }));
    expect(taskIdentity(job.id.toUpperCase())).toEqual(task);
  });

  it.each(['queued', 'running', 'waiting', 'completed', 'failed', 'cancelled'] as const)(
    'projects %s explicitly without implying background execution or publication', (state) => {
      const result = projectJob({ ...fixtureJob(state), failureMessage: 'private-token' });
      expect(result.state).toBe(state);
      expect(result.backgroundExecution).toBe(false);
      expect(result.snapshotPublished).toBe(false);
      expect(result.scope).toBe('persistence-probe');
      expect(result.anotherAuthorizedInvocationRequired).toBe(!isTerminal(state));
      expect(result.nextAction).toBe(isTerminal(state) ? 'none' : 'syncContinue');
      expect(JSON.stringify(result)).not.toContain('private-token');
    },
  );

  it('allows only forward probe transitions and releases terminal keys in the same row update', () => {
    let job = fixtureJob();
    for (const state of ['running', 'waiting', 'completed'] as const) {
      const previousRevision = job.revision;
      job = { ...job, ...jobTransition(job, state, NOW) };
      expect(job.revision).toBe(previousRevision + 1);
    }
    expect(job.completedTasks).toBe(1);
    expect(job.activeKey).toBe(releasedJobKey(job.id));
    expect(job.finishedAt).toEqual(NOW);
    expect(() => jobTransition(job, 'running', NOW)).toThrow(SyncError);
    expect(() => jobTransition(fixtureJob(), 'completed', NOW)).toThrow(SyncError);
    expect(() => jobTransition(fixtureJob('waiting'), 'running', NOW)).toThrow(SyncError);
  });

  it('returns fixed bounded failures for unexpected errors, including context initialization', async () => {
    const failure = await safeSyncCall(async () => { throw new Error('private-token'.repeat(500)); });
    expect(failure).toMatchObject({ ok: false, error: { code: 'PERSISTENCE_UNAVAILABLE', retryable: true } });
    if (failure.ok) throw new Error('Expected failure');
    expect(failure.error.message.length).toBeLessThanOrEqual(240);
    expect(failure.error.code.length).toBeLessThanOrEqual(64);
    expect(JSON.stringify(failure)).not.toContain('private-token');
  });
});

describe('durable sync orchestration', () => {
  it('rejects invalid protocol requests before any persistence operation', async () => {
    const db = testDatabase();
    for (const response of [
      await db.orchestrator().start({ ...startInput(), protocolVersion: 2 }),
      await db.orchestrator().continue({ ...startInput(), jobId: 'invalid' }),
      await db.orchestrator().cancel({ ...startInput(), jobId: ['private-token'] }),
      await db.orchestrator().status({ ...BASE, workspaceId: null }),
    ]) expect(response).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(db.writes).toEqual([]);
    expect(db.reads).toEqual([]);
  });

  it('creates one queued job and one pending task, then attaches duplicate starts without resetting either', async () => {
    const db = testDatabase();
    const sync = db.orchestrator();
    const job = requireProjection(await sync.start(startInput()));
    const writes = db.writes.length;
    expect(await sync.start(startInput())).toMatchObject({ ok: true, outcomeCode: 'JOB_CREATED', job });
    expect(db.writes.length).toBe(writes);
    expect(await sync.start(startInput(NEXT_REQUEST))).toMatchObject({
      ok: true, outcomeCode: 'JOB_ATTACHED', job: { id: job.id, state: 'queued', revision: 0 },
    });
    expect(db.tables.SyncJob.rows.size).toBe(1);
    expect(db.tables.SyncTask.rows.size).toBe(1);
    expect([...db.tables.SyncTask.rows.values()][0]).toMatchObject({ state: 'pending', attemptCount: 0 });
    expect([...db.tables.SyncCommand.rows.values()].every((command) => command.state === 'completed')).toBe(true);
    expect([...db.tables.SyncJob.rows.values()][0].initiatedBySubject).toBeUndefined();
  });

  it('attaches after an active-key uniqueness collision through read-back, not an overwrite', async () => {
    const db = testDatabase();
    const job = requireProjection(await db.orchestrator().start(startInput()));
    db.tables.SyncJob.hideNextQuery();
    expect(await db.orchestrator().start(startInput(NEXT_REQUEST))).toMatchObject({
      ok: true, outcomeCode: 'JOB_ATTACHED', job: { id: job.id },
    });
    expect(db.writes.filter((write) => write.entity === 'SyncJob')).toHaveLength(1);
    expect(db.tables.SyncTask.rows.size).toBe(1);
  });

  it('rejects requestId reuse across workspaces, commands and job inputs before modifying the original record', async () => {
    const db = testDatabase();
    const sync = db.orchestrator();
    const job = requireProjection(await sync.start(startInput()));
    const original = structuredClone([...db.tables.SyncCommand.rows.values()][0]);
    for (const response of [
      await sync.start({ ...startInput(), workspaceId: OTHER_WORKSPACE }),
      await sync.cancel(jobInput(job.id, START_REQUEST)),
      await sync.continue(jobInput(job.id, START_REQUEST)),
    ]) expect(response).toMatchObject({ ok: false, error: { code: 'REQUEST_CONFLICT' } });
    expect([...db.tables.SyncCommand.rows.values()][0]).toEqual(original);
    expect(db.tables.SyncJob.rows.size).toBe(1);
    await sync.continue(jobInput(job.id));
    expect(await sync.continue(jobInput(OTHER_WORKSPACE))).toMatchObject({
      ok: false, error: { code: 'REQUEST_CONFLICT' },
    });
  });

  it('commits a waiting checkpoint, requires a fresh request to finalize, and replays current persisted progress', async () => {
    const db = testDatabase();
    const sync = db.orchestrator();
    const job = requireProjection(await sync.start(startInput()));
    const waiting = requireProjection(await sync.continue(jobInput(job.id)));
    expect(waiting).toMatchObject({ state: 'waiting', revision: 2, completedTasks: 1, totalTasks: 1 });
    expect(waiting.anotherAuthorizedInvocationRequired).toBe(true);
    const writes = db.writes.length;
    expect(requireProjection(await db.orchestrator().continue(jobInput(job.id)))).toEqual(waiting);
    expect(db.writes.length).toBe(writes);
    const completed = requireProjection(await db.orchestrator().continue(jobInput(job.id, THIRD_REQUEST)));
    expect(completed).toMatchObject({ state: 'completed', revision: 3, completedTasks: 1, finishedAt: NOW.toISOString() });
    expect(completed.anotherAuthorizedInvocationRequired).toBe(false);
    expect(requireProjection(await sync.continue(jobInput(job.id)))).toEqual(completed);
    expect([...db.tables.SyncTask.rows.values()][0]).toMatchObject({ state: 'completed', attemptCount: 1 });
    expect(db.writes.filter((write) => write.entity === 'SyncJob' && write.action === 'update')
      .map((write) => write.values.state)).toEqual(['running', 'waiting', 'completed']);
  });

  it('durably cancels the pending task and job; repeated cancel and continue never resurrect them', async () => {
    const db = testDatabase();
    const sync = db.orchestrator();
    const job = requireProjection(await sync.start(startInput()));
    const cancelled = requireProjection(await sync.cancel(jobInput(job.id)));
    expect(cancelled).toMatchObject({ state: 'cancelled', revision: 1, anotherAuthorizedInvocationRequired: false });
    const writes = db.writes.length;
    expect(requireProjection(await sync.cancel(jobInput(job.id)))).toEqual(cancelled);
    expect(db.writes.length).toBe(writes);
    expect(requireProjection(await sync.cancel(jobInput(job.id, THIRD_REQUEST)))).toEqual(cancelled);
    expect(requireProjection(await sync.continue(jobInput(job.id, FOURTH_REQUEST)))).toEqual(cancelled);
    expect([...db.tables.SyncTask.rows.values()][0]).toMatchObject({
      state: 'cancelled', attemptCount: 0, finishedAt: NOW,
    });
    const replacement = requireProjection(await sync.start(startInput(OTHER_WORKSPACE)));
    expect(replacement.id).not.toBe(job.id);
    expect(db.tables.SyncJob.rows.size).toBe(2);
    expect([...db.tables.SyncJob.rows.values()].every((row) => typeof row.activeKey === 'string')).toBe(true);
    expect(requireProjection(await sync.start(startInput()))).toEqual(cancelled);
  });

  it('cancels a waiting job without undoing its already completed task', async () => {
    const db = testDatabase();
    const job = requireProjection(await db.orchestrator().start(startInput()));
    await db.orchestrator().continue(jobInput(job.id));
    expect(requireProjection(await db.orchestrator().cancel(jobInput(job.id, THIRD_REQUEST))))
      .toMatchObject({ state: 'cancelled', revision: 3, completedTasks: 1 });
    expect([...db.tables.SyncTask.rows.values()][0]).toMatchObject({ state: 'completed', attemptCount: 1 });
    expect(requireProjection(await db.orchestrator().continue(jobInput(job.id))).state).toBe('cancelled');
  });

  it('uses only job reads for status, handles no jobs, and filters explicitly requested jobs by workspace', async () => {
    const db = testDatabase();
    expect(await db.orchestrator().status(BASE)).toEqual({
      ok: true, protocolVersion: 1, outcomeCode: 'STATUS', job: null,
    });
    const job = requireProjection(await db.orchestrator().start(startInput()));
    const writes = db.writes.length;
    db.reads.length = 0;
    expect(requireProjection(await db.orchestrator().status(BASE)).id).toBe(job.id);
    expect(requireProjection(await db.orchestrator().status({ ...BASE, jobId: job.id })).id).toBe(job.id);
    expect(db.reads.every((read) => read.entity === 'SyncJob')).toBe(true);
    expect(db.writes.length).toBe(writes);
    expect(await db.orchestrator().status({ ...BASE, workspaceId: OTHER_WORKSPACE, jobId: job.id }))
      .toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('fetches the latest terminal job with a bounded ordered query rather than an unpaged scan', async () => {
    const db = testDatabase();
    const older = fixtureJob('completed');
    const newer: SyncJob = {
      ...fixtureJob('cancelled'), ...jobIdentity(WORKSPACE, NEXT_REQUEST),
      createdAt: new Date(NOW.getTime() + 1),
    };
    newer.activeKey = releasedJobKey(newer.id);
    db.tables.SyncJob.rows.set(older.id, older);
    db.tables.SyncJob.rows.set(newer.id, newer);
    expect(requireProjection(await db.orchestrator().status(BASE)).id).toBe(newer.id);
    expect(db.reads).toEqual([{ entity: 'SyncJob', limit: 2 }, { entity: 'SyncJob', limit: 1 }]);
    expect(db.writes).toEqual([]);
  });

  it.each(['SyncCommand', 'SyncJob', 'SyncTask'] as const)(
    'recovers a committed %s create whose response was lost using unique identities', async (entity) => {
      const db = testDatabase();
      db.fail(entity, 'create', entity === 'SyncCommand' ? 'accepted' : entity === 'SyncJob' ? 'queued' : 'pending', true);
      const response = await db.orchestrator().start(startInput());
      requireProjection(response);
      expect(db.tables.SyncJob.rows.size).toBe(1);
      expect(db.tables.SyncTask.rows.size).toBe(1);
      expect(db.tables.SyncCommand.rows.size).toBe(1);
    },
  );

  it('recovers a partially created job after losing the browser without scheduling or fake timers', async () => {
    const db = testDatabase();
    db.fail('SyncTask', 'create', 'pending');
    expect(await db.orchestrator().start(startInput())).toMatchObject({
      ok: false, error: { code: 'PERSISTENCE_UNAVAILABLE', retryable: true },
    });
    expect(db.tables.SyncJob.rows.size).toBe(1);
    expect(db.tables.SyncTask.rows.size).toBe(0);
    expect([...db.tables.SyncCommand.rows.values()][0].state).toBe('accepted');
    const restored = requireProjection(await db.orchestrator().start(startInput()));
    expect(restored.state).toBe('queued');
    expect(db.tables.SyncJob.rows.size).toBe(1);
    expect(db.tables.SyncTask.rows.size).toBe(1);
  });

  it('resumes a running probe only with the original requestId; there is no lease takeover', async () => {
    const db = testDatabase();
    const job = requireProjection(await db.orchestrator().start(startInput()));
    db.fail('SyncTask', 'update', 'completed');
    expect(await db.orchestrator().continue(jobInput(job.id))).toMatchObject({
      ok: false, error: { code: 'PERSISTENCE_UNAVAILABLE' },
    });
    expect(requireProjection(await db.orchestrator().status(BASE)).state).toBe('running');
    expect([...db.tables.SyncTask.rows.values()][0]).toMatchObject({
      state: 'running', attemptCount: 1, claimRequestId: NEXT_REQUEST,
    });
    [...db.tables.SyncTask.rows.values()][0].updatedAt = new Date('2000-01-01T00:00:00Z');
    expect(await db.orchestrator().continue(jobInput(job.id, THIRD_REQUEST))).toMatchObject({
      ok: false, error: { code: 'TASK_CLAIMED' },
    });
    expect(requireProjection(await db.orchestrator().continue(jobInput(job.id))).state).toBe('waiting');
    expect([...db.tables.SyncTask.rows.values()][0].attemptCount).toBe(1);
  });

  it('repairs a committed task checkpoint without repeating its claim or accidentally finalizing its slice', async () => {
    const db = testDatabase();
    const job = requireProjection(await db.orchestrator().start(startInput()));
    db.fail('SyncJob', 'update', 'waiting');
    expect(await db.orchestrator().continue(jobInput(job.id))).toMatchObject({ ok: false });
    expect([...db.tables.SyncTask.rows.values()][0].state).toBe('completed');
    expect(requireProjection(await db.orchestrator().continue(jobInput(job.id))).state).toBe('waiting');
    db.fail('SyncCommand', 'update', 'completed');
    expect(await db.orchestrator().continue(jobInput(job.id, THIRD_REQUEST))).toMatchObject({ ok: false });
    expect(requireProjection(await db.orchestrator().continue(jobInput(job.id, THIRD_REQUEST))).state).toBe('completed');
    expect([...db.tables.SyncTask.rows.values()][0].attemptCount).toBe(1);
  });

  it('keeps a checkpoint slice stable when its command-completion response is not committed', async () => {
    const db = testDatabase();
    const job = requireProjection(await db.orchestrator().start(startInput()));
    db.fail('SyncCommand', 'update', 'completed');
    expect(await db.orchestrator().continue(jobInput(job.id))).toMatchObject({ ok: false });
    expect(requireProjection(await db.orchestrator().status(BASE)).state).toBe('waiting');
    expect(requireProjection(await db.orchestrator().continue(jobInput(job.id))).state).toBe('waiting');
    expect([...db.tables.SyncTask.rows.values()][0].attemptCount).toBe(1);
  });

  it('recovers interrupted cancellation without allowing continue to revive the task', async () => {
    const db = testDatabase();
    const job = requireProjection(await db.orchestrator().start(startInput()));
    db.fail('SyncJob', 'update', 'cancelled');
    expect(await db.orchestrator().cancel(jobInput(job.id))).toMatchObject({ ok: false });
    expect([...db.tables.SyncTask.rows.values()][0].state).toBe('cancelled');
    expect(requireProjection(await db.orchestrator().continue(jobInput(job.id, THIRD_REQUEST))).state).toBe('cancelled');
    expect(requireProjection(await db.orchestrator().cancel(jobInput(job.id))).state).toBe('cancelled');
  });

  it('projects a failed persisted task as a terminal safe job failure and releases its active key', async () => {
    const db = testDatabase();
    const job = requireProjection(await db.orchestrator().start(startInput()));
    const task = [...db.tables.SyncTask.rows.values()][0];
    Object.assign(task, { state: 'failed', failureMessage: 'private-token', finishedAt: NOW });
    const failed = requireProjection(await db.orchestrator().continue(jobInput(job.id)));
    expect(failed).toMatchObject({
      state: 'failed', revision: 1, failure: { code: 'PROBE_FAILED' },
      anotherAuthorizedInvocationRequired: false,
    });
    expect(JSON.stringify(failed)).not.toContain('private-token');
    expect([...db.tables.SyncJob.rows.values()][0].activeKey).toBe(releasedJobKey(job.id));
  });

  it('fails missing-job commands durably and never exposes driver messages', async () => {
    const db = testDatabase();
    expect(await db.orchestrator().continue(jobInput(OTHER_WORKSPACE))).toMatchObject({
      ok: false, error: { code: 'NOT_FOUND' },
    });
    expect([...db.tables.SyncCommand.rows.values()][0]).toMatchObject({ state: 'failed', outcomeCode: 'NOT_FOUND' });
    expect(await db.orchestrator().continue(jobInput(OTHER_WORKSPACE))).toMatchObject({
      ok: false, error: { code: 'NOT_FOUND' },
    });
    const other = testDatabase();
    other.fail('SyncJob', 'create', 'queued');
    const response = await other.orchestrator().start(startInput());
    expect(response).toMatchObject({ ok: false, error: { code: 'PERSISTENCE_UNAVAILABLE' } });
    expect(JSON.stringify(response)).not.toContain('private');
  });

  it('rejects same-process overlap instead of pretending the Data API provides distributed atomicity', async () => {
    const db = testDatabase();
    let release!: () => void;
    let blocked!: () => void;
    const entered = new Promise<void>((resolve) => { blocked = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    db.tables.SyncCommand.blockNextRead(async () => { blocked(); await gate; });
    const first = db.orchestrator().start(startInput());
    await entered;
    try {
      expect(await db.orchestrator().start(startInput(NEXT_REQUEST))).toMatchObject({
        ok: false, error: { code: 'CONCURRENCY_UNSUPPORTED', retryable: true },
      });
      expect(db.tables.SyncCommand.rows.size).toBe(0);
    } finally {
      release();
      await first;
    }
  });

  it('never accesses manifests, snapshot children or external Fabric endpoints', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    try {
      const db = testDatabase();
      const job = requireProjection(await db.orchestrator().start(startInput()));
      await db.orchestrator().continue(jobInput(job.id));
      await db.orchestrator().continue(jobInput(job.id, THIRD_REQUEST));
      await db.orchestrator().status(BASE);
      await db.orchestrator().cancel(jobInput(job.id, FOURTH_REQUEST));
      expect(new Set(db.writes.map((write) => write.entity)))
        .toEqual(new Set(['SyncCommand', 'SyncJob', 'SyncTask']));
      expect(fetch).not.toHaveBeenCalled();
      expect(JSON.stringify(db.writes)).not.toMatch(/accessToken|publishableKey|endpoint|writerEmail/);
    } finally {
      fetch.mockRestore();
    }
  });
});

describe('generated durable Functions contracts', () => {
  it('keeps flat typed inputs and bounded typed outputs from supported CLI generation', () => {
    expectTypeOf<AppFunctionsSchema['syncStart']['input']>().toEqualTypeOf<SyncStartInput>();
    expectTypeOf<AppFunctionsSchema['syncContinue']['input']>().toEqualTypeOf<SyncJobCommandInput>();
    expectTypeOf<AppFunctionsSchema['syncCancel']['input']>().toEqualTypeOf<SyncJobCommandInput>();
    expectTypeOf<AppFunctionsSchema['syncStatus']['input']>().toEqualTypeOf<{
      protocolVersion: 1; workspaceId: string; jobId: string | undefined;
    }>();
    expectTypeOf<AppFunctionsSchema['syncStart']['output']>().toEqualTypeOf<SyncResponse>();
    expectTypeOf<AppFunctionsSchema['syncContinue']['output']>().toEqualTypeOf<SyncResponse>();
    expectTypeOf<AppFunctionsSchema['syncStatus']['output']>().toEqualTypeOf<SyncResponse>();
    expectTypeOf<AppFunctionsSchema['syncCancel']['output']>().toEqualTypeOf<SyncResponse>();
  });

  it('registers four context-injected functions with no external audiences, including runtime-optional jobId', () => {
    const metadata = JSON.parse(readFileSync(resolve('rayfin', 'functions', 'runtimemetadata.json'), 'utf8')) as {
      schemaVersion: string;
      functions: { functionName: string; contextAudiences: string[]; delegateParameters: {
        name: string; type: string; optional: boolean;
      }[] }[];
    };
    expect(metadata.schemaVersion).toBe('2.0');
    const durableNames = ['syncStart', 'syncContinue', 'syncStatus', 'syncCancel'];
    expect(metadata.functions.map((fn) => fn.functionName))
      .toEqual(['workspaceCollectAccessPolicyEvidence',
        'syncGraphStart', 'syncGraphContinue', 'syncGraphStatus', 'syncGraphCancel',
        'ping', 'workspaceDiscover', 'workspaceCollectCore', 'workspaceCollectDefinitions', 'workspaceCollectItemRelations', 'workspaceCollectKqlMetadata', 'workspaceCollectSqlMetadata', 'workspaceCollectPowerBi', 'searchCatalogPreview', 'workspaceCollectPowerBiScanner', 'workspaceCollectSourceProvenance', ...durableNames]);
    for (const name of durableNames) {
      const fn = metadata.functions.find((candidate) => candidate.functionName === name)!;
      expect(fn.contextAudiences).toEqual([]);
      expect(fn.delegateParameters[0]).toMatchObject({ name: 'ctx', type: 'RayfinContext<AtlasSchema>' });
      expect(fn.delegateParameters[1]).toMatchObject({ name: 'protocolVersion', type: '1' });
      expect(fn.delegateParameters.slice(2).every((parameter) => parameter.type === 'SyncUuidInput')).toBe(true);
    }
    expect(metadata.functions.find((fn) => fn.functionName === 'syncStatus')!.delegateParameters.at(-1))
      .toMatchObject({ name: 'jobId', optional: true });
  });
});
