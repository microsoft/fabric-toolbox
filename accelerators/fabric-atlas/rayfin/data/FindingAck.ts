import {
  authenticated,
  date,
  entity,
  set,
  text,
  uuid,
} from '@microsoft/rayfin-core';

export type FindingAckStatus = 'acked' | 'muted';

@entity()
@authenticated(['create', 'read', 'update', 'delete'], {
  policy: (claims, item) => claims.sub.eq(item.user_id),
})
export class FindingAck {
  @uuid() id!: string;
  @uuid() workspace_id!: string;
  @text({ max: 160 }) user_id!: string;
  @text({ max: 80, unique: true }) recordKey!: string;
  @text({ max: 700 }) findingId!: string;
  @set('acked', 'muted') status!: FindingAckStatus;
  @uuid({ optional: true }) occurrenceSnapshotId?: string;
  @text({ max: 1000, optional: true }) note?: string;
  @date() updatedAt!: Date;
}
