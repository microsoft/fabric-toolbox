import { authenticated, boolean, date, entity, text, uuid } from '@microsoft/rayfin-core';
import { syncWriterPolicy } from './sync-policy.js';

/**
 * One external lineage edge (input dataset → output dataset through a job)
 * extracted from an imported OpenLineage file. Stored outside the Fabric
 * snapshot and merged with snapshot edges at read time.
 */
@entity()
@authenticated('read')
@authenticated('create', {
  policy: (claims, item) =>
    claims.email.eq(item.importedByEmail).and(claims.sub.eq(item.importedById)),
})
@authenticated('delete', {
  policy: (claims, item) =>
    claims.sub.eq(item.importedById).or(syncWriterPolicy(claims)),
})
export class ExternalLineageEdge {
  @uuid() id!: string;
  @uuid() workspace_id!: string;
  @uuid() importId!: string;
  @uuid() sourceDatasetId!: string;
  @uuid() targetDatasetId!: string;
  @text({ max: 400 }) jobNamespace!: string;
  @text({ max: 400 }) jobName!: string;
  @text({ max: 20, optional: true }) lastRunState?: string;
  @date({ optional: true }) lastRunTime?: Date;
  @text({ max: 100, optional: true }) runId?: string;
  @text({ max: 1800, optional: true }) columnLineage?: string;
  @boolean({ default: false }) columnTruncated!: boolean;
  @text({ max: 160 }) importedById!: string;
  @text({ max: 160 }) importedByEmail!: string;
}