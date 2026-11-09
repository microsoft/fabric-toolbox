import { authenticated, date, entity, int, text, uuid } from '@microsoft/rayfin-core';
import { syncWriterEmailPolicy, syncWriterPolicy } from './sync-policy.js';

@entity()
@authenticated('read')
@authenticated('create', {
  policy: (claims, item) =>
    syncWriterEmailPolicy(claims, item.writerEmail),
})
@authenticated('update', {
  policy: (claims) => syncWriterPolicy(claims),
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
  policy: (claims) => syncWriterPolicy(claims),
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
