import { entity, authenticated, uuid, text, int, date } from '@microsoft/rayfin-core';
import { SYNC_WRITER_SUBJECT } from './sync-policy.js';

/**
 * A Fabric workspace that Fabric Atlas has indexed. One row is written per
 * synced workspace; everything else in the catalog hangs off `fabricId`.
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
export class Workspace {
  @uuid() id!: string;
  @uuid({ optional: true }) snapshotId?: string;
  @text({ max: 160, optional: true }) writerEmail?: string;
  @text({ max: 200, optional: true }) deploymentId?: string;
  @text({ max: 4000, optional: true }) syncSectionsJson?: string;
  @text({ max: 100 }) fabricId!: string;
  @text({ max: 200 }) displayName!: string;
  @text({ max: 120, optional: true }) capacity?: string;
  @text({ max: 120, optional: true }) region?: string;
  @int({ optional: true }) itemCount?: number;
  @int({ optional: true }) edgeCount?: number;
  @int({ optional: true }) principalCount?: number;
  @int({ optional: true }) grantCount?: number;
  @int({ optional: true }) jobCount?: number;
  @int({ optional: true }) configCount?: number;
  @int({ optional: true }) schemaEntryCount?: number;
  @int({ optional: true }) summaryVersion?: number;
  @int({ optional: true }) healthyCount?: number;
  @int({ optional: true }) staleCount?: number;
  @int({ optional: true }) failingCount?: number;
  @int({ optional: true }) labelCount?: number;
  @int({ optional: true }) externalPrincipalCount?: number;
  @int({ optional: true }) failedJobCount?: number;
  @int({ optional: true }) brokenEdgeCount?: number;
  @int({ optional: true }) tableCount?: number;
  @int({ optional: true }) columnCount?: number;
  @int({ optional: true }) measureCount?: number;
  @date({ optional: true }) syncedAt?: Date;
}
