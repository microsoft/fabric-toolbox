import type { TypedDataClients } from '@microsoft/rayfin-data';
import type { AtlasSchema } from '../../../data/schema.js';
import type { SyncCommand, SyncCommandKind } from '../../../data/SyncCommand.js';
import type { SyncJob } from '../../../data/SyncJob.js';
import type { SyncTask } from '../../../data/SyncTask.js';
import {
  activeJobKey,
  assertJobCheckpoint,
  commandIdentity,
  commandOutcome,
  isTerminal,
  jobIdentity,
  jobTransition,
  persistedCommandFailure,
  projectJob,
  safeSyncCall,
  safeSyncFailure,
  strictUuid,
  SyncError,
  taskIdentity,
  validateInput,
  type SyncJobCommandInput,
  type SyncOutcomeCode,
  type SyncResponse,
  type SyncStartInput,
} from './protocol.js';

export type SyncDataClient = Pick<TypedDataClients<AtlasSchema>, 'SyncJob' | 'SyncTask' | 'SyncCommand'>;

const JOB_FIELDS: (keyof SyncJob)[] = [
  'id', 'workspace_id', 'snapshotId', 'protocolVersion', 'state', 'phase',
  'revision', 'totalTasks', 'completedTasks', 'createdAt', 'updatedAt',
  'finishedAt', 'failureCode', 'failureMessage', 'activeKey',
];
const COMMAND_FIELDS: (keyof SyncCommand)[] = [
  'id', 'workspace_id', 'recordKey', 'requestId', 'command', 'jobId',
  'inputHash', 'state', 'createdAt', 'completedAt', 'outcomeCode',
];
const TASK_FIELDS: (keyof SyncTask)[] = [
  'id', 'workspace_id', 'jobId', 'taskKey', 'kind', 'state', 'attemptCount',
  'claimRequestId', 'createdAt', 'updatedAt', 'finishedAt', 'failureCode', 'failureMessage',
];

// This rejects overlap only within one host process. It is not a distributed lock.
// Operators MUST serialize all mutating invocations across hosts. The fluent API
// exposes neither compare-and-swap nor a transaction spanning these three rows.
// A browser disconnect or client timeout does not prove the prior host invocation ended.
const busyWorkspaces = new Set<string>();

function sameValue(actual: unknown, expected: unknown): boolean {
  if (expected instanceof Date) {
    return (actual instanceof Date || typeof actual === 'string') &&
      new Date(actual).getTime() === expected.getTime();
  }
  return actual === expected;
}

function onlyRow<T>(rows: T[]): T | null {
  if (rows.length > 1) throw new SyncError('CHECKPOINT_INVALID');
  return rows[0] ?? null;
}

interface CommandResult {
  job: SyncJob;
  outcomeCode: SyncOutcomeCode;
}

export class SyncOrchestrator {
  constructor(
    private readonly data: SyncDataClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  start(value: unknown): Promise<SyncResponse> {
    return safeSyncCall(async () => {
      const input = validateInput('start', value);
      return this.mutate('start', input, (command) => this.startJob(command, input));
    });
  }

  continue(value: unknown): Promise<SyncResponse> {
    return safeSyncCall(async () => {
      const input = validateInput('continue', value);
      return this.mutate('continue', input, (command) => this.continueJob(command, input));
    });
  }

  cancel(value: unknown): Promise<SyncResponse> {
    return safeSyncCall(async () => {
      const input = validateInput('cancel', value);
      return this.mutate('cancel', input, (command) => this.cancelJob(command, input));
    });
  }

  status(value: unknown): Promise<SyncResponse> {
    return safeSyncCall(async () => {
      const input = validateInput('status', value);
      const job = input.jobId
        ? await this.requireJob(input.jobId, input.workspaceId)
        : await this.findActiveJob(input.workspaceId) ?? await this.latestJob(input.workspaceId);
      return { ok: true, protocolVersion: 1, outcomeCode: 'STATUS', job: job ? projectJob(job) : null };
    });
  }

  private async mutate(
    kind: SyncCommandKind,
    input: SyncStartInput | SyncJobCommandInput,
    run: (command: SyncCommand) => Promise<CommandResult>,
  ): Promise<SyncResponse> {
    if (busyWorkspaces.has(input.workspaceId)) throw new SyncError('CONCURRENCY_UNSUPPORTED');
    busyWorkspaces.add(input.workspaceId);
    try {
      const command = await this.acceptCommand(kind, input);
      if (command.state === 'failed') throw persistedCommandFailure(command.outcomeCode);
      if (command.state === 'completed') {
        if (!command.jobId) throw new SyncError('CHECKPOINT_INVALID');
        const job = await this.requireJob(command.jobId, input.workspaceId);
        return {
          ok: true, protocolVersion: 1, outcomeCode: commandOutcome(command.outcomeCode), job: projectJob(job),
        };
      }
      try {
        const result = await run(command);
        await this.updateCommand(command, {
          state: 'completed',
          jobId: result.job.id,
          outcomeCode: result.outcomeCode,
          completedAt: this.now(),
        });
        const job = await this.requireJob(result.job.id, input.workspaceId);
        return { ok: true, protocolVersion: 1, outcomeCode: result.outcomeCode, job: projectJob(job) };
      } catch (error) {
        const failure = safeSyncFailure(error);
        // Unconfirmed writes keep the command accepted so the same request can recover.
        if (!failure.error.retryable) {
          try {
            await this.updateCommand(command, {
              state: 'failed', outcomeCode: failure.error.code, completedAt: this.now(),
            });
          } catch {
            // A later authorized invocation can still inspect the last committed checkpoint.
          }
        }
        return failure;
      }
    } finally {
      busyWorkspaces.delete(input.workspaceId);
    }
  }

  private readCommand(recordKey: string): Promise<SyncCommand | null> {
    return this.data.SyncCommand.select(COMMAND_FIELDS)
      .where({ recordKey: { eq: recordKey } }).first(2).execute().then(onlyRow);
  }

  private async acceptCommand(kind: SyncCommandKind, input: SyncStartInput | SyncJobCommandInput) {
    const identity = commandIdentity(kind, input);
    let command = await this.readCommand(identity.recordKey);
    if (!command) {
      const candidate: SyncCommand = {
        ...identity,
        workspace_id: input.workspaceId,
        requestId: input.requestId,
        command: kind,
        ...('jobId' in input ? { jobId: input.jobId } : {}),
        state: 'accepted',
        createdAt: this.now(),
      };
      try {
        await this.data.SyncCommand.create(candidate);
      } catch {
        // Unique keys also handle a committed create whose response was lost.
      }
      command = await this.readCommand(identity.recordKey);
      if (!command) throw new SyncError('PERSISTENCE_UNAVAILABLE');
    }
    if (
      command.inputHash !== identity.inputHash || command.workspace_id !== input.workspaceId ||
      command.requestId !== input.requestId || command.command !== kind ||
      ('jobId' in input && command.jobId !== input.jobId)
    ) throw new SyncError('REQUEST_CONFLICT');
    if (command.id !== identity.id || !['accepted', 'completed', 'failed'].includes(command.state)) {
      throw new SyncError('CHECKPOINT_INVALID');
    }
    return command;
  }

  private async confirmWrite<T extends object>(
    write: () => Promise<unknown>,
    read: () => Promise<T | null>,
    expected: Partial<T>,
  ): Promise<T> {
    try {
      await write();
    } catch {
      // Never assume success from an exception, only from an exact persisted read-back.
    }
    const row = await read();
    if (!row || Object.entries(expected).some(([key, value]) =>
      !sameValue(row[key as keyof T], value))) {
      throw new SyncError('PERSISTENCE_UNAVAILABLE');
    }
    return row;
  }

  private updateCommand(command: SyncCommand, patch: Partial<SyncCommand>): Promise<SyncCommand> {
    return this.confirmWrite(
      () => this.data.SyncCommand.update({ id: command.id }, patch),
      () => this.readCommand(command.recordKey),
      patch,
    );
  }

  private async requireJob(id: string, workspaceId: string): Promise<SyncJob> {
    const job = await this.data.SyncJob.findById(id);
    if (!job || job.workspace_id !== workspaceId) throw new SyncError('NOT_FOUND');
    assertJobCheckpoint(job);
    return job;
  }

  private async findActiveJob(workspaceId: string): Promise<SyncJob | null> {
    const job = onlyRow(await this.data.SyncJob.select(JOB_FIELDS).where({
      workspace_id: { eq: workspaceId }, activeKey: { eq: activeJobKey(workspaceId) },
    }).first(2).execute());
    if (job) assertJobCheckpoint(job);
    return job;
  }

  private async latestJob(workspaceId: string): Promise<SyncJob | null> {
    const rows = await this.data.SyncJob.select(JOB_FIELDS)
      .where({ workspace_id: { eq: workspaceId }, protocolVersion: { eq: 1 } })
      .orderBy({ createdAt: 'desc', id: 'desc' }).first(1).execute();
    const job = rows[0] ?? null;
    if (job) assertJobCheckpoint(job);
    return job;
  }

  private async updateJob(job: SyncJob, patch: Partial<SyncJob>): Promise<SyncJob> {
    const updated = await this.confirmWrite(
      () => this.data.SyncJob.update({ id: job.id }, patch),
      () => this.data.SyncJob.findById(job.id),
      patch,
    );
    assertJobCheckpoint(updated);
    return updated;
  }

  private async startJob(command: SyncCommand, input: SyncStartInput): Promise<CommandResult> {
    const identity = jobIdentity(input.workspaceId, input.requestId);
    let job: SyncJob | null = command.jobId
      ? await this.requireJob(command.jobId, input.workspaceId)
      : await this.data.SyncJob.findById(identity.id);
    if (job && job.workspace_id !== input.workspaceId) throw new SyncError('CHECKPOINT_INVALID');
    job ??= await this.findActiveJob(input.workspaceId);
    if (!job) {
      const now = this.now();
      const candidate: SyncJob = {
        ...identity,
        workspace_id: input.workspaceId,
        protocolVersion: 1,
        state: 'queued',
        phase: 'probe',
        revision: 0,
        totalTasks: 1,
        completedTasks: 0,
        createdAt: now,
        updatedAt: now,
        activeKey: activeJobKey(input.workspaceId),
      };
      try {
        await this.data.SyncJob.create(candidate);
      } catch {
        // Attach to the unique active job, never overwrite the conflicting row.
      }
      job = await this.data.SyncJob.findById(identity.id) ?? await this.findActiveJob(input.workspaceId);
      if (!job) throw new SyncError('PERSISTENCE_UNAVAILABLE');
    }
    assertJobCheckpoint(job);
    const outcomeCode = job.id === identity.id ? 'JOB_CREATED' : 'JOB_ATTACHED';
    if (!command.jobId || !command.outcomeCode) {
      await this.updateCommand(command, { jobId: job.id, outcomeCode });
    }
    if (!isTerminal(job.state)) await this.ensureTask(job);
    return { job: await this.requireJob(job.id, input.workspaceId), outcomeCode };
  }

  private readTask(taskKey: string): Promise<SyncTask | null> {
    return this.data.SyncTask.select(TASK_FIELDS)
      .where({ taskKey: { eq: taskKey } }).first(2).execute().then(onlyRow);
  }

  private async ensureTask(job: SyncJob): Promise<SyncTask> {
    const identity = taskIdentity(job.id);
    let task = await this.readTask(identity.taskKey);
    if (!task) {
      if (job.state !== 'queued') throw new SyncError('CHECKPOINT_INVALID');
      const now = this.now();
      const candidate: SyncTask = {
        ...identity,
        workspace_id: job.workspace_id,
        jobId: job.id,
        kind: 'probe',
        state: 'pending',
        attemptCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      try {
        await this.data.SyncTask.create(candidate);
      } catch {
        // Read-back must match the one deterministic task, including its job.
      }
      task = await this.readTask(identity.taskKey);
      if (!task) throw new SyncError('PERSISTENCE_UNAVAILABLE');
    }
    this.assertTask(task, job);
    return task;
  }

  private assertTask(task: SyncTask, job: SyncJob): void {
    const identity = taskIdentity(job.id);
    if (
      task.id !== identity.id || task.taskKey !== identity.taskKey ||
      task.workspace_id !== job.workspace_id || task.jobId !== job.id || task.kind !== 'probe' ||
      !['pending', 'running', 'completed', 'failed', 'cancelled'].includes(task.state) ||
      !Number.isInteger(task.attemptCount) || task.attemptCount < 0 || task.attemptCount > 2_147_483_647 ||
      (task.state === 'pending' && (task.attemptCount !== 0 || task.claimRequestId)) ||
      ((task.state === 'running' || task.state === 'completed') &&
        (task.attemptCount !== 1 || !task.claimRequestId))
    ) throw new SyncError('CHECKPOINT_INVALID');
    if (task.claimRequestId) strictUuid(task.claimRequestId);
  }

  private async updateTask(task: SyncTask, job: SyncJob, patch: Partial<SyncTask>): Promise<SyncTask> {
    const updated = await this.confirmWrite(
      () => this.data.SyncTask.update({ id: task.id }, patch),
      () => this.readTask(task.taskKey),
      patch,
    );
    this.assertTask(updated, job);
    return updated;
  }

  private async continueJob(command: SyncCommand, input: SyncJobCommandInput): Promise<CommandResult> {
    let job = await this.requireJob(input.jobId, input.workspaceId);
    if (isTerminal(job.state)) {
      return {
        job, outcomeCode: command.outcomeCode ? commandOutcome(command.outcomeCode) : 'ALREADY_TERMINAL',
      };
    }
    let task = await this.ensureTask(job);
    if (task.state === 'cancelled' || task.state === 'failed') {
      const cancelled = task.state === 'cancelled';
      const failure = safeSyncFailure(new SyncError('PROBE_FAILED')).error;
      job = await this.updateJob(job, {
        ...jobTransition(job, cancelled ? 'cancelled' : 'failed', this.now()),
        ...(!cancelled ? { failureCode: failure.code, failureMessage: failure.message } : {}),
      });
      return { job, outcomeCode: 'ALREADY_TERMINAL' };
    }
    const outcomeCode = command.outcomeCode
      ? commandOutcome(command.outcomeCode)
      : job.state === 'waiting' ? 'PROBE_FINALIZED' : 'PROBE_COMPLETED';
    if (outcomeCode !== 'PROBE_COMPLETED' && outcomeCode !== 'PROBE_FINALIZED') {
      throw new SyncError('CHECKPOINT_INVALID');
    }
    if (!command.outcomeCode) await this.updateCommand(command, { outcomeCode });
    if (outcomeCode === 'PROBE_FINALIZED') {
      if (job.state !== 'waiting' || task.state !== 'completed') throw new SyncError('CHECKPOINT_INVALID');
      job = await this.updateJob(job, jobTransition(job, 'completed', this.now()));
      return { job, outcomeCode };
    }
    if (task.state === 'running' && task.claimRequestId !== input.requestId) {
      throw new SyncError('TASK_CLAIMED');
    }
    if (job.state === 'waiting') {
      if (task.state !== 'completed') throw new SyncError('CHECKPOINT_INVALID');
      return { job, outcomeCode };
    }
    if (task.state === 'pending') {
      task = await this.updateTask(task, job, {
        state: 'running', claimRequestId: input.requestId, attemptCount: 1, updatedAt: this.now(),
      });
    }
    if (job.state === 'queued') job = await this.updateJob(job, jobTransition(job, 'running', this.now()));
    if (task.state === 'running') {
      // No Fabric call or simulated work. This task proves only durable checkpoint writes.
      const now = this.now();
      task = await this.updateTask(task, job, { state: 'completed', updatedAt: now, finishedAt: now });
    }
    if (task.state !== 'completed') throw new SyncError('CHECKPOINT_INVALID');
    job = await this.updateJob(job, jobTransition(job, 'waiting', this.now()));
    return { job, outcomeCode };
  }

  private async cancelJob(command: SyncCommand, input: SyncJobCommandInput): Promise<CommandResult> {
    let job = await this.requireJob(input.jobId, input.workspaceId);
    if (isTerminal(job.state)) {
      return {
        job, outcomeCode: command.outcomeCode ? commandOutcome(command.outcomeCode) : 'ALREADY_TERMINAL',
      };
    }
    if (!command.outcomeCode) await this.updateCommand(command, { outcomeCode: 'JOB_CANCELLED' });
    const task = await this.ensureTask(job);
    if (task.state === 'pending' || task.state === 'running') {
      const now = this.now();
      await this.updateTask(task, job, { state: 'cancelled', updatedAt: now, finishedAt: now });
    }
    job = await this.updateJob(job, jobTransition(job, 'cancelled', this.now()));
    return { job, outcomeCode: 'JOB_CANCELLED' };
  }
}
