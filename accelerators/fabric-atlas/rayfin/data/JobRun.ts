import { entity, authenticated, uuid, text, set, int, date } from '@microsoft/rayfin-core';
import { syncWriterEmailPolicy, syncWriterPolicy } from './sync-policy.js';

export type JobStatus = 'completed' | 'failed' | 'running' | 'cancelled';

/**
 * A run of a refresh / pipeline / notebook job, from the Fabric job history
 * APIs. Drives the Jobs / Health view.
 */
@entity()
@authenticated('read')
@authenticated('delete', {
  policy: (claims) => syncWriterPolicy(claims),
})
@authenticated('create', {
  policy: (claims, item) =>
    syncWriterEmailPolicy(claims, item.writerEmail),
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
