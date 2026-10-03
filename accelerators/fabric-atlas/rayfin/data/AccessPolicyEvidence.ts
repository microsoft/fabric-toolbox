import { authenticated, date, entity, int, set, text, uuid } from '@microsoft/rayfin-core';
import { SYNC_WRITER_SUBJECT } from './sync-policy.js';

@entity()
@authenticated('read')
@authenticated('create', {
  policy: (claims, item) =>
    claims.sub.eq(SYNC_WRITER_SUBJECT).and(claims.email.eq(item.writerEmail)),
})
@authenticated('delete', { policy: (claims) => claims.sub.eq(SYNC_WRITER_SUBJECT) })
export class AccessPolicyEvidence {
  @uuid() id!: string;
  @uuid() workspace_id!: string;
  @uuid() snapshotId!: string;
  @uuid() collectionId!: string;
  @text({ max: 160 }) writerEmail!: string;
  @int() schemaVersion!: number;
  @set('workspace-networking', 'inbound-share-exception', 'fabric-policies-evaluation')
  kind!: 'workspace-networking' | 'inbound-share-exception' | 'fabric-policies-evaluation';
  @text({ max: 80 }) source!: string;
  @text({ max: 80 }) collectorIdentity!: string;
  @set('observed', 'partial', 'unavailable', 'unsupported', 'denied')
  coverage!: 'observed' | 'partial' | 'unavailable' | 'unsupported' | 'denied';
  @text({ max: 80 }) reason!: string;
  @date() attemptedAt!: Date;
  @date({ optional: true }) observedAt?: Date;
  @set({ optional: true }, 'Allow', 'Deny') inboundPublicAction?: 'Allow' | 'Deny';
  @set({ optional: true }, 'Allow', 'Deny') outboundPublicAction?: 'Allow' | 'Deny';
  @set({ optional: true }, 'Allow', 'Deny') externalSharesBypassAction?: 'Allow' | 'Deny';
}
