import { createHash } from 'node:crypto';
import type { SyncCommandKind } from '../../../data/SyncCommand.js';
import type { SyncJob, SyncJobState } from '../../../data/SyncJob.js';

// Custom annotations bypass the SDK's coercive/echoing primitive converter.
// The strict validator below owns validation; typegen still resolves this to string.
export type SyncUuidInput = string;

export interface SyncStartInput {
  protocolVersion: 1;
  workspaceId: string;
  requestId: string;
}

export interface SyncJobCommandInput extends SyncStartInput {
  jobId: string;
}

export interface SyncStatusInput {
  protocolVersion: 1;
  workspaceId: string;
  jobId?: string;
}

const ERROR_DETAILS = {
  INVALID_INPUT: { message: 'Use protocolVersion 1 and strict UUID inputs only.', retryable: false },
  REQUEST_CONFLICT: { message: 'This requestId was already used with different input.', retryable: false },
  NOT_FOUND: { message: 'The requested probe job was not found in this workspace.', retryable: false },
  PERSISTENCE_UNAVAILABLE: {
    message: 'The checkpoint could not be confirmed. Check Rayfin access and retry the same request.',
    retryable: true,
  },
  CONCURRENCY_UNSUPPORTED: {
    message: 'Serialize authorized synchronization invocations before retrying. Distributed concurrency is unsupported.',
    retryable: true,
  },
  TASK_CLAIMED: {
    message: 'The running probe belongs to another requestId. Resume its original request or cancel the job.',
    retryable: false,
  },
  CHECKPOINT_INVALID: { message: 'The persisted probe checkpoint is inconsistent. Authorized repair is required.', retryable: false },
  COMMAND_FAILED: { message: 'This command previously failed. Use a new requestId after resolving the failure.', retryable: false },
  PROBE_FAILED: { message: 'The persistence probe failed. No workspace snapshot was published.', retryable: false },
} as const;

export type SyncErrorCode = keyof typeof ERROR_DETAILS;
export type SyncOutcomeCode =
  | 'STATUS'
  | 'JOB_CREATED'
  | 'JOB_ATTACHED'
  | 'PROBE_COMPLETED'
  | 'PROBE_FINALIZED'
  | 'JOB_CANCELLED'
  | 'ALREADY_TERMINAL';

export class SyncError extends Error {
  constructor(readonly code: SyncErrorCode) {
    super(ERROR_DETAILS[code].message);
    this.name = 'SyncError';
  }
}

export interface SyncFailure {
  ok: false;
  protocolVersion: 1;
  error: { code: SyncErrorCode; message: string; retryable: boolean };
}

export interface SyncJobProjection {
  id: string;
  workspaceId: string;
  snapshotId: string;
  protocolVersion: 1;
  scope: 'persistence-probe';
  state: SyncJobState;
  phase: 'probe';
  revision: number;
  completedTasks: number;
  totalTasks: number;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  failure: SyncFailure['error'] | null;
  nextAction: 'syncContinue' | 'none';
  anotherAuthorizedInvocationRequired: boolean;
  backgroundExecution: false;
  snapshotPublished: false;
  message: string;
}

export type SyncResponse =
  | { ok: true; protocolVersion: 1; outcomeCode: SyncOutcomeCode; job: SyncJobProjection | null }
  | SyncFailure;

export function safeSyncFailure(error: unknown): SyncFailure {
  const code = error instanceof SyncError ? error.code : 'PERSISTENCE_UNAVAILABLE';
  return { ok: false, protocolVersion: 1, error: { code, ...ERROR_DETAILS[code] } };
}

export async function safeSyncCall(run: () => Promise<SyncResponse>): Promise<SyncResponse> {
  try {
    return await run();
  } catch (error) {
    return safeSyncFailure(error);
  }
}

// RFC 9562 versions 1-8 and the RFC variant; no coercion, whitespace, nil or URLs.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function strictUuid(value: unknown): string {
  if (typeof value !== 'string' || value.length !== 36 || !UUID.test(value)) {
    throw new SyncError('INVALID_INPUT');
  }
  return value.toLowerCase();
}

export function validateInput(command: 'start', value: unknown): SyncStartInput;
export function validateInput(command: 'continue' | 'cancel', value: unknown): SyncJobCommandInput;
export function validateInput(command: 'status', value: unknown): SyncStatusInput;
export function validateInput(
  command: SyncCommandKind | 'status',
  value: unknown,
): SyncStartInput | SyncJobCommandInput | SyncStatusInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SyncError('INVALID_INPUT');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new SyncError('INVALID_INPUT');
  const input = value as Record<string, unknown>;
  const allowed = command === 'status'
    ? ['protocolVersion', 'workspaceId', 'jobId']
    : command === 'start'
      ? ['protocolVersion', 'workspaceId', 'requestId']
      : ['protocolVersion', 'workspaceId', 'jobId', 'requestId'];
  if (input.protocolVersion !== 1 || Object.keys(input).some((key) => !allowed.includes(key))) {
    throw new SyncError('INVALID_INPUT');
  }
  const workspaceId = strictUuid(input.workspaceId);
  if (command === 'status') {
    return input.jobId === undefined
      ? { protocolVersion: 1, workspaceId }
      : { protocolVersion: 1, workspaceId, jobId: strictUuid(input.jobId) };
  }
  const requestId = strictUuid(input.requestId);
  return command === 'start'
    ? { protocolVersion: 1, workspaceId, requestId }
    : { protocolVersion: 1, workspaceId, requestId, jobId: strictUuid(input.jobId) };
}

function digest(parts: readonly (string | number | null)[]): string {
  return createHash('sha256').update(JSON.stringify(['fabric-atlas-sync', 1, ...parts])).digest('hex');
}

// UUIDv8 carries a domain-separated SHA-256 identity, not a random or UUIDv5 ID.
function hashUuid(hash: string): string {
  const hex = `${hash.slice(0, 12)}8${hash.slice(13, 16)}${((parseInt(hash[16], 16) & 3) | 8).toString(16)}${hash.slice(17, 32)}`;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function commandIdentity(command: SyncCommandKind, input: SyncStartInput | SyncJobCommandInput) {
  if (input.protocolVersion !== 1) throw new SyncError('INVALID_INPUT');
  const workspaceId = strictUuid(input.workspaceId);
  const requestId = strictUuid(input.requestId);
  const jobId = 'jobId' in input ? strictUuid(input.jobId) : null;
  const hash = digest(['command', requestId]);
  return {
    id: hashUuid(hash),
    recordKey: `v1:command:${hash}`,
    inputHash: digest(['input', command, workspaceId, requestId, jobId]),
  };
}

export function jobIdentity(workspaceId: string, requestId: string) {
  const id = hashUuid(digest(['job', strictUuid(workspaceId), strictUuid(requestId)]));
  return { id, snapshotId: hashUuid(digest(['snapshot', id])) };
}

export function taskIdentity(jobId: string) {
  const hash = digest(['task', strictUuid(jobId), 'probe']);
  return { id: hashUuid(hash), taskKey: `v1:probe:${hash}` };
}

export function activeJobKey(workspaceId: string): string {
  return `v1:active:${digest(['workspace', strictUuid(workspaceId)])}`;
}

export function releasedJobKey(jobId: string): string {
  return `v1:released:${strictUuid(jobId)}`;
}

export function isTerminal(state: SyncJobState): boolean {
  return state === 'completed' || state === 'failed' || state === 'cancelled';
}

const TRANSITIONS: Record<SyncJobState, readonly SyncJobState[]> = {
  queued: ['running', 'failed', 'cancelled'],
  running: ['waiting', 'failed', 'cancelled'],
  waiting: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

export function jobTransition(job: SyncJob, state: SyncJobState, now: Date): Partial<SyncJob> {
  if (!TRANSITIONS[job.state].includes(state) || job.revision >= 2_147_483_647) {
    throw new SyncError('CHECKPOINT_INVALID');
  }
  return {
    state,
    revision: job.revision + 1,
    completedTasks: state === 'waiting' || state === 'completed' ? 1 : job.completedTasks,
    updatedAt: now,
    ...(isTerminal(state) ? { activeKey: releasedJobKey(job.id), finishedAt: now } : {}),
  };
}

function timestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new SyncError('CHECKPOINT_INVALID');
  return date.toISOString();
}

export function assertJobCheckpoint(job: SyncJob): void {
  if (
    !UUID.test(job.id) || !UUID.test(job.workspace_id) || !UUID.test(job.snapshotId) ||
    job.protocolVersion !== 1 || job.phase !== 'probe' || !Object.hasOwn(TRANSITIONS, job.state) ||
    !Number.isInteger(job.revision) || job.revision < 0 || job.revision > 2_147_483_647 ||
    job.totalTasks !== 1 || ![0, 1].includes(job.completedTasks) ||
    ((job.state === 'waiting' || job.state === 'completed') && job.completedTasks !== 1) ||
    (job.state === 'queued' && job.completedTasks !== 0) ||
    (isTerminal(job.state) && !job.finishedAt) ||
    job.activeKey !== (isTerminal(job.state) ? releasedJobKey(job.id) : activeJobKey(job.workspace_id))
  ) {
    throw new SyncError('CHECKPOINT_INVALID');
  }
}

const STATE_MESSAGES: Record<SyncJobState, string> = {
  queued: 'The probe is queued. Another authorized invocation is required.',
  running: 'A new authorized invocation with the original requestId is required to resume this checkpoint.',
  waiting: 'The probe checkpoint is committed. Another authorized invocation is required to finish the probe job.',
  completed: 'The persistence probe is complete. No workspace snapshot was published.',
  failed: 'The probe job failed. No workspace snapshot was published.',
  cancelled: 'The probe job was cancelled. No workspace snapshot was published.',
};

export function projectJob(job: SyncJob): SyncJobProjection {
  assertJobCheckpoint(job);
  const active = !isTerminal(job.state);
  const failureCode = job.failureCode && Object.hasOwn(ERROR_DETAILS, job.failureCode)
    ? job.failureCode as SyncErrorCode
    : 'PROBE_FAILED';
  return {
    id: job.id,
    workspaceId: job.workspace_id,
    snapshotId: job.snapshotId,
    protocolVersion: 1,
    scope: 'persistence-probe',
    state: job.state,
    phase: 'probe',
    revision: job.revision,
    completedTasks: job.completedTasks,
    totalTasks: job.totalTasks,
    createdAt: timestamp(job.createdAt),
    updatedAt: timestamp(job.updatedAt),
    finishedAt: job.finishedAt ? timestamp(job.finishedAt) : null,
    failure: job.state === 'failed' ? safeSyncFailure(new SyncError(failureCode)).error : null,
    nextAction: active ? 'syncContinue' : 'none',
    anotherAuthorizedInvocationRequired: active,
    backgroundExecution: false,
    snapshotPublished: false,
    message: STATE_MESSAGES[job.state],
  };
}

export function commandOutcome(value: string | undefined): SyncOutcomeCode {
  if (!value || ![
    'JOB_CREATED', 'JOB_ATTACHED', 'PROBE_COMPLETED', 'PROBE_FINALIZED',
    'JOB_CANCELLED', 'ALREADY_TERMINAL',
  ].includes(value)) throw new SyncError('CHECKPOINT_INVALID');
  return value as SyncOutcomeCode;
}

export function persistedCommandFailure(value: string | undefined): SyncError {
  return new SyncError(value && Object.hasOwn(ERROR_DETAILS, value) ? value as SyncErrorCode : 'COMMAND_FAILED');
}
