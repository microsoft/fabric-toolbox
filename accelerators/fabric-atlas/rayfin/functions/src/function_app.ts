import {
  AudienceType,
  UserDataFunctions,
  type RayfinContext,
} from '@microsoft/fabric-user-data-functions';
import type { AtlasSchema } from '../../data/schema.js';
import { createPingResult, type PingResult } from './ping.js';
import { SyncOrchestrator } from './sync/orchestrator.js';
import { safeSyncCall, type SyncResponse, type SyncUuidInput } from './sync/protocol.js';
import { graphStart, graphContinue, graphStatus, graphCancel } from './sync/graph-functions.js';
import type {
  GraphStartInput, GraphContinueInput, GraphStatusInput, GraphCancelInput, GraphResponse,
} from './sync/graph-protocol.js';
import {
  workspaceCollectCore,
  type WorkspaceCoreEnvelope,
} from './workspace-collector.js';
import {
  workspaceCollectDefinitions,
  type DefinitionItemsInput,
  type DefinitionStageEnvelope,
} from './workspace-definitions.js';
import {
  workspaceCollectItemRelations,
  type ItemRelationsEvidenceEnvelope,
  type ItemRelationsRootItemIdsInput,
} from './workspace-item-relations.js';
import {
  workspaceCollectKqlMetadata,
  type KqlMetadataItemsInput,
  type KqlMetadataStageEnvelope,
} from './workspace-kql-metadata.js';
import {
  workspaceCollectSqlMetadata,
  type SqlMetadataItemsInput,
  type SqlMetadataStageEnvelope,
} from './workspace-sql-metadata.js';
import {
  workspaceDiscover,
  type WorkspaceDiscoveryResult,
} from './workspace-discovery.js';
import {
  workspaceCollectPowerBi,
  type PowerBiAdminEvidenceInput,
  type PowerBiItemsInput,
  type PowerBiStageEnvelope,
} from './workspace-powerbi.js';
import {
  searchCatalogPreview,
  type CatalogSearchContinuationInput,
  type CatalogSearchEnvelope,
  type CatalogSearchItemTypesInput,
  type CatalogSearchPageSizeInput,
  type CatalogSearchTextInput,
  type CatalogSearchWorkspaceIdsInput,
} from './catalog-search.js';
import { workspaceCollectPowerBiScanner } from './workspace-powerbi-scanner.js';
import type { ScannerExpectedItemsInput, ScannerStageEnvelope } from './powerbi-scanner-projection.js';
import { workspaceCollectAccessPolicyEvidence, type PolicyCollectionResult } from './workspace-policy-evidence.js';
import {
  workspaceCollectSourceProvenance,
  type SourceProvenanceItemsInput,
  type SourceProvenanceStageEnvelope,
} from './workspace-source-provenance.js';

const udf = new UserDataFunctions();

udf.func(
  'workspaceCollectAccessPolicyEvidence',
  async (
    ctx: RayfinContext<AtlasSchema, AudienceType.Fabric>,
    protocolVersion: 1,
    workspaceId: SyncUuidInput,
    snapshotId: SyncUuidInput,
  ): Promise<PolicyCollectionResult> =>
    workspaceCollectAccessPolicyEvidence(ctx, protocolVersion, workspaceId, snapshotId),
  [],
);

udf.func('syncGraphStart', async (ctx: RayfinContext<AtlasSchema>, input: GraphStartInput): Promise<GraphResponse> =>
  graphStart(ctx, input), []);
udf.func('syncGraphContinue', async (ctx: RayfinContext<AtlasSchema>, input: GraphContinueInput): Promise<GraphResponse> =>
  graphContinue(ctx, input), []);
udf.func('syncGraphStatus', async (ctx: RayfinContext<AtlasSchema>, input: GraphStatusInput): Promise<GraphResponse> =>
  graphStatus(ctx, input), []);
udf.func('syncGraphCancel', async (ctx: RayfinContext<AtlasSchema>, input: GraphCancelInput): Promise<GraphResponse> =>
  graphCancel(ctx, input), []);

/** Bounded health probe with no secrets, external calls or data writes. */
udf.func('ping', (): PingResult => createPingResult(), []);
udf.func(
  'workspaceDiscover',
  async (
    ctx: RayfinContext<AtlasSchema, AudienceType.Fabric>,
  ): Promise<WorkspaceDiscoveryResult> => workspaceDiscover(ctx),
  [],
);

// Read-only dual-run Core collector stage; its envelope is never published as a snapshot.
// A defaulted nullable parameter keeps typegen and runtime binding aligned:
// typed callers pass null explicitly, and an omitted value binds to null.
udf.func(
  'workspaceCollectCore',
  async (
    ctx: RayfinContext<AtlasSchema, AudienceType.Fabric>,
    protocolVersion: 1,
    workspaceId: SyncUuidInput,
    correlationId: SyncUuidInput | null = null,
  ): Promise<WorkspaceCoreEnvelope> =>
    workspaceCollectCore(ctx, protocolVersion, workspaceId, correlationId),
  [],
);

// Read-only dual-run definition stage for an allowlisted item batch; never authoritative.
udf.func(
  'workspaceCollectDefinitions',
  async (
    ctx: RayfinContext<AtlasSchema, AudienceType.Fabric>,
    protocolVersion: 1,
    workspaceId: SyncUuidInput,
    items: DefinitionItemsInput,
    correlationId: SyncUuidInput | null = null,
  ): Promise<DefinitionStageEnvelope> =>
    workspaceCollectDefinitions(ctx, protocolVersion, workspaceId, items, correlationId),
  [],
);

// Read-only Item Relations API (Beta) evidence for a bounded root-item batch; never authoritative.
udf.func(
  'workspaceCollectItemRelations',
  async (
    ctx: RayfinContext<AtlasSchema, AudienceType.Fabric>,
    protocolVersion: 1,
    workspaceId: SyncUuidInput,
    itemIds: ItemRelationsRootItemIdsInput,
    correlationId: SyncUuidInput | null = null,
  ): Promise<ItemRelationsEvidenceEnvelope> =>
    workspaceCollectItemRelations(ctx, protocolVersion, workspaceId, itemIds, correlationId),
  [],
);

// Read-only KQL structural metadata: Fabric REST properties plus the documented getDefinition
// `DatabaseSchema.kql` part. The Kusto data plane stays unused; Rayfin 1.36.2 has no Kusto audience.
udf.func(
  'workspaceCollectKqlMetadata',
  async (
    ctx: RayfinContext<AtlasSchema, AudienceType.Fabric>,
    protocolVersion: 1,
    workspaceId: SyncUuidInput,
    items: KqlMetadataItemsInput,
    correlationId: SyncUuidInput | null = null,
  ): Promise<KqlMetadataStageEnvelope> =>
    workspaceCollectKqlMetadata(ctx, protocolVersion, workspaceId, items, correlationId),
  [],
);

// Read-only SQL catalog structure for SQL Database, Warehouse and Lakehouse SQL endpoints.
// Fabric REST supplies trusted coordinates; the SQL audience runs fixed parameterized `sys.*` queries.
udf.func(
  'workspaceCollectSqlMetadata',
  async (
    ctx: RayfinContext<AtlasSchema, AudienceType.Fabric | AudienceType.Sql>,
    protocolVersion: 1,
    workspaceId: SyncUuidInput,
    items: SqlMetadataItemsInput,
    correlationId: SyncUuidInput | null = null,
  ): Promise<SqlMetadataStageEnvelope> =>
    workspaceCollectSqlMetadata(ctx, protocolVersion, workspaceId, items, correlationId),
  [],
);

udf.func(
  'workspaceCollectPowerBi',
  async (
    ctx: RayfinContext<AtlasSchema, AudienceType.Fabric>,
    protocolVersion: 1,
    workspaceId: SyncUuidInput,
    items: PowerBiItemsInput,
    includeAdminEvidence: PowerBiAdminEvidenceInput,
    correlationId: SyncUuidInput | null = null,
  ): Promise<PowerBiStageEnvelope> =>
    workspaceCollectPowerBi(ctx, protocolVersion, workspaceId, items, includeAdminEvidence, correlationId),
  [],
);

// Optional OneLake Catalog Search (Preview) discovery: fixed endpoint, metadata only, never authoritative.
// Typed callers pass null or [] explicitly; a continuation token must be sent alone.
udf.func(
  'searchCatalogPreview',
  async (
    ctx: RayfinContext<AtlasSchema, AudienceType.Fabric>,
    protocolVersion: 1,
    search: CatalogSearchTextInput | null,
    itemTypes: CatalogSearchItemTypesInput,
    workspaceIds: CatalogSearchWorkspaceIdsInput,
    pageSize: CatalogSearchPageSizeInput | null,
    continuationToken: CatalogSearchContinuationInput | null,
  ): Promise<CatalogSearchEnvelope> =>
    searchCatalogPreview(ctx, protocolVersion, search, itemTypes, workspaceIds, pageSize, continuationToken),
  [],
);

udf.func(
  'workspaceCollectPowerBiScanner',
  async (
    ctx: RayfinContext<AtlasSchema>,
    protocolVersion: 1,
    tenantId: SyncUuidInput,
    workspaceId: SyncUuidInput,
    expectedItems: ScannerExpectedItemsInput,
    correlationId: SyncUuidInput | null = null,
  ): Promise<ScannerStageEnvelope> =>
    workspaceCollectPowerBiScanner(ctx, protocolVersion, tenantId, workspaceId, expectedItems, correlationId),
  [],
);

// Read-only source provenance from documented shortcut, mirroring and MLV execution-definition
// contracts. Explicit IDs only; never authoritative and never published as a snapshot.
udf.func(
  'workspaceCollectSourceProvenance',
  async (
    ctx: RayfinContext<AtlasSchema, AudienceType.Fabric>,
    protocolVersion: 1,
    workspaceId: SyncUuidInput,
    items: SourceProvenanceItemsInput,
    correlationId: SyncUuidInput | null = null,
  ): Promise<SourceProvenanceStageEnvelope> =>
    workspaceCollectSourceProvenance(ctx, protocolVersion, workspaceId, items, correlationId),
  [],
);

udf.func(
  'syncStart',
  async (
    ctx: RayfinContext<AtlasSchema>,
    protocolVersion: 1,
    workspaceId: SyncUuidInput,
    requestId: SyncUuidInput,
  ): Promise<SyncResponse> => safeSyncCall(() =>
    new SyncOrchestrator(ctx.getDataClient()).start({ protocolVersion, workspaceId, requestId })),
  [],
);

udf.func(
  'syncContinue',
  async (
    ctx: RayfinContext<AtlasSchema>,
    protocolVersion: 1,
    workspaceId: SyncUuidInput,
    jobId: SyncUuidInput,
    requestId: SyncUuidInput,
  ): Promise<SyncResponse> => safeSyncCall(() =>
    new SyncOrchestrator(ctx.getDataClient()).continue({ protocolVersion, workspaceId, jobId, requestId })),
  [],
);

udf.func(
  'syncStatus',
  async (
    ctx: RayfinContext<AtlasSchema>,
    protocolVersion: 1,
    workspaceId: SyncUuidInput,
    jobId?: SyncUuidInput,
  ): Promise<SyncResponse> => safeSyncCall(() =>
    new SyncOrchestrator(ctx.getDataClient()).status({ protocolVersion, workspaceId, jobId })),
  [],
);

udf.func(
  'syncCancel',
  async (
    ctx: RayfinContext<AtlasSchema>,
    protocolVersion: 1,
    workspaceId: SyncUuidInput,
    jobId: SyncUuidInput,
    requestId: SyncUuidInput,
  ): Promise<SyncResponse> => safeSyncCall(() =>
    new SyncOrchestrator(ctx.getDataClient()).cancel({ protocolVersion, workspaceId, jobId, requestId })),
  [],
);
