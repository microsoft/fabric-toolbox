import type {
  MirroringDefinition,
  ShortcutProvenance,
  SourceProvenanceItemEvidence,
  SourceProvenanceStageEnvelope,
} from "../../rayfin/functions/src/workspace-source-provenance";

/*
 * Source and security provenance contract, extending the #18 external-lineage
 * principles to mirrored and shortcut sources. Edges are created only from
 * explicit IDs returned by documented Fabric contracts: OneLake target IDs,
 * Fabric connection IDs, landing-zone item IDs and SQL endpoint IDs. Nothing
 * is matched by name. Missing identifiers produce unresolved records, never
 * edges. Policy origin is recorded separately from destination enforcement,
 * which Atlas never claims to have verified.
 */

export const SOURCE_PROVENANCE_CONTRACT_VERSION = 1;

export interface FabricItemRef {
  workspaceId: string;
  itemId: string;
}

export type ProvenanceNode =
  | {
      kind: "fabric-item";
      /** `fabric-item:{workspaceId}:{itemId}` */
      key: string;
      workspaceId: string;
      itemId: string;
      inSnapshot: boolean;
    }
  | {
      kind: "external-connection";
      /** `fabric-connection:{connectionId}`, stable and replay-safe. */
      key: string;
      connectionId: string;
      /** Verbatim provider type from the Fabric contract, for example `AdlsGen2`. */
      provider: string;
    };

export type ProvenanceRelation =
  | "onelake-shortcut"
  | "external-shortcut"
  | "mirroring-source"
  | "mirroring-external-storage"
  | "mirroring-landing-zone"
  | "mirrored-sql-endpoint";

export type ProvenanceEvidenceSource =
  | "fabric-onelake-shortcuts-api"
  | "fabric-mirrored-database-definition"
  | "fabric-mirrored-database-properties";

export interface ProvenanceEdge {
  /** Deterministic key from relation, source, consumer and binding; never time based. */
  key: string;
  relation: ProvenanceRelation;
  /** Upstream provider of data or hosting. */
  source: ProvenanceNode;
  /** Downstream Fabric item in the collected workspace. */
  consumer: FabricItemRef;
  binding: {
    evidenceSource: ProvenanceEvidenceSource;
    /** Documented field that carried the identifier. */
    field: string;
    /** Shortcut path or table selection inside the consumer, when relevant. */
    location?: string;
  };
  observedAt: string;
  authoritative: false;
}

export type UnresolvedProvenanceReason =
  | "target-details-unavailable"
  | "connection-id-missing"
  | "reference-by-variable";

export interface UnresolvedProvenance {
  key: string;
  consumer: FabricItemRef;
  relation: ProvenanceRelation | "mlv-refresh-scope";
  reason: UnresolvedProvenanceReason;
  provider?: string;
  location?: string;
}

/** Lakehouse-adjacent MLV awareness. Refresh scope is orchestration, not lineage. */
export interface MaterializedLakeViewScope {
  key: string;
  lakehouse: FabricItemRef;
  executionDefinitionId: string;
  displayName: string;
  viewSelection: string;
  selectedViews: string[];
  includedLakehouses: (FabricItemRef & { inSnapshot: boolean })[];
  environment?: FabricItemRef;
  unresolvedReferences: number;
  truncated: boolean;
}

export type PolicyMechanism =
  | "sensitivity-label-sync"
  | "source-permission-replication"
  | "target-access-evaluation";

/**
 * Where a policy originates and what Atlas observed about it. A configured
 * origin never implies equivalent enforcement at the destination.
 */
export interface PolicyOriginEvidence {
  key: string;
  consumer: FabricItemRef;
  edgeKey?: string;
  mechanism: PolicyMechanism;
  origin: "source-system" | "shortcut-target";
  evidence: "configured" | "not-configured" | "unavailable";
  destinationEnforcement: "not-verified";
  detail: string;
}

export interface SourceProvenanceCoverage {
  items: number;
  complete: number;
  unsupported: number;
  failed: number;
  edges: number;
  unresolved: number;
  truncated: boolean;
  codes: string[];
}

export interface SourceProvenance {
  contractVersion: typeof SOURCE_PROVENANCE_CONTRACT_VERSION;
  workspaceId: string;
  observedAt: string;
  authoritative: false;
  edges: ProvenanceEdge[];
  unresolved: UnresolvedProvenance[];
  materializedLakeViews: MaterializedLakeViewScope[];
  policyOrigins: PolicyOriginEvidence[];
  coverage: SourceProvenanceCoverage;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function fabricItemNodeKey(ref: FabricItemRef): string {
  return `fabric-item:${ref.workspaceId}:${ref.itemId}`;
}

export function externalConnectionKey(connectionId: string): string {
  return `fabric-connection:${connectionId}`;
}

function part(value: string): string {
  return encodeURIComponent(value);
}

export function provenanceEdgeKey(
  relation: ProvenanceRelation,
  sourceKey: string,
  consumer: FabricItemRef,
  field: string,
  location = "",
): string {
  return ["prov", relation, sourceKey, consumer.workspaceId, consumer.itemId, field, location]
    .map(part)
    .join("|");
}

function lowerUuid(value: string | undefined): string | undefined {
  const normalized = value?.toLowerCase();
  return normalized && UUID.test(normalized) ? normalized : undefined;
}

class ProvenanceBuilder {
  readonly edges = new Map<string, ProvenanceEdge>();
  readonly unresolved = new Map<string, UnresolvedProvenance>();
  readonly policies = new Map<string, PolicyOriginEvidence>();
  readonly scopes = new Map<string, MaterializedLakeViewScope>();

  constructor(
    readonly workspaceId: string,
    readonly observedAt: string,
    readonly snapshotItemIds: ReadonlySet<string>,
  ) {}

  itemNode(ref: FabricItemRef): ProvenanceNode {
    return {
      kind: "fabric-item",
      key: fabricItemNodeKey(ref),
      workspaceId: ref.workspaceId,
      itemId: ref.itemId,
      inSnapshot: ref.workspaceId === this.workspaceId && this.snapshotItemIds.has(ref.itemId),
    };
  }

  connectionNode(connectionId: string, provider: string): ProvenanceNode {
    return {
      kind: "external-connection",
      key: externalConnectionKey(connectionId),
      connectionId,
      provider,
    };
  }

  edge(
    relation: ProvenanceRelation,
    source: ProvenanceNode,
    consumer: FabricItemRef,
    evidenceSource: ProvenanceEvidenceSource,
    field: string,
    location?: string,
  ): string {
    const key = provenanceEdgeKey(relation, source.key, consumer, field, location);
    if (!this.edges.has(key)) {
      this.edges.set(key, {
        key,
        relation,
        source,
        consumer,
        binding: { evidenceSource, field, ...(location ? { location } : {}) },
        observedAt: this.observedAt,
        authoritative: false,
      });
    }
    return key;
  }

  unresolvedRecord(record: Omit<UnresolvedProvenance, "key">): void {
    const key = [
      "unresolved",
      record.relation,
      record.consumer.workspaceId,
      record.consumer.itemId,
      record.reason,
      record.provider ?? "",
      record.location ?? "",
    ]
      .map(part)
      .join("|");
    if (!this.unresolved.has(key)) this.unresolved.set(key, { key, ...record });
  }

  policy(record: Omit<PolicyOriginEvidence, "key" | "destinationEnforcement">): void {
    const key = [
      "policy",
      record.mechanism,
      record.consumer.workspaceId,
      record.consumer.itemId,
      record.edgeKey ?? "",
    ]
      .map(part)
      .join("|");
    if (!this.policies.has(key)) {
      this.policies.set(key, { key, ...record, destinationEnforcement: "not-verified" });
    }
  }
}

function addShortcut(
  builder: ProvenanceBuilder,
  consumer: FabricItemRef,
  shortcut: ShortcutProvenance,
): void {
  const location = shortcut.path.endsWith(`/${shortcut.name}`)
    ? shortcut.path
    : `${shortcut.path.replace(/\/+$/, "")}/${shortcut.name}`;
  if (shortcut.targetType === "OneLake") {
    const workspaceId = lowerUuid(shortcut.oneLake?.workspaceId);
    const itemId = lowerUuid(shortcut.oneLake?.itemId);
    if (!workspaceId || !itemId) {
      builder.unresolvedRecord({
        consumer,
        relation: "onelake-shortcut",
        reason: "target-details-unavailable",
        provider: "OneLake",
        location,
      });
      return;
    }
    const edgeKey = builder.edge(
      "onelake-shortcut",
      builder.itemNode({ workspaceId, itemId }),
      consumer,
      "fabric-onelake-shortcuts-api",
      "target.oneLake.itemId",
      location,
    );
    builder.policy({
      consumer,
      edgeKey,
      mechanism: "target-access-evaluation",
      origin: "shortcut-target",
      evidence: "unavailable",
      detail:
        "Access through this shortcut is decided at the target item. Atlas does not collect target OneLake security.",
    });
    return;
  }
  const connectionId = lowerUuid(shortcut.connectionId);
  if (!connectionId) {
    builder.unresolvedRecord({
      consumer,
      relation: "external-shortcut",
      reason: "connection-id-missing",
      provider: shortcut.targetType,
      location,
    });
    return;
  }
  const edgeKey = builder.edge(
    "external-shortcut",
    builder.connectionNode(connectionId, shortcut.targetType),
    consumer,
    "fabric-onelake-shortcuts-api",
    `target.${shortcut.targetType.charAt(0).toLowerCase()}${shortcut.targetType.slice(1)}.connectionId`,
    location,
  );
  if (shortcut.targetType === "OneDriveSharePoint" && shortcut.sensitivityLabelSyncRequested !== undefined) {
    builder.policy({
      consumer,
      edgeKey,
      mechanism: "sensitivity-label-sync",
      origin: "source-system",
      evidence: shortcut.sensitivityLabelSyncRequested ? "configured" : "not-configured",
      detail: shortcut.sensitivityLabelSyncRequested
        ? "The shortcut asks Fabric to align the item label with a more restrictive SharePoint site label. Atlas does not verify the resulting label."
        : "The shortcut does not request SharePoint site label alignment.",
    });
  }
}

function addMirroring(
  builder: ProvenanceBuilder,
  consumer: FabricItemRef,
  definition: MirroringDefinition | undefined,
  sqlEndpointId: string | undefined,
): void {
  const endpoint = lowerUuid(sqlEndpointId);
  if (endpoint) {
    builder.edge(
      "mirrored-sql-endpoint",
      builder.itemNode(consumer),
      { workspaceId: consumer.workspaceId, itemId: endpoint },
      "fabric-mirrored-database-properties",
      "properties.sqlEndpointProperties.id",
    );
  }
  if (!definition) return;
  const location =
    definition.tableSelection === "all"
      ? "all-tables"
      : `${definition.tables.length}-selected-tables`;
  const connectionId = lowerUuid(definition.connectionId);
  let sourceEdge: string | undefined;
  if (connectionId) {
    sourceEdge = builder.edge(
      "mirroring-source",
      builder.connectionNode(connectionId, definition.sourceType),
      consumer,
      "fabric-mirrored-database-definition",
      "source.typeProperties.connection",
      location,
    );
  } else if (!definition.landingZone) {
    builder.unresolvedRecord({
      consumer,
      relation: "mirroring-source",
      reason: "connection-id-missing",
      provider: definition.sourceType,
    });
  }
  for (const storage of definition.externalStorages) {
    const storageConnection = lowerUuid(storage.connectionId);
    if (!storageConnection) continue;
    builder.edge(
      "mirroring-external-storage",
      builder.connectionNode(storageConnection, storage.type),
      consumer,
      "fabric-mirrored-database-definition",
      "source.typeProperties.externalStorages.typeProperties.connection",
    );
  }
  const zone = definition.landingZone;
  const zoneWorkspace = lowerUuid(zone?.workspaceId);
  const zoneItem = lowerUuid(zone?.itemId);
  if (zone && zoneWorkspace && zoneItem) {
    const zoneEdge = builder.edge(
      "mirroring-landing-zone",
      builder.itemNode({ workspaceId: zoneWorkspace, itemId: zoneItem }),
      consumer,
      "fabric-mirrored-database-definition",
      "source.typeProperties.landingZone.typeProperties.artifactId",
    );
    sourceEdge ??= zoneEdge;
  }
  builder.policy({
    consumer,
    ...(sourceEdge ? { edgeKey: sourceEdge } : {}),
    mechanism: "source-permission-replication",
    origin: "source-system",
    evidence: "unavailable",
    detail:
      "mirroring.json exposes no replicated source roles or permissions, and replicated source roles have no public read API. Destination enforcement is not verified.",
  });
}

function addMaterializedLakeViews(
  builder: ProvenanceBuilder,
  lakehouse: FabricItemRef,
  item: SourceProvenanceItemEvidence,
): void {
  for (const definition of item.materializedLakeViews?.definitions ?? []) {
    const id = lowerUuid(definition.id);
    if (!id) continue;
    const key = ["mlv", lakehouse.workspaceId, lakehouse.itemId, id].map(part).join("|");
    const includedLakehouses = definition.lakehouses.flatMap((reference) => {
      const workspaceId = lowerUuid(reference.workspaceId);
      const itemId = lowerUuid(reference.itemId);
      if (!workspaceId || !itemId) return [];
      const node = builder.itemNode({ workspaceId, itemId });
      return [{ workspaceId, itemId, inSnapshot: node.kind === "fabric-item" && node.inSnapshot }];
    });
    const environmentWorkspace = lowerUuid(definition.environment?.workspaceId);
    const environmentItem = lowerUuid(definition.environment?.itemId);
    builder.scopes.set(key, {
      key,
      lakehouse,
      executionDefinitionId: id,
      displayName: definition.displayName,
      viewSelection: definition.viewSelection,
      selectedViews: [...definition.selectedViews],
      includedLakehouses,
      ...(environmentWorkspace && environmentItem
        ? { environment: { workspaceId: environmentWorkspace, itemId: environmentItem } }
        : {}),
      unresolvedReferences: definition.variableReferences,
      truncated: definition.truncated,
    });
    if (definition.variableReferences > 0) {
      builder.unresolvedRecord({
        consumer: lakehouse,
        relation: "mlv-refresh-scope",
        reason: "reference-by-variable",
        location: id,
      });
    }
  }
}

/**
 * Builds deterministic provenance from one stage envelope. Output order is
 * stable, duplicates collapse by key and replaying the same envelope yields
 * identical keys.
 */
export function buildSourceProvenance(
  envelope: SourceProvenanceStageEnvelope,
  snapshotItemIds: ReadonlySet<string> = new Set(),
): SourceProvenance {
  const workspaceId = envelope.workspaceId.toLowerCase();
  const builder = new ProvenanceBuilder(
    workspaceId,
    envelope.collectedAt,
    new Set([...snapshotItemIds].map((id) => id.toLowerCase())),
  );
  const codes = new Set<string>();
  let truncated = false;
  const counts = { complete: 0, unsupported: 0, failed: 0 };
  for (const item of envelope.items) {
    counts[item.status] += 1;
    if (item.code) codes.add(item.code);
    const itemId = lowerUuid(item.id);
    if (!itemId) continue;
    const consumer = { workspaceId, itemId };
    if (item.shortcuts?.status === "complete") {
      truncated ||= item.shortcuts.truncated;
      for (const shortcut of item.shortcuts.shortcuts) addShortcut(builder, consumer, shortcut);
    }
    if (item.mirroring) {
      const section = item.mirroring.definition;
      const definition =
        section.status === "complete" && section.sourceType
          ? ({ ...section, sourceType: section.sourceType, tableSelection: section.tableSelection ?? "all" } as MirroringDefinition)
          : undefined;
      truncated ||= definition?.tablesTruncated ?? false;
      addMirroring(builder, consumer, definition, item.mirroring.properties.sqlEndpointId);
    }
    if (item.materializedLakeViews?.status === "complete") {
      truncated ||= item.materializedLakeViews.truncated;
      addMaterializedLakeViews(builder, consumer, item);
    }
  }
  const sorted = <T extends { key: string }>(values: Iterable<T>) =>
    [...values].sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
  const edges = sorted(builder.edges.values());
  const unresolved = sorted(builder.unresolved.values());
  return {
    contractVersion: SOURCE_PROVENANCE_CONTRACT_VERSION,
    workspaceId,
    observedAt: envelope.collectedAt,
    authoritative: false,
    edges,
    unresolved,
    materializedLakeViews: sorted(builder.scopes.values()),
    policyOrigins: sorted(builder.policies.values()),
    coverage: {
      items: envelope.items.length,
      ...counts,
      edges: edges.length,
      unresolved: unresolved.length,
      truncated,
      codes: [...codes].sort(),
    },
  };
}
