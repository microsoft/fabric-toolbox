import { authenticated, date, entity, text, uuid } from '@microsoft/rayfin-core';

/**
 * A named, user-scoped view over Fabric Atlas filters and navigation state.
 */
@entity()
@authenticated(['create', 'read', 'update', 'delete'], {
  policy: (claims, item) => claims.sub.eq(item.user_id),
})
export class SavedView {
  @uuid() id!: string;
  @uuid() workspace_id!: string;
  @text({ max: 160 }) user_id!: string;
  @text({ max: 100 }) name!: string;
  @text({ max: 60 }) section!: string;
  @text({ max: 3500 }) filtersJson!: string;
  @date() createdAt!: Date;
  @date() updatedAt!: Date;
}
