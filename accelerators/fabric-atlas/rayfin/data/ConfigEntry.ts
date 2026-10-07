import { entity, authenticated, uuid, text } from '@microsoft/rayfin-core';
import { SYNC_WRITER_SUBJECT } from './sync-policy.js';

/**
 * One key/value configuration fact about an item (definition parts, settings,
 * schedules, connection info, parameters, ...). Stored flat so the Config view
 * can render an exhaustive, groupable, expand/collapse tree per item.
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
export class ConfigEntry {
  @uuid() id!: string;
  @uuid() workspace_id!: string;
  @uuid({ optional: true }) snapshotId?: string;
  @text({ max: 160, optional: true }) writerEmail?: string;
  @text({ max: 100 }) itemFabricId!: string;
  @text({ max: 80 }) section!: string;
  @text({ max: 160 }) label!: string;
  @text({ max: 2000, optional: true }) value?: string;
}
