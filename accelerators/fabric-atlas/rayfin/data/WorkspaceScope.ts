import { authenticated, date, entity, text, uuid } from '@microsoft/rayfin-core';
import { SYNC_WRITER_SUBJECT } from './sync-policy.js';

/**
 * One administrator-selected Fabric workspace exposed to the authenticated
 * Atlas audience. The row ID is the Fabric workspace ID.
 */
@entity()
@authenticated('read')
@authenticated(['update', 'delete'], {
  policy: (claims) => claims.sub.eq(SYNC_WRITER_SUBJECT),
})
@authenticated('create', {
  policy: (claims, item) =>
    claims.email
      .eq(item.writerEmail)
      .and(claims.sub.eq(SYNC_WRITER_SUBJECT)),
})
export class WorkspaceScope {
  @uuid() id!: string;
  @text({ max: 200 }) displayName!: string;
  @text({ max: 80, optional: true }) workspaceType?: string;
  @uuid({ optional: true }) capacityId?: string;
  @text({ max: 160, optional: true }) writerEmail?: string;
  @date() selectedAt!: Date;
}
