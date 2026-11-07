import { authenticated, date, entity, int, set, text, uuid } from '@microsoft/rayfin-core';
import { syncWriterPolicy } from './sync-policy.js';

export type RootRunState = 'planning' | 'ready' | 'running' | 'completed' | 'cancelled';

@entity()
@authenticated('read')
@authenticated(['create', 'update', 'delete'], {
  policy: (claims) => syncWriterPolicy(claims),
})
export class SyncRootRun {
  @uuid() id!: string;
  @uuid() requestId!: string;
  @int() protocolVersion!: number;
  @text({ max: 64 }) planHash!: string;
  @int() workspaceCount!: number;
  @set('planning', 'ready', 'running', 'completed', 'cancelled') state!: RootRunState;
  @set('external-serialized') executionMode!: 'external-serialized';
  @date() createdAt!: Date;
  @date() updatedAt!: Date;
  @date({ optional: true }) cancelRequestedAt?: Date;
  @date({ optional: true }) finishedAt?: Date;
}
