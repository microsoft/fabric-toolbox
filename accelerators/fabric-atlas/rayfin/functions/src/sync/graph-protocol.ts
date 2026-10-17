import { createHash } from 'node:crypto';
import type { RootRunState, SyncRootRun } from '../../../data/SyncRootRun.js';
import type { SyncJob } from '../../../data/SyncJob.js';
import type { SyncTask } from '../../../data/SyncTask.js';
import { strictUuid } from './protocol.js';

export const GRAPH_VERSION = 2 as const;
export const STAGES = ['core', 'definitions', 'relations', 'kql', 'sql', 'scanner', 'persist', 'publish'] as const;
export type GraphStage = typeof STAGES[number];
export type CollectorStage = Exclude<GraphStage, 'persist' | 'publish'>;
export const MAX_WORKSPACES = 16;
export const SERIALIZATION_SCOPE = 'atlas:snapshot-writer:v2';

const ERRORS = {
  INVALID_INPUT: 'Use protocolVersion 2 and strict UUIDs only.',
  NOT_AUTHORIZED: 'Synchronization authorization failed.',
  SERIALIZATION_REQUIRED: 'No reviewed external serializer is installed. No work was started.',
  LEASE_UNSUPPORTED: 'Timed claims and lease takeover are unsupported.',
  ADAPTER_REQUIRED: 'A reviewed collector, immutable payload store or snapshot assembler is not installed.',
  NOT_FOUND: 'The requested run was not found.',
  REQUEST_CONFLICT: 'The request UUID is already bound to different input.',
  WORKSPACE_BUSY: 'This workspace already has an unfinished v2 run.',
  TASK_CLAIMED: 'Resume the original request only after its previous invocation has ended.',
  CHECKPOINT_INVALID: 'The stored graph checkpoint is inconsistent. Authorized repair is required.',
  PERSISTENCE_UNAVAILABLE: 'The write could not be confirmed. Retry the same request after the invocation ends.',
  CANCELLED: 'The run was cancelled. No later snapshot publication is allowed.',
  PAYLOAD_INVALID: 'The projected metadata payload is invalid or changed.',
} as const;
export type GraphErrorCode = keyof typeof ERRORS;
export class GraphError extends Error {
  constructor(readonly code: GraphErrorCode) {
    super(ERRORS[code]);
    this.name = 'GraphError';
  }
}

export interface GraphStartInput {
  protocolVersion: 2;
  requestId: string;
  workspaceIds: string[];
}
export interface GraphStatusInput { protocolVersion: 2; rootRunId: string }
export interface GraphContinueInput extends GraphStatusInput { workspaceId: string; requestId: string }
export interface GraphCancelInput extends GraphStatusInput { requestId: string }
export interface PayloadReference { id: string; hash: string }
export interface GraphProjection {
  rootRunId: string;
  state: RootRunState;
  workspaces: {
    workspaceId: string;
    jobId: string;
    state: Exclude<SyncJob['state'], 'failed'>;
    phase: Exclude<SyncJob['phase'], 'probe'>;
    completedTasks: number;
    totalTasks: number;
    snapshotPublished: boolean;
  }[];
  backgroundExecution: false;
  distributedClaims: false;
  continuation: 'externally-serialized-invocation';
}
export type GraphResponse =
  | { ok: true; protocolVersion: 2; run: GraphProjection }
  | { ok: false; protocolVersion: 2; error: { code: GraphErrorCode; message: string; retryable: boolean } };

export async function safeGraphCall(run: () => Promise<GraphResponse>): Promise<GraphResponse> {
  try { return await run(); }
  catch (error) {
    const code = error instanceof GraphError ? error.code : 'PERSISTENCE_UNAVAILABLE';
    return {
      ok: false, protocolVersion: 2,
      error: { code, message: ERRORS[code], retryable: code === 'PERSISTENCE_UNAVAILABLE' },
    };
  }
}

export function uuid(value: unknown): string {
  try { return strictUuid(value); } catch { throw new GraphError('INVALID_INPUT'); }
}
export function objectInput(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Object.keys(value).some((key) => !keys.includes(key))) throw new GraphError('INVALID_INPUT');
  return value as Record<string, unknown>;
}
export function parseStart(value: unknown): GraphStartInput {
  const input = objectInput(value, ['protocolVersion', 'requestId', 'workspaceIds']);
  if (input.protocolVersion !== 2 || !Array.isArray(input.workspaceIds) ||
      input.workspaceIds.length < 1 || input.workspaceIds.length > MAX_WORKSPACES) throw new GraphError('INVALID_INPUT');
  const workspaceIds = input.workspaceIds.map(uuid).sort();
  if (new Set(workspaceIds).size !== workspaceIds.length) throw new GraphError('INVALID_INPUT');
  return { protocolVersion: 2, requestId: uuid(input.requestId), workspaceIds };
}
export function parseCommand(value: unknown, command: 'status'): GraphStatusInput;
export function parseCommand(value: unknown, command: 'cancel'): GraphCancelInput;
export function parseCommand(value: unknown, command: 'continue'): GraphContinueInput;
export function parseCommand(value: unknown, command: 'status' | 'cancel' | 'continue') {
  const input = objectInput(value, ['protocolVersion', 'rootRunId',
    ...(command === 'status' ? [] : ['requestId']), ...(command === 'continue' ? ['workspaceId'] : [])]);
  if (input.protocolVersion !== 2) throw new GraphError('INVALID_INPUT');
  return {
    protocolVersion: 2 as const, rootRunId: uuid(input.rootRunId),
    ...(command === 'status' ? {} : { requestId: uuid(input.requestId) }),
    ...(command === 'continue' ? { workspaceId: uuid(input.workspaceId) } : {}),
  };
}

export function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value)
    .filter(([, item]) => item !== undefined && item !== null).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function hash(value: unknown): string {
  return createHash('sha256').update(canonical(['atlas-graph', 2, value])).digest('hex');
}
export function identity(...parts: unknown[]): string {
  const h = hash(parts);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export function reference(value: unknown): PayloadReference {
  const input = objectInput(value, ['id', 'hash']);
  if (typeof input.hash !== 'string' || !/^[a-f0-9]{64}$/.test(input.hash)) throw new GraphError('PAYLOAD_INVALID');
  return { id: uuid(input.id), hash: input.hash };
}
export const jobIdFor = (rootId: string, workspaceId: string) => identity('workspace', uuid(rootId), uuid(workspaceId));
export const taskIdFor = (jobId: string, stage: GraphStage) => identity('task', uuid(jobId), stage);
export const activeKeyFor = (workspaceId: string) => `v2:active:${hash(uuid(workspaceId))}`;
export const releasedKeyFor = (jobId: string) => `v2:released:${uuid(jobId)}`;

const ROOT_TRANSITIONS: Record<RootRunState, readonly RootRunState[]> = {
  planning: ['ready', 'cancelled'], ready: ['running', 'cancelled'],
  running: ['completed', 'cancelled'], completed: [], cancelled: [],
};
export function rootTransition(root: SyncRootRun, state: RootRunState, now: Date): Partial<SyncRootRun> {
  if (!ROOT_TRANSITIONS[root.state]?.includes(state)) throw new GraphError('CHECKPOINT_INVALID');
  return { state, updatedAt: now, ...(state === 'completed' || state === 'cancelled' ? { finishedAt: now } : {}),
    ...(state === 'cancelled' ? { cancelRequestedAt: now } : {}) };
}

export function assertTask(task: SyncTask, job: SyncJob, ordinal: number): void {
  if (task.leaseExpiresAt != null || task.claimEpoch != null) throw new GraphError('LEASE_UNSUPPORTED');
  if (task.protocolVersion !== 2 || task.jobId !== job.id || task.rootRunId !== job.rootRunId ||
      task.workspace_id !== job.workspace_id || task.kind !== STAGES[ordinal] || task.ordinal !== ordinal ||
      task.id !== taskIdFor(job.id, STAGES[ordinal]) || task.taskKey !== `v2:task:${task.id}` ||
      (task.dependsOnTaskId ?? null) !== (ordinal ? taskIdFor(job.id, STAGES[ordinal - 1]) : null) ||
      !['pending', 'running', 'completed'].includes(task.state) ||
      !Number.isInteger(task.attemptCount) || task.attemptCount < 0 || task.attemptCount >= 2_147_483_647 ||
      (task.checkpointOffset != null && (!Number.isInteger(task.checkpointOffset) || task.checkpointOffset < 0 || task.checkpointOffset > 50_000)) ||
      (task.state === 'running' && !task.claimRequestId)) throw new GraphError('CHECKPOINT_INVALID');
  if (task.claimRequestId) uuid(task.claimRequestId);
  if (task.payloadRef || task.payloadHash) reference({ id: task.payloadRef, hash: task.payloadHash });
  if (task.checkpointRef || task.checkpointHash) reference({ id: task.checkpointRef, hash: task.checkpointHash });
}

/** The implementation must serialize ALL writers, including cancellation and legacy sync.
 * It may not hand ownership to another invocation while any prior write can still commit.
 * A process-local mutex, caller assertion, or an expiring row is not this capability.
 */
export interface ExternalSerializer {
  run<T>(scope: typeof SERIALIZATION_SCOPE, work: (guard: SerializationGuard) => Promise<T>): Promise<T>;
}
export interface SerializationGuard {
  assertHeld(): Promise<void>;
}
