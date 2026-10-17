import {
  ACCESS_EVIDENCE_LABEL,
  ACCESS_LAYER_LABEL,
  GRANT_ONLY_NOTICE,
  buildAccessEvidenceCoverage,
  unknownAccessLayerSummary,
  withStoredPolicyEvidence,
  type AccessEvidenceCoverage,
} from "../access-coverage";
import { assetObjectKindLabel } from "../catalog-objects";
import {
  buildAccessReviewRows,
  selectAccessByItem,
  summarizeAccessReview,
  type AccessReviewRow,
} from "../governance";
import {
  compareSnapshots,
  readableChangeValue,
  snapshotFromData,
  summarizeSnapshot,
  type AtlasChange,
  type AtlasChangeDomain,
  type AtlasHistory,
} from "../history";
import { incidentBriefSection } from "../incident-feeds";
import {
  COVERAGE_DIMENSIONS,
  itemFamilyCapability,
  observedItemFamilies,
  type CoverageDimension,
  type CoverageState,
  type ItemFamilyCapability,
} from "../item-families";
import {
  ItemRelationsContractError,
  itemRelationsNodeKey,
  parseItemRelationsEvidence,
  type ItemRelationsEvidence,
} from "../item-relations-evidence";
import type { PersistedItemRelationsEvidence } from "../item-relations-evidence-source";
import {
  createLineageIndex,
  getItemImpactReport,
  getLineageImpact,
  lineageEdgeKey,
  type LineageImpactItem,
} from "../lineage";
import {
  RELATIONSHIP_AGREEMENT_LABEL,
  buildLineageEvidence,
  type RelationshipAgreement,
  type RelationshipEndpoint,
  type RelationshipEvidence,
} from "../lineage-evidence";
import type { AtlasData, Item } from "../model";
import {
  INCIDENT_LIMITATIONS,
  MONITORING_SOURCES,
  diffIncidents,
  incidentImpact,
  type DownstreamImpact,
  type IncidentComparison,
  type IncidentDelta,
  type IncidentImpact,
} from "../observability";
import {
  OperationalIncidentsUnavailableError,
  type OperationalIncidentRecord,
} from "../operational-incident-store";
import { PREVIEW_API_REGISTRY } from "../preview-api";
import { buildSearchIndex, searchIndex, type SearchResult } from "../search";
import type { WorkspaceScope } from "../workspace-scope";
import {
  POLICY_LABELS,
  POLICY_LIMITATION,
  type AccessPolicyEvidence,
} from "../../../rayfin/functions/src/policy-evidence-contract";
import {
  CATALOG_LOOKUP_KINDS,
  parseToolArguments,
  type AtlasMcpToolArguments,
  type WorkspaceArguments,
} from "./arguments";
import {
  ATLAS_MCP_BASE_LIMITATIONS,
  ATLAS_MCP_CONTRACT,
  ATLAS_MCP_CONTRACT_VERSION,
  ATLAS_MCP_LIMITS,
  AtlasMcpError,
  truncateText,
  type AtlasMcpCoverage,
  type AtlasMcpEnvelope,
  type AtlasMcpErrorCode,
  type AtlasMcpSnapshotRef,
  type AtlasMcpSource,
  type AtlasMcpToolName,
  type AtlasMcpWorkspaceRef,
} from "./contract";
import type { AtlasMcpDataSource } from "./data-source";

// Deterministic evidence tools. Each evaluator reuses the same helpers as the
// Atlas UI over one validated snapshot and never writes or calls Fabric.

export interface AtlasMcpToolRuntime {
  source: AtlasMcpDataSource;
  /** Mirrors the `item-relations` feature flag used by Map & lineage. */
  itemRelationsEnabled: boolean;
  /** Mirrors the `fabric-policies` feature flag used by Access Review. */
  policyEvidenceEnabled?: boolean;
  now: () => Date;
  log?: (message: string) => void;
}

interface ToolOutcome {
  result: object;
  sources: AtlasMcpSource[];
  coverage: AtlasMcpCoverage;
  limitations: string[];
}

interface EnvelopeContext {
  workspace: AtlasMcpWorkspaceRef | null;
  snapshot: AtlasMcpSnapshotRef | null;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function coverage(
  status: AtlasMcpCoverage["status"],
  returned: number,
  total: number,
  notes: string[] = [],
): AtlasMcpCoverage {
  return { status, returned, total, truncated: returned < total, notes };
}

function snapshotSource(
  data: AtlasData,
  entities: string[],
  authority: AtlasMcpSource["authority"] = "authoritative",
): AtlasMcpSource {
  return {
    id: "atlas-snapshot",
    label: "Validated Atlas snapshot",
    authority,
    entities,
    observedAt: data.workspace.syncedAt,
  };
}

function itemRef(item: Item) {
  return {
    itemId: item.fabricId,
    name: item.displayName,
    itemType: item.itemType,
    health: item.health,
  };
}

function findItem(data: AtlasData, itemId: string): Item {
  const id = itemId.toLowerCase();
  const item = data.items.find(
    (candidate) => candidate.fabricId.toLowerCase() === id,
  );
  if (!item) {
    throw new AtlasMcpError(
      "item-not-found",
      "The item is not in the validated snapshot for this workspace. Use atlas_find_catalog_items to look up item IDs.",
    );
  }
  return item;
}

function sectionIncomplete(data: AtlasData, name: string): boolean {
  const section = data.workspace.syncSections?.[name];
  return !!section && section.status !== "complete";
}

function availability(value: boolean | undefined) {
  return value === true ? "available" : value === false ? "unavailable" : "not-recorded";
}

/** Coverage state per dimension from the Phase 8 item-family registry. */
function familyCoverage(
  capability: ItemFamilyCapability,
): Record<CoverageDimension, CoverageState> {
  return Object.fromEntries(
    COVERAGE_DIMENSIONS.map((dimension) => [dimension, capability.coverage[dimension].state]),
  ) as Record<CoverageDimension, CoverageState>;
}

function listWorkspaces(scope: WorkspaceScope[]): ToolOutcome {
  const ordered = [...scope].sort(
    (left, right) =>
      compareText(left.displayName.toLowerCase(), right.displayName.toLowerCase()) ||
      compareText(left.id, right.id),
  );
  const page = ordered.slice(0, ATLAS_MCP_LIMITS.scopeWorkspaces);
  const fallback = scope.some((workspace) => !workspace.persisted);
  return {
    result: {
      workspaces: page.map((workspace) => ({
        workspaceId: workspace.id,
        displayName: workspace.displayName,
        workspaceType: workspace.workspaceType ?? null,
        selectedAt: workspace.selectedAt ?? null,
        selection: workspace.persisted
          ? "administrator-selected"
          : "configured-fallback",
      })),
      defaultWorkspaceId: scope.length === 1 ? scope[0].id : null,
    },
    sources: [
      {
        id: "atlas-workspace-scope",
        label: "Atlas workspace scope",
        authority: "configuration",
        entities: ["WorkspaceScope"],
      },
    ],
    coverage: coverage(
      "complete",
      page.length,
      scope.length,
      fallback
        ? ["No scope is persisted; the configured deployment workspace is the fallback scope."]
        : [],
    ),
    limitations: [
      "Only administrator-selected workspaces are exposed; Atlas MCP never reads other workspaces.",
      "Selection does not mean a workspace has a published snapshot.",
    ],
  };
}

function snapshotProvenance(data: AtlasData): ToolOutcome {
  const summary = summarizeSnapshot(snapshotFromData(data));
  const entries = Object.entries(data.workspace.syncSections ?? {}).sort(
    ([left], [right]) => compareText(left, right),
  );
  const incomplete = entries
    .filter(([, section]) => section.status !== "complete")
    .map(([name]) => name);
  const sections = entries
    .slice(0, ATLAS_MCP_LIMITS.sections)
    .map(([name, section]) => ({
      name: truncateText(name, 60) ?? name,
      status: section.status,
      code: truncateText(section.code, 80) ?? null,
    }));
  const status = entries.length === 0
    ? "unavailable"
    : incomplete.length
      ? "partial"
      : "complete";
  const notes = entries.length === 0
    ? ["This snapshot predates per-section collection status."]
    : incomplete.length
      ? [`Incomplete or unsupported sections: ${incomplete.slice(0, 10).join(", ")}.`]
      : [];
  return {
    result: {
      counts: {
        items: summary.items,
        lineageEdges: summary.lineage,
        brokenLineageEdges: summary.brokenEdges,
        principals: summary.principals,
        externalPrincipals: summary.externalPrincipals,
        recordedGrants: summary.grants,
        jobRuns: data.jobs.length,
        failedJobRuns: summary.failedJobs,
        tables: summary.tables,
        columns: summary.columns,
        measures: summary.measures,
        sensitivityLabelledItems: summary.labels,
      },
      sections,
      itemFamilies: observedItemFamilies(data)
        .slice(0, ATLAS_MCP_LIMITS.itemFamilies)
        .map((family) => ({
          family: family.capability.key,
          label: family.capability.label,
          kind: family.capability.kind,
          itemCount: family.itemCount,
          evidence: family.evidence ?? null,
          coverage: familyCoverage(family.capability),
        })),
      recentSynchronizations: data.syncRuns
        .slice(0, ATLAS_MCP_LIMITS.syncRuns)
        .map((run) => ({
          runId: run.id,
          status: run.status,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt ?? null,
          durationMs: run.durationMs ?? null,
          itemsSynced: run.itemsSynced ?? null,
          failureCode: truncateText(run.failureCode, 80) ?? null,
          failureSummary: truncateText(run.failureMessage) ?? null,
        })),
    },
    sources: [
      snapshotSource(data, [
        "Workspace",
        "FabricItem",
        "LineageEdge",
        "Principal",
        "AccessGrant",
        "JobRun",
        "ConfigEntry",
      ]),
      {
        id: "atlas-sync-audit",
        label: "Atlas synchronization audit",
        authority: "audit",
        entities: ["SyncRun"],
      },
    ],
    coverage: coverage(status, sections.length, entries.length, notes),
    limitations: [
      "A complete section means the collector finished; it does not prove that Fabric exposed every permission, restriction or relationship.",
      "Synchronization audit rows describe Atlas runs, not Fabric job history.",
    ],
  };
}

function catalogMatch(match: SearchResult, itemById: Map<string, Item>) {
  const item = match.target.itemId ? itemById.get(match.target.itemId) : undefined;
  const objectKind = match.target.objectKind;
  return {
    matchType: objectKind ? "object" : "item",
    kind: match.kind,
    name: truncateText(match.title, 200) ?? match.title,
    itemId: match.target.itemId ?? null,
    itemName: item?.displayName ?? null,
    itemType: item?.itemType ?? null,
    objectKind: objectKind ?? null,
    objectLabel: objectKind ? assetObjectKindLabel(objectKind) : null,
    tableName: match.target.tableName ?? null,
    item:
      !objectKind && item
        ? {
            health: item.health,
            endorsement: item.endorsement,
            sensitivity: item.sensitivity ?? null,
            owner: item.ownerName ?? null,
            tags: item.tags.slice(0, 10),
            description: truncateText(item.description) ?? null,
            lastRefresh: item.lastRefresh ?? null,
            updatedAt: item.updatedAt ?? null,
            metadataAvailability: {
              owner: availability(item.ownerMetadataAvailable),
              sensitivity: availability(item.sensitivityMetadataAvailable),
              endorsement: availability(item.endorsementMetadataAvailable),
              tags: availability(item.tagMetadataAvailable),
            },
            familyCoverage: familyCoverage(itemFamilyCapability(item.itemType)),
          }
        : null,
  };
}

function findCatalogItems(
  data: AtlasData,
  args: AtlasMcpToolArguments["atlas_find_catalog_items"],
): ToolOutcome {
  const kinds = new Set<string>(
    args.kinds.length ? args.kinds : CATALOG_LOOKUP_KINDS,
  );
  const types = new Set(args.itemTypes.map((type) => type.toLowerCase()));
  const itemById = new Map(data.items.map((item) => [item.fabricId, item]));
  const index = buildSearchIndex(data).filter((entry) => {
    if (!kinds.has(entry.kind)) return false;
    if (!types.size) return true;
    const item = entry.target.itemId ? itemById.get(entry.target.itemId) : undefined;
    return !!item && types.has(item.itemType.toLowerCase());
  });
  const matches = searchIndex(index, args.query, { limit: index.length });
  const page = matches.slice(0, args.limit);
  const schemaIncomplete = sectionIncomplete(data, "schema");
  const notes = [
    ...(args.kinds.length ? [`Kinds: ${args.kinds.join(", ")}.`] : []),
    ...(args.itemTypes.length ? [`Item types: ${args.itemTypes.join(", ")}.`] : []),
    ...(schemaIncomplete
      ? ["Schema collection was incomplete for this snapshot; table, column and measure matches may be missing."]
      : []),
  ];
  return {
    result: {
      query: args.query,
      matches: page.map((match) => catalogMatch(match, itemById)),
    },
    sources: [snapshotSource(data, ["FabricItem", "ConfigEntry"])],
    coverage: coverage(
      schemaIncomplete ? "partial" : "complete",
      page.length,
      matches.length,
      notes,
    ),
    limitations: [
      "Searches the validated snapshot only; it is not OneLake Catalog Search and an empty result does not prove absence.",
      "Team notes, configuration values, principals and job messages are not searchable through Atlas MCP.",
      "Definitions, DAX expressions, instructions and data values are never returned.",
    ],
  };
}

function impactItem(entry: LineageImpactItem) {
  return {
    itemId: entry.id,
    distance: entry.distance,
    name: entry.item?.displayName ?? null,
    itemType: entry.item?.itemType ?? null,
    health: entry.item?.health ?? null,
  };
}

function knownImpact(
  data: AtlasData,
  args: AtlasMcpToolArguments["atlas_get_known_impact"],
): ToolOutcome {
  const item = findItem(data, args.itemId);
  const report = getItemImpactReport(data, item.fabricId, args.maxDepth);
  const index = createLineageIndex(data.edges);
  const bounded = getLineageImpact(index, item.fabricId, args.maxDepth);
  const reachable = getLineageImpact(index, item.fabricId);
  const upstreamWanted = args.direction !== "downstream";
  const downstreamWanted = args.direction !== "upstream";
  const upstream = upstreamWanted ? report.upstream : [];
  const downstream = downstreamWanted ? report.downstream : [];
  const edgeKeys = new Set([
    ...(upstreamWanted ? bounded.upstream.edgeKeys : []),
    ...(downstreamWanted ? bounded.downstream.edgeKeys : []),
  ]);
  const edges = report.relevantEdges.filter((edge) =>
    edgeKeys.has(lineageEdgeKey(edge)),
  );
  const upstreamPage = upstream.slice(0, args.limit);
  const downstreamPage = downstream.slice(0, args.limit);
  const edgePage = edges.slice(0, ATLAS_MCP_LIMITS.impactEdges);
  const total = upstream.length + downstream.length;
  const returned = upstreamPage.length + downstreamPage.length;
  const lineageIncomplete = sectionIncomplete(data, "lineage");
  const notes = [
    ...(edgePage.length < edges.length
      ? [`Only ${edgePage.length} of ${edges.length} path edges are listed.`]
      : []),
    ...(lineageIncomplete
      ? ["Lineage collection was incomplete for this snapshot."]
      : []),
  ];
  return {
    result: {
      item: itemRef(item),
      direction: args.direction,
      maxDepth: args.maxDepth,
      upstream: upstreamPage.map(impactItem),
      downstream: downstreamPage.map(impactItem),
      reachableWithoutDepthLimit: {
        upstream: upstreamWanted ? reachable.upstream.ids.size : null,
        downstream: downstreamWanted ? reachable.downstream.ids.size : null,
      },
      edges: edgePage.map((edge) => ({
        sourceItemId: edge.source,
        targetItemId: edge.target,
        relation: edge.relation,
        broken: !!edge.broken,
      })),
      brokenEdgesOnPaths: edges.filter((edge) => edge.broken).length,
      unresolvedEndpointIds: report.unresolvedEndpointIds.slice(0, 20),
    },
    sources: [snapshotSource(data, ["LineageEdge", "FabricItem"])],
    coverage: {
      ...coverage(lineageIncomplete ? "partial" : "complete", returned, total, notes),
      truncated: returned < total || edgePage.length < edges.length,
    },
    limitations: [
      "Item-level lineage only; table, column and measure impact is not exposed through Atlas MCP.",
      "Known impact follows collected snapshot lineage; it does not prove runtime data flow, and a missing edge does not prove independence.",
      "Item Relations API (Beta) evidence is not used for impact; see atlas_explain_lineage_evidence.",
    ],
  };
}

type BetaStatus = "disabled" | "not-collected" | "available" | "invalid" | "unavailable";

interface BetaEvidenceState {
  status: BetaStatus;
  persisted?: PersistedItemRelationsEvidence;
}

function endpoint(value: RelationshipEndpoint) {
  return {
    itemId: value.id,
    name: value.displayName,
    itemType: value.itemType ?? null,
    workspaceId: value.workspaceId,
    inSnapshot: value.inSnapshot,
  };
}

function latest(values: readonly string[]): string | null {
  return values.reduce<string | null>(
    (current, value) => (!current || value > current ? value : current),
    null,
  );
}

function relationship(entry: RelationshipEvidence) {
  return {
    relationshipId: entry.id,
    agreement: entry.agreement,
    agreementLabel: RELATIONSHIP_AGREEMENT_LABEL[entry.agreement],
    crossWorkspace: entry.crossWorkspace,
    source: endpoint(entry.source),
    target: endpoint(entry.target),
    authoritative: entry.authoritative
      .slice(0, ATLAS_MCP_LIMITS.evidencePerRelationship)
      .map((edge) => ({
        sourceItemId: edge.source,
        targetItemId: edge.target,
        relation: edge.relation,
        broken: !!edge.broken,
      })),
    preview: entry.preview
      .slice(0, ATLAS_MCP_LIMITS.evidencePerRelationship)
      .map(({ edge, status }) => ({
        relationType: truncateText(edge.relation.relationType, 80) ?? "",
        comparison: status,
        directionVerified: edge.semantics.directionVerified,
        crossWorkspace: edge.crossWorkspace,
        preserved: edge.preserved,
        inCycle: edge.inCycle,
        lastObservedAt: latest(edge.observations.map((observation) => observation.observedAt)),
      })),
  };
}

function explainLineageEvidence(
  data: AtlasData,
  args: AtlasMcpToolArguments["atlas_explain_lineage_evidence"],
  beta: BetaEvidenceState,
): ToolOutcome {
  const item = findItem(data, args.itemId);
  const workspaceId = data.workspace.fabricId.toLowerCase();
  let status = beta.status;
  let evidence: ItemRelationsEvidence | null = null;
  if (status === "available" && beta.persisted) {
    try {
      evidence = parseItemRelationsEvidence(beta.persisted.envelope, workspaceId);
    } catch (error) {
      if (!(error instanceof ItemRelationsContractError)) throw error;
      status = "invalid";
    }
  }
  const model = buildLineageEvidence({
    items: data.items,
    edges: data.edges,
    workspaceId,
    workspaceName: data.workspace.displayName,
    evidence,
  });
  const key = itemRelationsNodeKey(workspaceId, item.fabricId);
  const related = model.relationships.filter(
    (entry) => entry.source.key === key || entry.target.key === key,
  );
  const page = related.slice(0, args.limit);
  const agreementCounts: Partial<Record<RelationshipAgreement, number>> = {};
  for (const entry of related) {
    agreementCounts[entry.agreement] = (agreementCounts[entry.agreement] ?? 0) + 1;
  }
  const lineageIncomplete = sectionIncomplete(data, "lineage");
  const betaNotes: Record<BetaStatus, string | undefined> = {
    disabled: "Item Relations API (Beta) evidence is disabled for this deployment.",
    "not-collected": "No persisted Item Relations API (Beta) evidence exists for this workspace.",
    available: undefined,
    invalid: "Persisted Item Relations API (Beta) evidence failed validation and was not used.",
    unavailable: "Persisted Item Relations API (Beta) evidence could not be read.",
  };
  const notes = [
    ...(betaNotes[status] ? [betaNotes[status] as string] : []),
    ...(lineageIncomplete ? ["Lineage collection was incomplete for this snapshot."] : []),
  ];
  const persisted = status === "available" ? beta.persisted : undefined;
  const descriptor = PREVIEW_API_REGISTRY["item-relations"];
  return {
    result: {
      item: itemRef(item),
      relationships: page.map(relationship),
      agreementCounts,
      itemRelationsEvidence: {
        status,
        apiVersion: descriptor.apiVersion,
        collectedAt: evidence?.collectedAt ?? null,
        evidenceSnapshotId: persisted?.snapshotId ?? null,
        collectedWithCurrentSnapshot: persisted?.snapshotId
          ? persisted.snapshotId.toLowerCase() ===
            (data.workspace.snapshotId ?? "").toLowerCase()
          : null,
        itemQueried: evidence
          ? evidence.queries.some((query) => query.itemId === item.fabricId.toLowerCase())
          : null,
        sampledItemCount: persisted?.coverage?.sampledItemCount ?? null,
        workspaceItemCount: persisted?.coverage?.workspaceItemCount ?? null,
        stopReasons: persisted?.coverage?.stopReasons.slice(0, 10) ?? [],
      },
    },
    sources: [
      snapshotSource(data, ["LineageEdge", "FabricItem"]),
      ...(evidence
        ? [
            {
              id: "fabric-item-relations-api-beta",
              label: "Fabric Item Relations API (Beta), persisted evidence",
              authority: "non-authoritative" as const,
              entities: ["ItemRelationsEvidenceSnapshot"],
              observedAt: evidence.collectedAt,
              maturity: "beta" as const,
            },
          ]
        : []),
    ],
    coverage: coverage(
      lineageIncomplete || (beta.status !== "disabled" && status !== "available")
        ? "partial"
        : "complete",
      page.length,
      related.length,
      notes,
    ),
    limitations: [
      "Item Relations API (Beta) evidence is non-authoritative and never changes Atlas lineage.",
      "Missing Beta evidence means the item was not covered, not that no relationship exists.",
      ...descriptor.limitations,
    ],
  };
}

function assessment(evidence: AccessEvidenceCoverage) {
  return {
    state: evidence.state,
    stateLabel: ACCESS_EVIDENCE_LABEL[evidence.state],
    notice: GRANT_ONLY_NOTICE,
    layers: evidence.layers.map((layer) => ({
      layer: layer.layer,
      label: ACCESS_LAYER_LABEL[layer.layer],
      state: layer.state,
      stateLabel: ACCESS_EVIDENCE_LABEL[layer.state],
      reason: layer.reason,
      source: layer.source ?? null,
    })),
  };
}

function accessSummary(rows: AccessReviewRow[]) {
  const summary = summarizeAccessReview(rows);
  return {
    recordedGrantPairs: summary.rows,
    items: summary.items,
    principals: summary.principals,
    byHighestRecordedGrant: summary.byAccessLevel,
    byOrigin: summary.byOrigin,
    flaggedPairs: summary.flagged,
    unresolvedPrincipalPairs: summary.unresolved,
    ambiguousPrincipalPairs: summary.ambiguous,
  };
}

function accessRow(row: AccessReviewRow) {
  return {
    principal: {
      principalId: row.principalId ?? null,
      displayName: row.principalRef,
      kind: row.principal?.kind ?? null,
      external: row.principal?.external ?? null,
      resolution: row.principalResolution,
    },
    highestRecordedGrant: row.effectiveAccess,
    origin: row.origin,
    flags: row.flags,
    pathCount: row.applicableGrants.length,
    paths: row.applicableGrants
      .slice(0, ATLAS_MCP_LIMITS.grantPathsPerPrincipal)
      .map((grant) => ({
        scope: grant.itemFabricId ? "item" : "workspace",
        accessLevel: grant.accessLevel,
        source: grant.source,
        roleName: grant.roleName ?? null,
      })),
  };
}

type PolicyContextStatus = "disabled" | "not-collected" | "available" | "unavailable";

interface PolicyContextState {
  status: PolicyContextStatus;
  records: AccessPolicyEvidence[];
}

const POLICY_CONTEXT_NOTES: Record<PolicyContextStatus, string | undefined> = {
  disabled: "Stored workspace policy context is disabled for this deployment.",
  "not-collected": "No stored workspace policy context exists for this snapshot.",
  available: undefined,
  unavailable: "Stored workspace policy context could not be read; grant evidence is unchanged.",
};

function policyContext(evidence: AccessEvidenceCoverage, state: PolicyContextState) {
  const records = evidence.policyEvidence ?? [];
  return {
    status: state.status === "available" && !records.length ? "not-collected" : state.status,
    records: records.map((record) => ({
      kind: record.kind,
      label: POLICY_LABELS[record.kind],
      coverage: record.coverage,
      reason: record.reason,
      inboundPublicAction: record.inboundPublicAction ?? null,
      outboundPublicAction: record.outboundPublicAction ?? null,
      externalSharesBypassAction: record.externalSharesBypassAction ?? null,
      attemptedAt: record.attemptedAt,
      observedAt: record.observedAt ?? null,
    })),
  };
}

function accessEvidence(
  data: AtlasData,
  args: AtlasMcpToolArguments["atlas_get_access_evidence"],
  policy: PolicyContextState,
): ToolOutcome {
  // Same recorded grant pairs as Access Review: pairs without a positive grant are omitted.
  const rows = buildAccessReviewRows(data).filter((row) => row.effectiveAccess !== "none");
  const status = (evidence: AccessEvidenceCoverage) =>
    evidence.state === "partial" ? "partial" : "unavailable";
  const sources = (evidence: AccessEvidenceCoverage): AtlasMcpSource[] => [
    snapshotSource(data, ["AccessGrant", "Principal", "FabricItem"]),
    ...(evidence.policyEvidence?.length
      ? [
          {
            id: "atlas-workspace-policy-context",
            label: "Stored workspace policy context (context only)",
            authority: "non-authoritative" as const,
            entities: ["AccessPolicyEvidence"],
            observedAt:
              latest(
                evidence.policyEvidence.map(
                  (record) => record.observedAt ?? record.attemptedAt,
                ),
              ) ?? undefined,
          },
        ]
      : []),
  ];
  const notes = (evidence: AccessEvidenceCoverage, scopeNote?: string) => [
    ...(scopeNote ? [scopeNote] : []),
    `Unknown or incomplete layers: ${unknownAccessLayerSummary(evidence)}.`,
    ...(POLICY_CONTEXT_NOTES[policyContext(evidence, policy).status]
      ? [POLICY_CONTEXT_NOTES[policyContext(evidence, policy).status] as string]
      : []),
  ];
  const limitations = (evidence: AccessEvidenceCoverage) => [
    GRANT_ONLY_NOTICE,
    "Highest recorded grant is not evaluated data access; group membership, OneLake security, Purview DLP and Fabric Policies are not evaluated.",
    ...(evidence.policyEvidence?.length ? [POLICY_LIMITATION] : []),
    "Personal review decisions are user-scoped and never returned.",
    "Atlas MCP cannot grant, change or revoke permissions.",
  ];

  if (args.itemId) {
    const item = findItem(data, args.itemId);
    const itemRows = selectAccessByItem(rows, item.fabricId);
    const evidence = withStoredPolicyEvidence(
      buildAccessEvidenceCoverage(
        data.grants.filter(
          (grant) => !grant.itemFabricId || grant.itemFabricId === item.fabricId,
        ),
        data.workspace,
      ),
      policy.records,
    );
    const page = itemRows.slice(0, args.limit);
    return {
      result: {
        scope: "item",
        item: itemRef(item),
        assessment: assessment(evidence),
        storedPolicyContext: policyContext(evidence, policy),
        recordedGrants: page.map(accessRow),
        summary: accessSummary(itemRows),
      },
      sources: sources(evidence),
      coverage: coverage(status(evidence), page.length, itemRows.length, notes(evidence)),
      limitations: limitations(evidence),
    };
  }

  const evidence = withStoredPolicyEvidence(
    buildAccessEvidenceCoverage(data.grants, data.workspace),
    policy.records,
  );
  const principalKinds = { user: 0, group: 0, servicePrincipal: 0, guest: 0 };
  for (const principal of data.principals) principalKinds[principal.kind] += 1;
  return {
    result: {
      scope: "workspace",
      assessment: assessment(evidence),
      storedPolicyContext: policyContext(evidence, policy),
      summary: accessSummary(rows),
      principalKinds,
      externalPrincipals: data.principals.filter((principal) => principal.external)
        .length,
      workspaceGrants: data.grants.filter((grant) => !grant.itemFabricId).length,
      itemGrants: data.grants.filter((grant) => grant.itemFabricId).length,
    },
    sources: sources(evidence),
    coverage: coverage(
      status(evidence),
      0,
      0,
      notes(evidence, "Workspace scope returns a summary; pass itemId for recorded grant paths."),
    ),
    limitations: limitations(evidence),
  };
}

type IncidentRecordStatus = "available" | "not-collected" | "not-deployed" | "unavailable";

interface IncidentRecordsState {
  status: IncidentRecordStatus;
  records: OperationalIncidentRecord[];
}

type IncidentHistoryState =
  | { status: "not-requested" }
  | { status: "unavailable" }
  | { status: "loaded"; history: AtlasHistory };

const INCIDENT_RECORD_NOTES: Record<IncidentRecordStatus, string | undefined> = {
  available: undefined,
  "not-collected": "No stored incident records exist for this snapshot; incidents are derived from its job history.",
  "not-deployed": "Incident records are not deployed; incidents are derived from the snapshot job history.",
  unavailable: "Stored incident records could not be read; incidents are derived from the snapshot job history.",
};

function downstreamImpact(impact: readonly DownstreamImpact[]) {
  const observed = impact.filter((entry) => entry.evidence === "observed").length;
  return {
    basis: "snapshot-lineage",
    total: impact.length,
    observed,
    inferred: impact.length - observed,
    truncated: impact.length > ATLAS_MCP_LIMITS.impactPerIncident,
    items: impact.slice(0, ATLAS_MCP_LIMITS.impactPerIncident).map((entry) => ({
      itemId: entry.itemId,
      itemName: entry.itemName,
      itemType: entry.itemType ?? null,
      distance: entry.distance,
      evidence: entry.evidence,
      observedIncidentId: entry.observedIncidentId ?? null,
    })),
  };
}

function incidentChanges(data: AtlasData, state: IncidentHistoryState) {
  if (state.status === "not-requested") return null;
  if (state.status === "unavailable") return { status: "unavailable" as const };
  const currentId = (data.workspace.snapshotId ?? "").toLowerCase();
  const position = state.history.snapshots.findIndex(
    (snapshot) => snapshot.snapshotId.toLowerCase() === currentId,
  );
  if (position < 0) return { status: "unavailable" as const };
  const current = state.history.snapshots[position];
  const previous = state.history.snapshots[position + 1];
  if (!previous) return { status: "baseline" as const };
  const comparison: IncidentComparison = {
    previousSnapshotId: previous.snapshotId,
    currentSnapshotId: current.snapshotId,
    previousObservedAt: previous.syncedAt,
    currentObservedAt: current.syncedAt,
  };
  const section = incidentBriefSection(
    diffIncidents(previous.catalog, current.catalog, comparison),
    comparison,
  );
  const ordered: IncidentDelta[] = [
    ...section.opened,
    ...section.recovered,
    ...section.persisting,
    ...section.unreported,
  ];
  return {
    status: "compared" as const,
    ...comparison,
    counts: {
      opened: section.opened.length,
      recovered: section.recovered.length,
      persisting: section.persisting.length,
      unreported: section.unreported.length,
    },
    truncated: ordered.length > ATLAS_MCP_LIMITS.incidentChanges,
    changes: ordered.slice(0, ATLAS_MCP_LIMITS.incidentChanges).map((delta) => ({
      status: delta.status,
      incidentKey: delta.key,
      itemId: delta.incident.itemId,
      itemName: delta.incident.itemName,
      jobType: delta.incident.jobType,
      occurredAt: delta.incident.occurredAt,
      recoveredBy: delta.recoveredBy ?? null,
      downstreamItems: delta.impact.length,
    })),
  };
}

function operationalIncidents(
  data: AtlasData,
  args: AtlasMcpToolArguments["atlas_get_operational_incidents"],
  records: IncidentRecordsState,
  history: IncidentHistoryState,
): ToolOutcome {
  const observedAt = data.workspace.syncedAt;
  const entries: IncidentImpact[] = incidentImpact(data, observedAt, records.records);
  const page = entries.slice(0, args.limit);
  const changes = incidentChanges(data, history);
  const historyNote =
    changes?.status === "baseline"
      ? "No earlier validated snapshot is retained, so no incident changes are reported."
      : changes?.status === "unavailable"
        ? "The previous validated snapshot could not be read, so no incident changes are reported."
        : undefined;
  return {
    result: {
      incidents: page.map(({ incident, impact }) => ({
        incidentId: incident.id,
        incidentKey: incident.key,
        evidence: incident.evidence,
        source: incident.source,
        itemId: incident.itemId,
        itemName: incident.itemName,
        itemType: incident.itemType ?? null,
        jobType: incident.jobType,
        runId: incident.runId ?? null,
        occurredAt: incident.occurredAt,
        observedAt: incident.observedAt ?? null,
        firstObservedAt: incident.firstObservedAt ?? null,
        recorded: incident.recorded,
        durationSec: incident.durationSec,
        message: truncateText(incident.message) ?? null,
        downstreamImpact: args.includeImpact ? downstreamImpact(impact) : null,
      })),
      incidentRecords: { status: records.status, count: records.records.length },
      sincePreviousSnapshot: changes,
      jobRunsInSnapshot: data.jobs.length,
      failedJobRunsInSnapshot: data.jobs.filter((job) => job.status === "failed").length,
      monitoringSources: MONITORING_SOURCES.map((source) => ({
        id: source.id,
        label: source.label,
        status: source.status,
        maturity: source.maturity,
        summary: source.summary,
      })),
    },
    sources: [
      {
        id: "fabric-job-history",
        label: "Fabric job history captured at synchronization",
        authority: "authoritative",
        entities: ["JobRun"],
        observedAt,
        maturity: "generally-available",
      },
      ...(records.status === "available"
        ? [
            {
              id: "atlas-incident-records",
              label: "Atlas incident records",
              authority: "audit" as const,
              entities: ["OperationalIncident"],
              observedAt,
            },
          ]
        : []),
      ...(args.includeImpact
        ? [snapshotSource(data, ["LineageEdge", "FabricItem"], "derived")]
        : []),
      ...(changes?.status === "compared"
        ? [
            {
              id: "atlas-snapshot-history",
              label: "Validated Atlas snapshot history",
              authority: "authoritative" as const,
              entities: ["Workspace", "FabricItem", "LineageEdge", "JobRun"],
              observedAt: changes.previousObservedAt,
            },
          ]
        : []),
    ],
    coverage: coverage("partial", page.length, entries.length, [
      "Only Fabric job history captured at synchronization is collected; workspace monitoring, Monitor hub alerts and App Metrics are not.",
      ...(INCIDENT_RECORD_NOTES[records.status]
        ? [INCIDENT_RECORD_NOTES[records.status] as string]
        : []),
      ...(historyNote ? [historyNote] : []),
    ]),
    limitations: [...INCIDENT_LIMITATIONS, "Job messages are truncated operational metadata."],
  };
}

const WITHHELD_FIELDS = new Set([
  "ownerEmail",
  "configuredBy",
  "modifiedBy",
  "endorsementBy",
  "message",
]);

const SUMMARY_FIELDS: Partial<Record<AtlasChangeDomain, string[]>> = {
  item: ["displayName", "itemType", "health", "endorsement"],
  access: ["accessLevel", "roleName", "flag"],
  lineage: ["source", "target", "relation", "broken"],
  job: ["jobType", "status", "startedAt", "durationSec"],
};

function scalar(value: unknown): string {
  if (value !== null && typeof value === "object") {
    return Array.isArray(value) && value.every((entry) => typeof entry === "string")
      ? truncateText(value.join(", "), 120) ?? ""
      : "[structured value]";
  }
  return truncateText(readableChangeValue(value), 120) ?? "";
}

function changeValue(change: AtlasChange, value: unknown): unknown {
  if (value === undefined || change.domain === "schema") return null;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return scalar(value);
  }
  const record = value as Record<string, unknown>;
  const fields = change.changedFields?.length
    ? change.changedFields
    : SUMMARY_FIELDS[change.domain] ?? [];
  return Object.fromEntries(
    fields
      .slice(0, 20)
      .filter((field) => field in record)
      .map((field) => [
        field,
        WITHHELD_FIELDS.has(field) ? "[withheld]" : scalar(record[field]),
      ]),
  );
}

function snapshotChanges(
  data: AtlasData,
  history: AtlasHistory,
  args: AtlasMcpToolArguments["atlas_get_snapshot_changes"],
): ToolOutcome {
  const currentId = (data.workspace.snapshotId ?? "").toLowerCase();
  const position = history.snapshots.findIndex(
    (snapshot) => snapshot.snapshotId.toLowerCase() === currentId,
  );
  if (position < 0) {
    throw new AtlasMcpError(
      "history-unavailable",
      "Snapshot history did not include the current validated snapshot.",
    );
  }
  const current = history.snapshots[position];
  const previous = history.snapshots[position + 1];
  const sources: AtlasMcpSource[] = [
    {
      id: "atlas-snapshot-history",
      label: "Validated Atlas snapshot history",
      authority: "authoritative",
      entities: [
        "Workspace",
        "FabricItem",
        "LineageEdge",
        "Principal",
        "AccessGrant",
        "JobRun",
        "ConfigEntry",
      ],
      observedAt: current.syncedAt,
    },
  ];
  const limitations = [
    "Changes are computed between the two most recent validated snapshots; changes reverted between synchronizations are invisible.",
    "Email-like values and job messages are withheld; field names still show what changed.",
    "Schema object changes list changed fields only, never definitions or expressions.",
  ];
  const toSnapshot = { snapshotId: current.snapshotId, syncedAt: current.syncedAt };
  if (!previous) {
    return {
      result: { fromSnapshot: null, toSnapshot, countsByType: {}, changes: [] },
      sources,
      coverage: coverage("unavailable", 0, 0, [
        "No earlier validated snapshot is retained for comparison.",
      ]),
      limitations,
    };
  }
  const domains = new Set<string>(args.domains);
  const changes = compareSnapshots(previous, current).filter(
    (change) => !domains.size || domains.has(change.domain),
  );
  const countsByType: Record<string, number> = {};
  for (const change of changes) {
    countsByType[change.type] = (countsByType[change.type] ?? 0) + 1;
  }
  const page = changes.slice(0, args.limit);
  return {
    result: {
      fromSnapshot: { snapshotId: previous.snapshotId, syncedAt: previous.syncedAt },
      toSnapshot,
      countsByType,
      changes: page.map((change) => ({
        changeId: change.id,
        type: change.type,
        domain: change.domain,
        label: truncateText(change.label, 200) ?? change.label,
        itemId: change.itemFabricId ?? null,
        objectKind: change.objectType ?? null,
        objectName: change.objectName ?? null,
        tableName: change.tableName ?? null,
        changedFields: change.changedFields?.slice(0, 20) ?? [],
        before: changeValue(change, change.before),
        after: changeValue(change, change.after),
      })),
    },
    sources,
    coverage: coverage(
      "complete",
      page.length,
      changes.length,
      args.domains.length ? [`Domains: ${args.domains.join(", ")}.`] : [],
    ),
    limitations,
  };
}

function resolveWorkspace(
  scope: WorkspaceScope[],
  requested: string | undefined,
): WorkspaceScope {
  const allowedWorkspaceIds = scope
    .map((workspace) => workspace.id.toLowerCase())
    .slice(0, ATLAS_MCP_LIMITS.allowedWorkspaceIdsInError);
  if (requested) {
    const match = scope.find((workspace) => workspace.id.toLowerCase() === requested);
    if (!match) {
      throw new AtlasMcpError(
        "workspace-not-in-scope",
        "The workspace is not in the Atlas workspace scope.",
        { allowedWorkspaceIds },
      );
    }
    return match;
  }
  if (scope.length === 1) return scope[0];
  throw new AtlasMcpError(
    "workspace-required",
    "Several workspaces are selected; pass workspaceId from atlas_list_workspaces.",
    { allowedWorkspaceIds },
  );
}

function snapshotRef(data: AtlasData, workspaceId: string): AtlasMcpSnapshotRef {
  const snapshotId = data.workspace.snapshotId?.trim();
  const syncedAt = data.workspace.syncedAt?.trim();
  if (
    !snapshotId ||
    !syncedAt ||
    data.workspace.fabricId.trim().toLowerCase() !== workspaceId.toLowerCase()
  ) {
    throw new AtlasMcpError(
      "snapshot-unavailable",
      "The loaded snapshot did not match the requested workspace and was not used.",
    );
  }
  return {
    snapshotId,
    syncedAt,
    ...(data.workspace.deploymentId ? { deploymentId: data.workspace.deploymentId } : {}),
    validation: "manifest-verified",
  };
}

async function stage<T>(
  runtime: AtlasMcpToolRuntime,
  code: AtlasMcpErrorCode,
  message: string,
  load: () => Promise<T>,
): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof AtlasMcpError) throw error;
    runtime.log?.(`[atlas-mcp] ${code}: ${error instanceof Error ? error.name : typeof error}`);
    throw new AtlasMcpError(code, message);
  }
}

async function betaEvidence(
  runtime: AtlasMcpToolRuntime,
  workspaceId: string,
): Promise<BetaEvidenceState> {
  if (!runtime.itemRelationsEnabled) return { status: "disabled" };
  // Beta evidence is optional corroboration: a failed read is reported as
  // unavailable or invalid in the result, never hidden and never fatal.
  try {
    const persisted = await runtime.source.loadItemRelationsEvidence(workspaceId);
    return persisted ? { status: "available", persisted } : { status: "not-collected" };
  } catch (error) {
    if (error instanceof ItemRelationsContractError) return { status: "invalid" };
    runtime.log?.(
      `[atlas-mcp] Item Relations evidence unavailable: ${error instanceof Error ? error.name : typeof error}`,
    );
    return { status: "unavailable" };
  }
}

function failureName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

// Stored policy context, incident records and history enrich a response. A
// failed read is reported as an explicit state, never hidden and never fatal.

async function policyEvidence(
  runtime: AtlasMcpToolRuntime,
  workspaceId: string,
  snapshotId: string,
): Promise<PolicyContextState> {
  if (!runtime.policyEvidenceEnabled) return { status: "disabled", records: [] };
  try {
    const records = await runtime.source.loadPolicyEvidence(workspaceId, snapshotId);
    if (
      records.length > 3 ||
      new Set(records.map((record) => record.kind)).size !== records.length
    ) {
      runtime.log?.("[atlas-mcp] Stored policy context exceeded its contract.");
      return { status: "unavailable", records: [] };
    }
    return { status: records.length ? "available" : "not-collected", records };
  } catch (error) {
    runtime.log?.(`[atlas-mcp] Stored policy context unavailable: ${failureName(error)}`);
    return { status: "unavailable", records: [] };
  }
}

async function incidentRecords(
  runtime: AtlasMcpToolRuntime,
  workspaceId: string,
  snapshotId: string,
): Promise<IncidentRecordsState> {
  try {
    const records = await runtime.source.loadIncidentRecords(workspaceId, snapshotId);
    return { status: records.length ? "available" : "not-collected", records };
  } catch (error) {
    if (error instanceof OperationalIncidentsUnavailableError) {
      return { status: "not-deployed", records: [] };
    }
    runtime.log?.(`[atlas-mcp] Incident records unavailable: ${failureName(error)}`);
    return { status: "unavailable", records: [] };
  }
}

async function incidentHistory(
  runtime: AtlasMcpToolRuntime,
  workspaceId: string,
  data: AtlasData,
): Promise<IncidentHistoryState> {
  try {
    return { status: "loaded", history: await runtime.source.loadHistory(workspaceId, data) };
  } catch (error) {
    runtime.log?.(`[atlas-mcp] Incident history unavailable: ${failureName(error)}`);
    return { status: "unavailable" };
  }
}

function successEnvelope(
  tool: AtlasMcpToolName,
  retrievedAt: string,
  context: EnvelopeContext,
  outcome: ToolOutcome,
): AtlasMcpEnvelope {
  return {
    contract: ATLAS_MCP_CONTRACT,
    contractVersion: ATLAS_MCP_CONTRACT_VERSION,
    tool,
    readOnly: true,
    workspace: context.workspace,
    snapshot: context.snapshot,
    retrievedAt,
    sources: outcome.sources,
    coverage: outcome.coverage,
    limitations: [...ATLAS_MCP_BASE_LIMITATIONS, ...outcome.limitations],
    result: outcome.result,
  };
}

export function errorEnvelope(
  tool: AtlasMcpToolName,
  retrievedAt: string,
  context: EnvelopeContext,
  error: AtlasMcpError,
): AtlasMcpEnvelope {
  return {
    contract: ATLAS_MCP_CONTRACT,
    contractVersion: ATLAS_MCP_CONTRACT_VERSION,
    tool,
    readOnly: true,
    workspace: context.workspace,
    snapshot: context.snapshot,
    retrievedAt,
    sources: [],
    coverage: coverage("unavailable", 0, 0),
    limitations: [...ATLAS_MCP_BASE_LIMITATIONS],
    result: null,
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.allowedWorkspaceIds
        ? { allowedWorkspaceIds: error.allowedWorkspaceIds }
        : {}),
    },
  };
}

/**
 * Runs one read-only tool. The session is checked before arguments, scope or
 * evidence are read; every failure becomes an explicit error envelope.
 */
export async function callAtlasMcpTool(
  tool: AtlasMcpToolName,
  rawArguments: unknown,
  runtime: AtlasMcpToolRuntime,
): Promise<AtlasMcpEnvelope> {
  const retrievedAt = runtime.now().toISOString();
  const context: EnvelopeContext = { workspace: null, snapshot: null };
  try {
    await runtime.source.requireSession();
    const args = parseToolArguments(tool, rawArguments);
    const scope = await stage(
      runtime,
      "scope-unavailable",
      "The Atlas workspace scope could not be read.",
      () => runtime.source.loadWorkspaceScope(),
    );
    if (scope.length === 0) {
      throw new AtlasMcpError("scope-unavailable", "No Atlas workspace scope is configured.");
    }
    if (tool === "atlas_list_workspaces") {
      return successEnvelope(tool, retrievedAt, context, listWorkspaces(scope));
    }
    const workspace = resolveWorkspace(
      scope,
      (args as WorkspaceArguments).workspaceId,
    );
    context.workspace = { workspaceId: workspace.id, displayName: workspace.displayName };
    const data = await stage(
      runtime,
      "snapshot-unavailable",
      "The validated Atlas snapshot could not be read.",
      () => runtime.source.loadSnapshot(workspace.id),
    );
    if (!data) {
      throw new AtlasMcpError(
        "snapshot-unavailable",
        "No validated Atlas snapshot is published for this workspace yet.",
      );
    }
    const snapshot = snapshotRef(data, workspace.id);
    context.snapshot = snapshot;
    context.workspace = {
      workspaceId: workspace.id,
      displayName: data.workspace.displayName || workspace.displayName,
    };

    let outcome: ToolOutcome;
    switch (tool) {
      case "atlas_get_snapshot_provenance":
        outcome = snapshotProvenance(data);
        break;
      case "atlas_find_catalog_items":
        outcome = findCatalogItems(
          data,
          args as AtlasMcpToolArguments["atlas_find_catalog_items"],
        );
        break;
      case "atlas_get_known_impact":
        outcome = knownImpact(data, args as AtlasMcpToolArguments["atlas_get_known_impact"]);
        break;
      case "atlas_explain_lineage_evidence":
        outcome = explainLineageEvidence(
          data,
          args as AtlasMcpToolArguments["atlas_explain_lineage_evidence"],
          await betaEvidence(runtime, workspace.id),
        );
        break;
      case "atlas_get_access_evidence":
        outcome = accessEvidence(
          data,
          args as AtlasMcpToolArguments["atlas_get_access_evidence"],
          await policyEvidence(runtime, workspace.id, snapshot.snapshotId),
        );
        break;
      case "atlas_get_operational_incidents": {
        const incidentArgs = args as AtlasMcpToolArguments["atlas_get_operational_incidents"];
        const [records, history] = await Promise.all([
          incidentRecords(runtime, workspace.id, snapshot.snapshotId),
          incidentArgs.includeHistory
            ? incidentHistory(runtime, workspace.id, data)
            : Promise.resolve<IncidentHistoryState>({ status: "not-requested" }),
        ]);
        outcome = operationalIncidents(data, incidentArgs, records, history);
        break;
      }
      case "atlas_get_snapshot_changes": {
        const history = await stage(
          runtime,
          "history-unavailable",
          "Validated snapshot history could not be read.",
          () => runtime.source.loadHistory(workspace.id, data),
        );
        outcome = snapshotChanges(
          data,
          history,
          args as AtlasMcpToolArguments["atlas_get_snapshot_changes"],
        );
        break;
      }
    }
    return successEnvelope(tool, retrievedAt, context, outcome);
  } catch (error) {
    if (error instanceof AtlasMcpError) {
      return errorEnvelope(tool, retrievedAt, context, error);
    }
    runtime.log?.(
      `[atlas-mcp] ${tool} failed: ${error instanceof Error ? error.name : typeof error}`,
    );
    return errorEnvelope(
      tool,
      retrievedAt,
      context,
      new AtlasMcpError("internal-error", "Atlas MCP could not complete the request."),
    );
  }
}
