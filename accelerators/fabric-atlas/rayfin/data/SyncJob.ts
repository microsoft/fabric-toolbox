import { authenticated, date, entity, int, set, text, uuid } from '@microsoft/rayfin-core';
import { SYNC_WRITER_SUBJECT } from './sync-policy.js';

export type SyncJobState =
  | 'queued'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'cancelled';

@entity()
@authenticated('read')
@authenticated(['create', 'update', 'delete'], {
  policy: (claims) => claims.sub.eq(SYNC_WRITER_SUBJECT),
})
export class SyncJob {
  @uuid() id!: string;
  @uuid() workspace_id!: string;
  @uuid() snapshotId!: string;
  @int() protocolVersion!: number;
  @set('queued', 'running', 'waiting', 'completed', 'failed', 'cancelled')
  state!: SyncJobState;
  @set('probe', 'collect', 'persist', 'publish') phase!: 'probe' | 'collect' | 'persist' | 'publish';
  @uuid({ optional: true }) rootRunId?: string;
  @set({ optional: true }, 'unpublished', 'staged', 'published')
  publicationState?: 'unpublished' | 'staged' | 'published';
  @uuid({ optional: true }) manifestId?: string;
  @text({ max: 64, optional: true }) snapshotHash?: string;
  @int() revision!: number;
  @int() totalTasks!: number;
  @int() completedTasks!: number;
  @date() createdAt!: Date;
  @date() updatedAt!: Date;
  @date({ optional: true }) finishedAt?: Date;
  @text({ max: 64, optional: true }) failureCode?: string;
  @text({ max: 240, optional: true }) failureMessage?: string;
  // Terminal jobs use a unique released key, not NULL (MSSQL unique constraints).
  @text({ max: 80, unique: true, optional: true }) activeKey?: string;
  @text({ max: 160, optional: true }) initiatedBySubject?: string;
  @text({ max: 160, optional: true }) initiatedByEmail?: string;
}
