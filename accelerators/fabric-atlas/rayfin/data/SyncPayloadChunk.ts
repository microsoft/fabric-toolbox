import { authenticated, entity, int, text, uuid } from '@microsoft/rayfin-core';
import { SYNC_WRITER_SUBJECT } from './sync-policy.js';

@entity()
@authenticated(['read', 'create'], {
  policy: (claims) => claims.sub.eq(SYNC_WRITER_SUBJECT),
})
export class SyncPayloadChunk {
  @uuid() id!: string;
  @uuid() payloadId!: string;
  @int() ordinal!: number;
  @text({ max: 1800 }) content!: string;
  @text({ max: 64 }) contentHash!: string;
}
