import { authenticated, entity, text, uuid } from '@microsoft/rayfin-core';
import { syncWriterEmailPolicy, syncWriterPolicy } from './sync-policy.js';

/**
 * One role assignment (Owner, PendingOwner, User, UserWithReshare) of a
 * connection in a `ConnectionInventory`. Fabric returns principal IDs and
 * types; a name is stored only when Fabric returns one.
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
export class ConnectionRoleAssignment {
  @uuid() id!: string;
  @uuid() inventoryId!: string;
  @text({ max: 160 }) writerEmail!: string;
  @uuid() connectionId!: string;
  @text({ max: 100 }) principalId!: string;
  @text({ max: 40 }) principalType!: string;
  @text({ max: 200, optional: true }) principalName?: string;
  @text({ max: 30 }) role!: string;
}
