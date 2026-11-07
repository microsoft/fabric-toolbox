import { authenticated, date, entity, uuid } from '@microsoft/rayfin-core';
import { syncWriterPolicy } from './sync-policy.js';

/**
 * One global sentinel used by Functions to prove the caller satisfies the
 * configured synchronizer policy before using application-identity tokens.
 */
@entity()
@authenticated(['create', 'read', 'update', 'delete'], {
  policy: (claims) => syncWriterPolicy(claims),
})
export class SynchronizerAuthority {
  @uuid() id!: string;
  @date() createdAt!: Date;
}
