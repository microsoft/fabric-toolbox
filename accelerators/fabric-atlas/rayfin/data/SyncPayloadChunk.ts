import { authenticated, entity, int, text, uuid } from '@microsoft/rayfin-core';
import { syncWriterPolicy } from './sync-policy.js';

@entity()
@authenticated(['read', 'create'], {
  policy: (claims) => syncWriterPolicy(claims),
})
export class SyncPayloadChunk {
  @uuid() id!: string;
  @uuid() payloadId!: string;
  @int() ordinal!: number;
  @text({ max: 1800 }) content!: string;
  @text({ max: 64 }) contentHash!: string;
}
