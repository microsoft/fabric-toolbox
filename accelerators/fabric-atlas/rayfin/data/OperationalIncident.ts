import {
  authenticated,
  date,
  entity,
  int,
  set,
  text,
  uuid,
} from '@microsoft/rayfin-core';
import { SYNC_WRITER_SUBJECT } from './sync-policy.js';

export type OperationalIncidentSource = 'fabric-job-history';

/**
 * An observed operational incident: the latest captured run of one item and
 * job type failed. Rows are derived from sanitized Fabric job history during
 * the browser synchronization and written after the snapshot marker. Only an
 * allowlist of identity and timing fields is stored; failure reasons, logs,
 * query text and business rows are never persisted. Downstream impact is not
 * stored; it is joined at read time from the same snapshot's lineage.
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
export class OperationalIncident {
  @uuid() id!: string;
  @uuid() workspace_id!: string;
  /** Atlas snapshot published by the same synchronization. */
  @uuid() snapshotId!: string;
  @text({ max: 160 }) writerEmail!: string;
  /** `incident:v1:<workspace>:<item>:<job type>`, stable while it keeps failing. */
  @text({ max: 240 }) incidentKey!: string;
  @text({ max: 100 }) itemFabricId!: string;
  @text({ max: 200 }) itemName!: string;
  @text({ max: 60, optional: true }) itemType?: string;
  @text({ max: 60 }) jobType!: string;
  /** Fabric job instance ID, when the collector returned one. */
  @uuid({ optional: true }) runId?: string;
  /** Start of the failed run, as reported by Fabric. */
  @date() occurredAt!: Date;
  @int({ optional: true }) durationSec?: number;
  /** Synchronization time of the snapshot that captured the failure. */
  @date() observedAt!: Date;
  /** First consecutive synchronization that captured this failing state. */
  @date() firstObservedAt!: Date;
  @uuid({ optional: true }) firstObservedSnapshotId?: string;
  @set('fabric-job-history') source!: OperationalIncidentSource;
  @int() contractVersion!: number;
}
