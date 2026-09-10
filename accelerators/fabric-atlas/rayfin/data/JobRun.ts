import { entity, authenticated, uuid, text, set, int, date } from '@microsoft/rayfin-core';
import { SYNC_WRITER_SUBJECT } from './sync-policy.js';

export type JobStatus = 'completed' | 'failed' | 'running' | 'cancelled';

/**
 * A run of a refresh / pipeline / notebook job, from the Fabric job history
 * APIs. Drives the Jobs / Health view.
 */
@entity()
@authenticated('read')
@authenticated('delete', {
  policy: (claims) => claims.sub.eq(SYNC_WRITER_SUBJECT),
})
@authenticated('create', {
  policy: (claims, item) =>
    claims.email
      .eq(item.writerEmail)
      .and(claims.sub.eq(SYNC_WRITER_SUBJECT)),
})
export class JobRun {
  @uuid() id!: string;
  @uuid() workspace_id!: string;
  @uuid({ optional: true }) snapshotId?: string;
  @text({ max: 160, optional: true }) writerEmail?: string;
  @text({ max: 100 }) itemFabricId!: string;
  @text({ max: 200 }) itemName!: string;
  @text({ max: 60 }) jobType!: string;
  @set('completed', 'failed', 'running', 'cancelled') status!: JobStatus;
  @date({ optional: true }) startedAt?: Date;
  @int({ optional: true }) durationSec?: number;
  @text({ max: 400, optional: true }) message?: string;
}
