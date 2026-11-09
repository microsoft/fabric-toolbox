import { authenticated, boolean, date, entity, int, set, text, uuid } from '@microsoft/rayfin-core';
import { syncWriterEmailPolicy, syncWriterPolicy } from './sync-policy.js';

export type ConnectionInventoryStatus = 'complete' | 'unsupported' | 'failed';

/**
 * One tenant connection inventory collected by a synchronization batch from
 * the Fabric admin connections API (Preview). Tenant-wide, so it is stored
 * once per collection instead of in every workspace snapshot. Rows are
 * immutable; the newest `snapshotRetentionCount` inventories are kept.
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
export class ConnectionInventory {
  @uuid() id!: string;
  @text({ max: 160 }) writerEmail!: string;
  @date() collectedAt!: Date;
  @set('complete', 'unsupported', 'failed') status!: ConnectionInventoryStatus;
  @text({ max: 80, optional: true }) code?: string;
  @int() connectionCount!: number;
  @int() roleLookupCount!: number;
  @int() roleLookupSkippedCount!: number;
  @int() roleLookupFailedCount!: number;
  @boolean() truncated!: boolean;
  @int() contractVersion!: number;
}
