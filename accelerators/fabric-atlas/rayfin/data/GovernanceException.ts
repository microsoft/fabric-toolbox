import { authenticated, date, entity, text, uuid } from '@microsoft/rayfin-core';
import { SYNC_WRITER_SUBJECT } from './sync-policy.js';

@entity()
@authenticated('read')
@authenticated('create', {
  policy: (claims, item) =>
    claims.email
      .eq(item.authorEmail)
      .and(claims.sub.eq(item.authorId))
      .and(claims.sub.eq(SYNC_WRITER_SUBJECT)),
})
@authenticated('update', {
  policy: (claims, item) =>
    claims.email
      .eq(item.authorEmail)
      .and(claims.sub.eq(item.authorId))
      .and(claims.sub.eq(SYNC_WRITER_SUBJECT)),
  include: [
    'reason',
    'expiresAt',
    'authorId',
    'authorName',
    'authorEmail',
    'updatedAt',
  ],
})
@authenticated('delete', {
  policy: (claims) => claims.sub.eq(SYNC_WRITER_SUBJECT),
})
export class GovernanceException {
  @uuid() id!: string;
  @uuid() workspace_id!: string;
  @text({ max: 80, unique: true }) recordKey!: string;
  @text({ max: 160 }) writerEmail!: string;
  @text({ max: 700 }) findingId!: string;
  @text({ max: 2000 }) reason!: string;
  @date() expiresAt!: Date;
  @text({ max: 160 }) authorId!: string;
  @text({ max: 160 }) authorName!: string;
  @text({ max: 160 }) authorEmail!: string;
  @date() createdAt!: Date;
  @date() updatedAt!: Date;
}
