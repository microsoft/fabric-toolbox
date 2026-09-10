import { boolean, entity, authenticated, uuid, text, set, date } from '@microsoft/rayfin-core';
import { SYNC_WRITER_SUBJECT } from './sync-policy.js';

export type ItemHealth = 'healthy' | 'stale' | 'failing' | 'unknown';
export type Endorsement = 'none' | 'promoted' | 'certified';

/**
 * A single Fabric item (Lakehouse, Notebook, Pipeline, Semantic model,
 * Report, Warehouse, Eventhouse, Dataflow, ...). Populated by Sync from the
 * Fabric REST APIs; the catalog, map and health views all read from here.
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
export class FabricItem {
  @uuid() id!: string;
  @uuid() workspace_id!: string;
  @uuid({ optional: true }) snapshotId?: string;
  @text({ max: 160, optional: true }) writerEmail?: string;
  @text({ max: 100 }) fabricId!: string;
  @text({ max: 200 }) displayName!: string;
  @text({ max: 60 }) itemType!: string;
  @text({ max: 200, optional: true }) size?: string;
  @text({ max: 600, optional: true }) description?: string;
  @text({ max: 120, optional: true }) ownerName?: string;
  @text({ max: 150, optional: true }) ownerEmail?: string;
  @text({ max: 160, optional: true }) configuredBy?: string;
  @text({ max: 160, optional: true }) modifiedBy?: string;
  @set('healthy', 'stale', 'failing', 'unknown') health!: ItemHealth;
  @set('none', 'promoted', 'certified') endorsement!: Endorsement;
  @text({ max: 60, optional: true }) endorsementRaw?: string;
  @text({ max: 160, optional: true }) endorsementBy?: string;
  @text({ max: 60, optional: true }) sensitivity?: string;
  @text({ max: 100, optional: true }) sensitivityLabelId?: string;
  @text({ max: 300, optional: true }) tags?: string;
  @text({ max: 2000, optional: true }) tagIds?: string;
  @boolean({ optional: true }) ownerMetadataAvailable?: boolean;
  @boolean({ optional: true }) sensitivityMetadataAvailable?: boolean;
  @boolean({ optional: true }) endorsementMetadataAvailable?: boolean;
  @boolean({ optional: true }) tagMetadataAvailable?: boolean;
  @date({ optional: true }) lastRefresh?: Date;
  @date({ optional: true }) itemCreatedAt?: Date;
  @date({ optional: true }) itemUpdatedAt?: Date;
}
