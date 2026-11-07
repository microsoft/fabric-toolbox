import {
  authenticated,
  date,
  entity,
  set,
  text,
  uuid,
} from '@microsoft/rayfin-core';

export type AccessReviewStatus = 'reviewed' | 'accepted' | 'needsAction';

/**
 * A user-scoped review decision for one effective principal and item pair.
 */
@entity()
@authenticated(['create', 'read', 'update', 'delete'], {
  policy: (claims, item) => claims.sub.eq(item.user_id),
})
export class AccessReview {
  @uuid() id!: string;
  @uuid() workspace_id!: string;
  @text({ max: 160 }) user_id!: string;
  @text({ max: 450, unique: true }) recordKey!: string;
  @text({ max: 700 }) rowKey!: string;
  @text({ max: 100 }) itemFabricId!: string;
  @text({ max: 200 }) principalRef!: string;
  @set('reviewed', 'accepted', 'needsAction') status!: AccessReviewStatus;
  @text({ max: 1000, optional: true }) note?: string;
  @date() reviewedAt!: Date;
  @date() updatedAt!: Date;
}
