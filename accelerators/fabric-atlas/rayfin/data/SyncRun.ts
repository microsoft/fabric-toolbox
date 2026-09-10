import { entity, authenticated, uuid, text, set, int, date } from '@microsoft/rayfin-core';
import { SYNC_WRITER_SUBJECT } from './sync-policy.js';

export type SyncStatus = 'running' | 'completed' | 'failed';

/**
 * An audit record of a Sync run: when the workspace was last read from the
 * Fabric APIs, by whom, and how much was ingested.
 */
@entity()
@authenticated('read')
@authenticated('delete', {
  policy: (claims) => claims.sub.eq(SYNC_WRITER_SUBJECT),
})
@authenticated('update', {
  policy: (claims) => claims.sub.eq(SYNC_WRITER_SUBJECT),
  include: [
    'finishedAt',
    'status',
    'itemsSynced',
    'durationMs',
    'failureCode',
    'failureMessage',
    'summary',
  ],
})
@authenticated('create', {
  policy: (claims, item) =>
    claims.email
      .eq(item.writerEmail)
      .and(claims.sub.eq(SYNC_WRITER_SUBJECT)),
})
export class SyncRun {
  @uuid() id!: string;
  @uuid() workspace_id!: string;
  @uuid({ optional: true }) snapshotId?: string;
  @uuid({ optional: true }) correlationId?: string;
  @text({ max: 160, optional: true }) writerEmail?: string;
  @date() startedAt!: Date;
  @date({ optional: true }) finishedAt?: Date;
  @set('running', 'completed', 'failed') status!: SyncStatus;
  @int({ optional: true }) itemsSynced?: number;
  @int({ optional: true }) durationMs?: number;
  @text({ max: 80, optional: true }) failureCode?: string;
  @text({ max: 500, optional: true }) failureMessage?: string;
  @text({ max: 160, optional: true }) triggeredBy?: string;
  @text({ max: 500, optional: true }) summary?: string;
}
