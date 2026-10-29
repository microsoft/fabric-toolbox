import { authenticated, date, entity, text, uuid } from '@microsoft/rayfin-core';

/**
 * A dataset named in an imported OpenLineage file, keyed by its normalised
 * namespace and name so every import shares one row. It is either linked to a
 * Fabric item (same dataset → one node on the map), waiting to be linked, or
 * kept external on purpose.
 */
@entity()
@authenticated('read')
@authenticated('create', {
  policy: (claims, item) =>
    claims.email.eq(item.createdByEmail).and(claims.sub.eq(item.createdById)),
})
@authenticated('update', {
  include: [
    'fabricItemId',
    'fabricObjectName',
    'state',
    'linkedBy',
    'linkedAt',
    'lastSeenAt',
  ],
})
@authenticated('delete')
export class ExternalDataset {
  @uuid() id!: string;
  @uuid() workspace_id!: string;
  @text({ max: 400 }) namespace!: string;
  @text({ max: 400 }) name!: string;
  @text({ max: 40 }) platform!: string;
  @text({ max: 100, optional: true }) fabricItemId?: string;
  @text({ max: 260, optional: true }) fabricObjectName?: string;
  @text({ max: 20 }) state!: string;
  @text({ max: 160, optional: true }) linkedBy?: string;
  @date({ optional: true }) linkedAt?: Date;
  @text({ max: 160 }) createdById!: string;
  @text({ max: 160 }) createdByEmail!: string;
  @date() lastSeenAt!: Date;
}