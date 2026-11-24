import { authenticated, boolean, date, entity, int, set, text, uuid } from '@microsoft/rayfin-core';
import { syncWriterEmailPolicy, syncWriterPolicy } from './sync-policy.js';

export type ConnectionRolesStatus = 'complete' | 'skipped' | 'failed' | 'personal';

/**
 * One Fabric connection of a `ConnectionInventory`. Only documented,
 * credential-free metadata is stored: Fabric never returns secrets, and the
 * endpoint path is kept without user info, query string or fragment.
 *
 * The name must not end with `Connection`: Data API Builder treats such a
 * GraphQL type as a pagination type, so every create and read fails.
 */
@entity()
@authenticated('read')
@authenticated('delete', {
  policy: (claims) => syncWriterPolicy(claims),
})
@authenticated('create', {
  policy: (claims, item) =>
    syncWriterEmailPolicy(claims, item.writerEmail),
})
export class ConnectionEntry {
  @uuid() id!: string;
  @uuid() inventoryId!: string;
  @text({ max: 160 }) writerEmail!: string;
  @uuid() connectionId!: string;
  @text({ max: 200 }) displayName!: string;
  @text({ max: 40 }) connectivityType!: string;
  @text({ max: 120, optional: true }) connectorType?: string;
  @text({ max: 1000, optional: true }) path?: string;
  @uuid({ optional: true }) gatewayId?: string;
  @text({ max: 40, optional: true }) privacyLevel?: string;
  @text({ max: 40, optional: true }) credentialType?: string;
  @text({ max: 40, optional: true }) singleSignOnType?: string;
  @text({ max: 40, optional: true }) connectionEncryption?: string;
  @boolean({ optional: true }) skipTestConnection?: boolean;
  @date({ optional: true }) connectionCreatedAt?: Date;
  @date({ optional: true }) lastBoundAt?: Date;
  @date({ optional: true }) lastCredentialUsedAt?: Date;
  @set('complete', 'skipped', 'failed', 'personal') rolesStatus!: ConnectionRolesStatus;
  @int() ownerCount!: number;
  @int() pendingOwnerCount!: number;
}
