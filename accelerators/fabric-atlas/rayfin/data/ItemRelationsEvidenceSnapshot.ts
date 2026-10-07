import {
  authenticated,
  date,
  entity,
  int,
  set,
  text,
  uuid,
} from '@microsoft/rayfin-core';
import { SYNC_WRITER_SUBJECT } from './sync-policy.js';

export type ItemRelationsEvidenceRowType = 'manifest' | 'chunk';

/**
 * Non-authoritative Item Relations API (Beta) evidence. One envelope is stored
 * as ordered `chunk` rows plus a `manifest` row written last; readers ignore
 * envelopes without a valid manifest. Rows never feed `LineageEdge`.
 */
@entity()
@authenticated('read')
@authenticated('delete', {
  policy: (claims) => claims.sub.eq(SYNC_WRITER_SUBJECT),
})
@authenticated('create', {
  policy: (claims, item) =>
    claims.email
      .eq(item.writerEmail)
      .and(claims.sub.eq(SYNC_WRITER_SUBJECT)),
})
export class ItemRelationsEvidenceSnapshot {
  @uuid() id!: string;
  @uuid() workspace_id!: string;
  /** Atlas snapshot published by the same synchronization. */
  @uuid() snapshotId!: string;
  @uuid() evidenceId!: string;
  @uuid({ optional: true }) correlationId?: string;
  @text({ max: 160 }) writerEmail!: string;
  @set('manifest', 'chunk') rowType!: ItemRelationsEvidenceRowType;
  @int() chunkIndex!: number;
  @int() chunkCount!: number;
  @text({ max: 3500 }) payload!: string;
  @date() collectedAt!: Date;
  @int({ optional: true }) storageVersion?: number;
  @int({ optional: true }) payloadLength?: number;
  @text({ max: 64, optional: true }) payloadHash?: string;
  @int({ optional: true }) queryCount?: number;
  @int({ optional: true }) completeQueryCount?: number;
  @int({ optional: true }) preservedQueryCount?: number;
  @int({ optional: true }) failedQueryCount?: number;
  @int({ optional: true }) relationCount?: number;
  @int({ optional: true }) unresolvedCount?: number;
  @int({ optional: true }) crossWorkspaceCount?: number;
  @int({ optional: true }) conflictCount?: number;
  @int({ optional: true }) sampledItemCount?: number;
  @int({ optional: true }) workspaceItemCount?: number;
  @text({ max: 200, optional: true }) stopReasons?: string;
}
