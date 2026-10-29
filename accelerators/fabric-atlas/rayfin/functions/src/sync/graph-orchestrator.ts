import type { TypedDataClients } from '@microsoft/rayfin-data';
import type { AtlasSchema } from '../../../data/schema.js';
import type { SyncRootRun } from '../../../data/SyncRootRun.js';
import type { SyncJob } from '../../../data/SyncJob.js';
import type { SyncTask } from '../../../data/SyncTask.js';
import type { SyncCommand } from '../../../data/SyncCommand.js';
import {
  activeKeyFor, assertTask, GraphError, hash, identity, jobIdFor, MAX_WORKSPACES, objectInput,
  parseCommand, parseStart, reference, releasedKeyFor, rootTransition, safeGraphCall,
  SERIALIZATION_SCOPE, STAGES, taskIdFor, uuid,
  type CollectorStage, type ExternalSerializer, type GraphContinueInput, type GraphProjection, type GraphResponse,
  type PayloadReference, type SerializationGuard,
} from './graph-protocol.js';
import {
  confirmedWrite, prepareSnapshot, SnapshotPublisher,
  type SnapshotData, type SnapshotDraft,
} from './snapshot-publisher.js';

export type GraphData = Pick<TypedDataClients<AtlasSchema>, 'SyncRootRun' | 'SyncJob' | 'SyncTask' | 'SyncCommand'> & SnapshotData;
export interface CollectorContext {
  rootRunId: string;
  workspaceId: string;
  taskId: string;
  checkpoint?: PayloadReference;
  dependencies: Partial<Record<CollectorStage, PayloadReference>>;
  check: () => Promise<void>;
}
export type CollectorSlice =
  | { done: true; payload: PayloadReference }
  | { done: false; checkpoint: PayloadReference };
/** Bind only to a reviewed external metadata store. writeOnce must read back an
 * existing task/checkpoint result after lost responses rather than overwrite it.
 * No production store is installed by this framework.
 */
export interface MetadataPayloadStore<TProjection> {
  writeOnce(taskId: string, checkpointId: string | null, projection: TProjection): Promise<PayloadReference>;
  read(reference: PayloadReference): Promise<TProjection>;
}
export interface GraphAdapters {
  collectors: Record<CollectorStage, (context: CollectorContext) => Promise<CollectorSlice>>;
  /** Read immutable, checksum-verified, metadata-only payloads by UUID. No URLs or tokens.
   * Deterministic assembly must use only these references, never re-collect live data.
   */
  assemble(workspaceId: string, inputs: Record<CollectorStage, PayloadReference>): Promise<SnapshotDraft>;
  writerEmail: string;
}
export interface GraphRuntime {
  serializer: ExternalSerializer;
  adapters: GraphAdapters;
}

const JOB_FIELDS: (keyof SyncJob)[] = [
  'id', 'workspace_id', 'snapshotId', 'protocolVersion', 'state', 'phase', 'rootRunId',
  'revision', 'totalTasks', 'completedTasks', 'createdAt', 'updatedAt', 'finishedAt',
  'activeKey', 'publicationState', 'manifestId', 'snapshotHash',
  'initiatedByEmail',
];

export class GraphOrchestrator {
  constructor(
    private readonly data: GraphData,
    private readonly runtime?: GraphRuntime,
    private readonly now: () => Date = () => new Date(),
    private readonly sleep?: (milliseconds: number) => Promise<void>,
  ) {}

  start(value: unknown): Promise<GraphResponse> {
    return safeGraphCall(async () => {
      const input = parseStart(value);
      return this.exclusive(async (guard) => {
        this.requireAdapters();
        const id = identity('root', input.requestId);
        const planHash = hash([input.workspaceIds, STAGES]);
        let root = await this.data.SyncRootRun.findById(id);
        if (!root) {
          const candidate: SyncRootRun = {
            id, requestId: input.requestId, protocolVersion: 2, planHash, workspaceCount: input.workspaceIds.length,
            executionMode: 'external-serialized', state: 'planning', createdAt: this.now(), updatedAt: this.now(),
          };
          await guard.assertHeld();
          root = await confirmedWrite(() => this.data.SyncRootRun.create(candidate),
            () => this.data.SyncRootRun.findById(id), candidate);
        }
        this.assertRoot(root);
        if (root.planHash !== planHash || root.requestId !== input.requestId) throw new GraphError('REQUEST_CONFLICT');
        if (root.state !== 'planning') return this.project(root);
        for (const workspaceId of input.workspaceIds) {
          await this.check(root.id, guard);
          const jobId = jobIdFor(id, workspaceId);
          let job = await this.data.SyncJob.findById(jobId);
          if (!job) {
            const active = await this.data.SyncJob.select(['id'])
              .where({ activeKey: { eq: activeKeyFor(workspaceId) } }).first(2).execute();
            if (active.length) throw new GraphError('WORKSPACE_BUSY');
            const candidate: SyncJob = {
              id: jobId, rootRunId: id, workspace_id: workspaceId, snapshotId: identity('snapshot', jobId),
              protocolVersion: 2, state: 'queued', phase: 'collect', revision: 0, totalTasks: STAGES.length,
              completedTasks: 0, activeKey: activeKeyFor(workspaceId), createdAt: root.createdAt,
              updatedAt: root.createdAt, publicationState: 'unpublished',
              initiatedByEmail: this.runtime!.adapters.writerEmail,
            };
            job = await confirmedWrite(() => this.data.SyncJob.create(candidate),
              () => this.data.SyncJob.findById(jobId), candidate);
          }
          this.assertJob(job, root);
          for (let ordinal = 0; ordinal < STAGES.length; ordinal++) {
            await this.check(root.id, guard);
            const stage = STAGES[ordinal];
            const taskId = taskIdFor(jobId, stage);
            let task = await this.data.SyncTask.findById(taskId);
            if (!task) {
              const candidate: SyncTask = {
                id: taskId, workspace_id: workspaceId, jobId, rootRunId: id, protocolVersion: 2,
                ordinal, taskKey: `v2:task:${taskId}`, kind: stage, state: 'pending', attemptCount: 0,
                ...(ordinal ? { dependsOnTaskId: taskIdFor(jobId, STAGES[ordinal - 1]) } : {}),
                createdAt: root.createdAt, updatedAt: root.createdAt,
              };
              task = await confirmedWrite(() => this.data.SyncTask.create(candidate),
                () => this.data.SyncTask.findById(taskId), candidate);
            }
            assertTask(task, job, ordinal);
          }
        }
        await this.check(root.id, guard);
        root = await this.updateRoot(root, rootTransition(root, 'ready', this.now()));
        return this.project(root);
      });
    });
  }

  continue(value: unknown): Promise<GraphResponse> {
    return safeGraphCall(async () => {
      const input = parseCommand(value, 'continue');
      return this.exclusive(async (guard) => {
        this.requireAdapters();
        let root = await this.requireRoot(input.rootRunId);
        if (root.state === 'cancelled' || root.state === 'completed') return this.project(root);
        if (root.state === 'planning') throw new GraphError('CHECKPOINT_INVALID');
        let job = await this.data.SyncJob.findById(jobIdFor(root.id, input.workspaceId));
        if (!job) throw new GraphError('NOT_FOUND');
        this.assertJob(job, root);
        if (job.state === 'completed') {
          await this.finishRoot(root, guard);
          return this.project(await this.requireRoot(root.id));
        }
        if (job.initiatedByEmail !== this.runtime!.adapters.writerEmail) throw new GraphError('CHECKPOINT_INVALID');
        if (root.state === 'ready') root = await this.updateRoot(root, rootTransition(root, 'running', this.now()));
        const tasks = await this.tasks(job);
        const command = await this.acceptCommand(input, job, tasks, guard);
        if (command.state === 'completed') return this.project(root);
        const task = tasks.find((task) => task.id === command.taskId);
        if (!task) throw new GraphError('CHECKPOINT_INVALID');
        const ordinal = task.ordinal!;
        if (tasks.slice(0, ordinal).some((task) => task.state !== 'completed')) throw new GraphError('CHECKPOINT_INVALID');
        const check = () => this.check(root.id, guard);
        const publisher = new SnapshotPublisher(this.data, check, this.sleep);
        const expectedAttempt = command.taskAttempt!;
        const sliceCommitted = task.state === 'completed' || task.attemptCount > expectedAttempt ||
          (task.attemptCount === expectedAttempt && task.state === 'pending');
        if (!sliceCommitted && task.state === 'running' && task.claimRequestId !== input.requestId) throw new GraphError('TASK_CLAIMED');
        if (task.attemptCount < expectedAttempt - 1) throw new GraphError('CHECKPOINT_INVALID');
        if (!sliceCommitted) {
          await check();
          const claimed = task.state === 'running' ? task : await this.updateTask(task, {
            state: 'running', claimRequestId: input.requestId, attemptCount: task.attemptCount + 1, updatedAt: this.now(),
          });
          if (job.state === 'queued') job = await this.updateJob(job, { state: 'running' });
          await publisher.beginAudit(job, this.runtime!.adapters.writerEmail);
          await this.execute(claimed, job, tasks, publisher, check);
        }
        // Repair job/command projections after a committed task update with a lost response.
        const currentTasks = await this.tasks(job);
        const complete = currentTasks.filter((task) => task.state === 'completed').length;
        const published = currentTasks[STAGES.length - 1].state === 'completed';
        await check();
        job = (await this.data.SyncJob.findById(job.id))!;
        if (!job) throw new GraphError('CHECKPOINT_INVALID');
        this.assertJob(job, root);
        job = await this.updateJob(job, {
          completedTasks: complete, phase: complete < 6 ? 'collect' : complete < 7 ? 'persist' : 'publish',
          state: published ? 'completed' : complete >= 7 ? 'waiting' : 'running',
          publicationState: published ? 'published' : complete >= 7 ? 'staged' : 'unpublished',
          ...(published ? { manifestId: identity('manifest', job.snapshotId), activeKey: releasedKeyFor(job.id), finishedAt: this.now() } : {}),
        });
        await check();
        await confirmedWrite(() => this.data.SyncCommand.update({ id: command.id }, {
          state: 'completed', completedAt: this.now(), outcomeCode: 'SLICE_COMMITTED',
        }), () => this.data.SyncCommand.findById(command.id), { state: 'completed', outcomeCode: 'SLICE_COMMITTED' });
        await this.finishRoot(root, guard);
        return this.project(await this.requireRoot(root.id));
      });
    });
  }

  cancel(value: unknown): Promise<GraphResponse> {
    return safeGraphCall(async () => {
      const input = parseCommand(value, 'cancel');
      return this.exclusive(async (guard) => {
        let root = await this.requireRoot(input.rootRunId);
        if (root.state === 'completed') return this.project(root);
        // Root cancellation is the durable barrier; child cleanup may be interrupted.
        if (root.state !== 'cancelled') {
          await guard.assertHeld();
          root = await this.updateRoot(root, rootTransition(root, 'cancelled', this.now()));
        }
        for (const job of await this.jobs(root)) {
          if (job.state === 'completed' || job.state === 'cancelled') continue;
          await guard.assertHeld();
          const publisher = new SnapshotPublisher(this.data, () => guard.assertHeld(), this.sleep);
          // An already committed manifest is not retracted by cancellation after a lost response.
          const published = await publisher.hasManifest(job);
          if (!published) {
            await publisher.cancelAudit(job);
            for (const stage of STAGES) {
              const task = await this.data.SyncTask.findById(taskIdFor(job.id, stage));
              if (!task || task.state === 'completed' || task.state === 'cancelled') continue;
              if (task.rootRunId !== root.id || task.jobId !== job.id || task.workspace_id !== job.workspace_id) throw new GraphError('CHECKPOINT_INVALID');
              await guard.assertHeld();
              await this.updateTask(task, { state: 'cancelled', updatedAt: this.now(), finishedAt: this.now() });
            }
          }
          await guard.assertHeld();
          await this.updateJob(job, {
            state: published ? 'completed' : 'cancelled', publicationState: published ? 'published' : job.publicationState,
            ...(published ? { manifestId: identity('manifest', job.snapshotId), completedTasks: STAGES.length, phase: 'publish' } : {}),
            activeKey: releasedKeyFor(job.id), finishedAt: this.now(),
          });
        }
        return this.project(root);
      });
    });
  }

  status(value: unknown): Promise<GraphResponse> {
    return safeGraphCall(async () => {
      const input = parseCommand(value, 'status');
      return this.project(await this.requireRoot(input.rootRunId));
    });
  }

  private exclusive<T>(work: (guard: SerializationGuard) => Promise<T>): Promise<T> {
    if (!this.runtime?.serializer) throw new GraphError('SERIALIZATION_REQUIRED');
    return this.runtime.serializer.run(SERIALIZATION_SCOPE, async (guard) => { await guard.assertHeld(); return work(guard); });
  }
  private requireAdapters(): void {
    const adapters = this.runtime?.adapters;
    if (!adapters || STAGES.slice(0, 6).some((stage) =>
      typeof adapters.collectors[stage as CollectorStage] !== 'function') ||
      typeof adapters.assemble !== 'function' ||
      !/^[^@\s]+@[^@\s]+$/.test(adapters.writerEmail) ||
      adapters.writerEmail.length > 160) throw new GraphError('ADAPTER_REQUIRED');
  }
  private assertRoot(root: SyncRootRun): void {
    if (root.protocolVersion !== 2 || root.executionMode !== 'external-serialized' ||
        root.id !== identity('root', uuid(root.requestId)) || !/^[a-f0-9]{64}$/.test(root.planHash) ||
        !Number.isInteger(root.workspaceCount) || root.workspaceCount < 1 || root.workspaceCount > MAX_WORKSPACES ||
        !['planning', 'ready', 'running', 'completed', 'cancelled'].includes(root.state) ||
        !Number.isFinite(new Date(root.createdAt).getTime()) || !Number.isFinite(new Date(root.updatedAt).getTime()) ||
        ((root.state === 'completed' || root.state === 'cancelled') && !root.finishedAt) ||
        (root.state === 'cancelled' && !root.cancelRequestedAt) ||
        (root.cancelRequestedAt && root.state !== 'cancelled')) throw new GraphError('CHECKPOINT_INVALID');
  }
  private assertJob(job: SyncJob, root: SyncRootRun): void {
    if (job.protocolVersion !== 2 || job.rootRunId !== root.id || job.id !== jobIdFor(root.id, job.workspace_id) ||
        job.snapshotId !== identity('snapshot', job.id) || job.totalTasks !== STAGES.length ||
        !Number.isInteger(job.completedTasks) || job.completedTasks < 0 || job.completedTasks > STAGES.length ||
        !['queued', 'running', 'waiting', 'completed', 'cancelled'].includes(job.state) ||
        !['collect', 'persist', 'publish'].includes(job.phase) ||
        !['unpublished', 'staged', 'published'].includes(job.publicationState ?? '') ||
        !Number.isInteger(job.revision) || job.revision < 0 || job.revision >= 2_147_483_647 ||
        !Number.isFinite(new Date(job.createdAt).getTime()) ||
        (job.snapshotHash != null && !/^[a-f0-9]{64}$/.test(job.snapshotHash)) ||
        (job.publicationState === 'published' && (job.state !== 'completed' ||
          job.completedTasks !== STAGES.length || job.manifestId !== identity('manifest', job.snapshotId))) ||
        (job.state === 'completed' && (job.publicationState !== 'published' || !job.finishedAt)) ||
        job.activeKey !== (['completed', 'cancelled'].includes(job.state) ? releasedKeyFor(job.id) : activeKeyFor(job.workspace_id))) {
      throw new GraphError('CHECKPOINT_INVALID');
    }
  }
  private async requireRoot(id: string): Promise<SyncRootRun> {
    const root = await this.data.SyncRootRun.findById(id);
    if (!root) throw new GraphError('NOT_FOUND');
    this.assertRoot(root);
    return root;
  }
  private async jobs(root: SyncRootRun): Promise<SyncJob[]> {
    const jobs = await this.data.SyncJob.select(JOB_FIELDS).where({ rootRunId: { eq: root.id } })
      .first(MAX_WORKSPACES + 1).execute();
    if (jobs.length > root.workspaceCount ||
        (!['planning', 'cancelled'].includes(root.state) && jobs.length !== root.workspaceCount)) throw new GraphError('CHECKPOINT_INVALID');
    for (const job of jobs) this.assertJob(job, root);
    return jobs.sort((a, b) => a.workspace_id.localeCompare(b.workspace_id));
  }
  private async tasks(job: SyncJob): Promise<SyncTask[]> {
    const tasks: SyncTask[] = [];
    let unfinished = false;
    for (let i = 0; i < STAGES.length; i++) {
      const task = await this.data.SyncTask.findById(taskIdFor(job.id, STAGES[i]));
      if (!task) throw new GraphError('CHECKPOINT_INVALID');
      assertTask(task, job, i);
      if (task.state === 'completed' && i < 6 && !task.payloadRef) throw new GraphError('CHECKPOINT_INVALID');
      if (unfinished && (task.state !== 'pending' || task.attemptCount > 0)) throw new GraphError('CHECKPOINT_INVALID');
      if (task.state !== 'completed') unfinished = true;
      tasks.push(task);
    }
    return tasks;
  }
  private async check(rootId: string, guard: SerializationGuard): Promise<void> {
    await guard.assertHeld();
    const root = await this.requireRoot(rootId);
    if (root.state === 'cancelled' || root.cancelRequestedAt) throw new GraphError('CANCELLED');
  }
  private updateRoot(root: SyncRootRun, patch: Partial<SyncRootRun>) {
    return confirmedWrite(() => this.data.SyncRootRun.update({ id: root.id }, patch),
      () => this.data.SyncRootRun.findById(root.id), patch);
  }
  private updateJob(job: SyncJob, patch: Partial<SyncJob>) {
    if (!Number.isInteger(job.revision) || job.revision < 0 || job.revision >= 2_147_483_647) throw new GraphError('CHECKPOINT_INVALID');
    const values = { ...patch, revision: job.revision + 1, updatedAt: this.now() };
    return confirmedWrite(() => this.data.SyncJob.update({ id: job.id }, values),
      () => this.data.SyncJob.findById(job.id), values);
  }
  private updateTask(task: SyncTask, patch: Partial<SyncTask>) {
    return confirmedWrite(() => this.data.SyncTask.update({ id: task.id }, patch),
      () => this.data.SyncTask.findById(task.id), patch);
  }
  private async acceptCommand(input: GraphContinueInput, job: SyncJob, tasks: SyncTask[], guard: SerializationGuard): Promise<SyncCommand> {
    const id = identity('command', input.requestId);
    const inputHash = hash(input);
    let command = await this.data.SyncCommand.findById(id);
    if (!command) {
      const task = tasks.find((task) => task.state !== 'completed') ?? tasks[tasks.length - 1];
      if (task.state === 'running' && task.claimRequestId !== input.requestId) throw new GraphError('TASK_CLAIMED');
      const candidate: SyncCommand = {
        id, workspace_id: job.workspace_id, jobId: job.id, rootRunId: job.rootRunId, protocolVersion: 2,
        taskId: task.id, taskAttempt: task.state === 'pending' ? task.attemptCount + 1 : task.attemptCount,
        recordKey: `v2:command:${id}`, requestId: input.requestId, inputHash,
        command: 'continue', state: 'accepted', createdAt: this.now(),
      };
      await this.check(input.rootRunId, guard);
      command = await confirmedWrite(() => this.data.SyncCommand.create(candidate),
        () => this.data.SyncCommand.findById(id), candidate);
    }
    if (command.inputHash !== inputHash || command.rootRunId !== input.rootRunId ||
        command.workspace_id !== input.workspaceId || command.jobId !== job.id ||
        command.requestId !== input.requestId || command.command !== 'continue' ||
        command.protocolVersion !== 2) throw new GraphError('REQUEST_CONFLICT');
    if (!['accepted', 'completed'].includes(command.state) || command.recordKey !== `v2:command:${id}` ||
        !Number.isInteger(command.taskAttempt) || command.taskAttempt! < 1 ||
        command.taskAttempt! >= 2_147_483_647) throw new GraphError('CHECKPOINT_INVALID');
    return command;
  }
  private async execute(task: SyncTask, job: SyncJob, tasks: SyncTask[], publisher: SnapshotPublisher, check: () => Promise<void>) {
    const inputs: Partial<Record<CollectorStage, PayloadReference>> = {};
    for (const dependency of tasks.slice(0, task.ordinal)) {
      if (dependency.ordinal! < 6) inputs[dependency.kind as CollectorStage] = reference({
        id: dependency.payloadRef, hash: dependency.payloadHash,
      });
    }
    await check();
    let patch: Partial<SyncTask>;
    if (task.kind !== 'persist' && task.kind !== 'publish') {
      const result = await this.runtime!.adapters.collectors[task.kind as CollectorStage]({
        rootRunId: job.rootRunId!, workspaceId: job.workspace_id, taskId: task.id, dependencies: inputs, check,
        ...(task.checkpointRef ? { checkpoint: reference({ id: task.checkpointRef, hash: task.checkpointHash }) } : {}),
      });
      objectInput(result, result.done ? ['done', 'payload'] : ['done', 'checkpoint']);
      if (result.done === true) {
        const payload = reference(result.payload);
        patch = { state: 'completed', payloadRef: payload.id, payloadHash: payload.hash, finishedAt: this.now() };
      } else if (result.done === false) {
        const checkpoint = reference(result.checkpoint);
        patch = { state: 'pending', checkpointRef: checkpoint.id, checkpointHash: checkpoint.hash };
      } else throw new GraphError('PAYLOAD_INVALID');
    } else {
      const draft = await this.runtime!.adapters.assemble(job.workspace_id, inputs as Record<CollectorStage, PayloadReference>);
      await check();
      const snapshot = prepareSnapshot(draft, job, this.runtime!.adapters.writerEmail);
      if (job.snapshotHash && job.snapshotHash !== snapshot.hash) throw new GraphError('PAYLOAD_INVALID');
      if (!job.snapshotHash) {
        if (task.kind === 'publish') throw new GraphError('CHECKPOINT_INVALID');
        await this.updateJob(job, { snapshotHash: snapshot.hash });
      }
      if (task.kind === 'persist') {
        const end = await publisher.persistSlice(snapshot, task.checkpointOffset ?? 0);
        patch = { state: end === snapshot.rows.length ? 'completed' : 'pending', checkpointOffset: end,
          ...(end === snapshot.rows.length ? { finishedAt: this.now() } : {}) };
      } else {
        await publisher.publish(snapshot, job);
        patch = { state: 'completed', finishedAt: this.now() };
      }
    }
    await check();
    await this.updateTask(task, { ...patch, updatedAt: this.now() });
  }
  private async finishRoot(root: SyncRootRun, guard: SerializationGuard): Promise<void> {
    const jobs = await this.jobs(root);
    if (root.state === 'running' && jobs.every((job) => job.state === 'completed')) {
      await this.check(root.id, guard);
      await this.updateRoot(root, rootTransition(root, 'completed', this.now()));
    }
  }
  private async project(root: SyncRootRun): Promise<GraphResponse> {
    const workspaces: GraphProjection['workspaces'] = [];
    for (const job of await this.jobs(root)) {
      const publisher = new SnapshotPublisher(this.data, async () => {});
      workspaces.push({
        workspaceId: job.workspace_id, jobId: job.id,
        state: root.state === 'cancelled' && job.state !== 'completed' ? 'cancelled' : job.state as Exclude<SyncJob['state'], 'failed'>,
        phase: job.phase as Exclude<SyncJob['phase'], 'probe'>, completedTasks: job.completedTasks, totalTasks: job.totalTasks,
        snapshotPublished: await publisher.hasManifest(job),
      });
    }
    return {
      ok: true, protocolVersion: 2, run: {
        rootRunId: root.id, state: root.state, workspaces, backgroundExecution: false,
        distributedClaims: false, continuation: 'externally-serialized-invocation',
      },
    };
  }
}
