import { authenticated, date, entity, int, set, text, uuid } from '@microsoft/rayfin-core';
import { SYNC_WRITER_SUBJECT } from './sync-policy.js';

export type RootRunState = 'planning' | 'ready' | 'running' | 'completed' | 'cancelled';

@entity()
@authenticated('read')
@authenticated(['create', 'update', 'delete'], {
  policy: (claims) => claims.sub.eq(SYNC_WRITER_SUBJECT),
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
