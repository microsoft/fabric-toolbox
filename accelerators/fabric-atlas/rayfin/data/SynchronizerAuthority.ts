import { authenticated, date, entity, uuid } from '@microsoft/rayfin-core';
import { SYNC_WRITER_SUBJECT } from './sync-policy.js';

/**
 * One global sentinel used by Functions to prove the caller satisfies the
 * configured synchronizer policy before using application-identity tokens.
 */
@entity()
@authenticated(['create', 'read', 'update', 'delete'], {
  policy: (claims) => claims.sub.eq(SYNC_WRITER_SUBJECT),
})
export class SynchronizerAuthority {
  @uuid() id!: string;
  @date() createdAt!: Date;
}
