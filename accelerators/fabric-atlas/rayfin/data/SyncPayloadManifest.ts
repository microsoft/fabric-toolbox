import { authenticated, entity, int, text, uuid } from '@microsoft/rayfin-core';
import { SYNC_WRITER_SUBJECT } from './sync-policy.js';

@entity()
@authenticated(['read', 'create'], {
  policy: (claims) => claims.sub.eq(SYNC_WRITER_SUBJECT),
})
export class SyncPayloadManifest {
  @uuid() id!: string;
  @uuid() taskId!: string;
  @uuid({ optional: true }) checkpointId?: string;
  @text({ max: 80 }) schemaId!: string;
  @text({ max: 32 }) checksumVersion!: string;
  @text({ max: 64 }) contentHash!: string;
  @int() byteCount!: number;
  @int() chunkCount!: number;
}
