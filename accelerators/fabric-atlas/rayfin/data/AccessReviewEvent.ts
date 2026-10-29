import {
  authenticated,
  date,
  entity,
  set,
  text,
  uuid,
} from '@microsoft/rayfin-core';

export type AccessReviewEventStatus =
  | 'reviewed'
  | 'accepted'
  | 'needsAction'
  | 'cleared';

/**
 * An immutable, user-scoped access review decision or clear event.
 */
@entity()
@authenticated(['create', 'read'], {
  policy: (claims, item) => claims.sub.eq(item.user_id),
})
export class AccessReviewEvent {
  @uuid() id!: string;
  @uuid() workspace_id!: string;
  @text({ max: 160 }) user_id!: string;
  @text({ max: 700 }) rowKey!: string;
  @uuid() itemFabricId!: string;
  @text({ max: 200 }) principalRef!: string;
  @set('reviewed', 'accepted', 'needsAction', 'cleared')
  status!: AccessReviewEventStatus;
  @text({ max: 80 }) evidenceKey!: string;
  @text({ max: 80 }) eventOrder!: string;
  @text({ max: 1000, optional: true }) note?: string;
  @date() occurredAt!: Date;
}
