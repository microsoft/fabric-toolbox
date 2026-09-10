import { authenticated, date, entity, int, text, uuid } from '@microsoft/rayfin-core';
import { SYNC_WRITER_SUBJECT } from './sync-policy.js';

@entity()
@authenticated('read')
@authenticated('create', {
  policy: (claims, item) =>
    claims.email
      .eq(item.writerEmail)
      .and(claims.sub.eq(SYNC_WRITER_SUBJECT)),
})
@authenticated('update', {
  policy: (claims) => claims.sub.eq(SYNC_WRITER_SUBJECT),
  include: [
    'documentationTarget',
    'ownershipTarget',
    'sensitivityTarget',
    'accessTarget',
    'lineageTarget',
    'operationsTarget',
    'updatedById',
    'updatedByName',
    'updatedByEmail',
    'updatedAt',
  ],
})
@authenticated('delete', {
  policy: (claims) => claims.sub.eq(SYNC_WRITER_SUBJECT),
})
export class GovernancePolicy {
  @uuid() id!: string;
  @uuid() workspace_id!: string;
  @text({ max: 100, unique: true }) recordKey!: string;
  @text({ max: 160 }) writerEmail!: string;
  @int() documentationTarget!: number;
  @int() ownershipTarget!: number;
  @int() sensitivityTarget!: number;
  @int() accessTarget!: number;
  @int() lineageTarget!: number;
  @int() operationsTarget!: number;
  @text({ max: 160 }) updatedById!: string;
  @text({ max: 160 }) updatedByName!: string;
  @text({ max: 160 }) updatedByEmail!: string;
  @date() updatedAt!: Date;
}
