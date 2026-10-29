import { authenticated, date, entity, int, text, uuid } from '@microsoft/rayfin-core';
import { syncWriterPolicy } from './sync-policy.js';

/**
 * One OpenLineage file imported by hand (v2.7 External lineage). The raw file
 * is never stored: only its counts and result. Rejected files are kept so the
 * user can see why and delete them.
 */
@entity()
@authenticated('read')
@authenticated('create', {
  policy: (claims, item) =>
    claims.email.eq(item.importedByEmail).and(claims.sub.eq(item.importedById)),
})
@authenticated(['update', 'delete'], {
  policy: (claims, item) =>
    claims.sub.eq(item.importedById).or(syncWriterPolicy(claims)),
})
export class OpenLineageImport {
  @uuid() id!: string;
  @uuid() workspace_id!: string;
  @text({ max: 260 }) fileName!: string;
  /** Name given at import time; defaults to the file name without extension. */
  @text({ max: 120, optional: true }) label?: string;
  @text({ max: 64 }) fileHash!: string;
  @text({ max: 400, optional: true }) namespace?: string;
  @text({ max: 40, optional: true }) platform?: string;
  @text({ max: 160 }) importedById!: string;
  @text({ max: 160 }) importedByEmail!: string;
  @date() importedAt!: Date;
  @int() eventCount!: number;
  @int() datasetCount!: number;
  @int() edgeCount!: number;
  @int() toLinkCount!: number;
  @text({ max: 20 }) status!: string;
  @text({ max: 400, optional: true }) rejectReason?: string;
}