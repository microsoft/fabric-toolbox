import { ITEM_TYPES, type AtlasData } from "./model";

/*
 * Capability registry for Fabric item families. Each family states catalog,
 * objects, lineage, access and operational coverage independently, so an
 * unsupported or deferred enrichment is never shown as zero or healthy.
 * Entries reflect documented Fabric contracts verified on the date below;
 * unknown and Workload Hub types stay visible with an explicit fallback.
 */

export const ITEM_FAMILIES_VERIFIED_AT = "2026-10-02";
const DEFINITIONS_DOC =
  "https://learn.microsoft.com/en-us/rest/api/fabric/articles/item-management/definitions";

export type CoverageDimension = "catalog" | "objects" | "lineage" | "access" | "operations";

export const COVERAGE_DIMENSIONS: readonly CoverageDimension[] = [
  "catalog",
  "objects",
  "lineage",
  "access",
  "operations",
];

export const COVERAGE_DIMENSION_LABEL: Record<CoverageDimension, string> = {
  catalog: "Catalog",
  objects: "Objects",
  lineage: "Lineage",
  access: "Access",
  operations: "Operations",
};

/**
 * `adapter-only`: a verified read-only adapter exists but its evidence is not
 * part of published snapshots. `excluded`: outside the metadata boundary by
 * design. `deferred`: a documented contract exists, but no projection is
 * approved yet.
 */
export type CoverageState =
  | "collected"
  | "partial"
  | "adapter-only"
  | "deferred"
  | "unsupported"
  | "excluded"
  | "not-applicable";

export const COVERAGE_STATE_LABEL: Record<CoverageState, string> = {
  collected: "Collected",
  partial: "Partial",
  "adapter-only": "Adapter only",
  deferred: "Deferred",
  unsupported: "Unsupported",
  excluded: "Excluded by design",
  "not-applicable": "Not applicable",
};

export interface CoverageEntry {
  state: CoverageState;
  detail: string;
}

export type ItemFamilyKind = "fabric-item" | "derived" | "workload-item" | "unknown-item";

export type ItemFamilyAdapterId = "source-provenance" | "sql-metadata";

export const ITEM_FAMILY_ADAPTERS: Record<
  ItemFamilyAdapterId,
  { label: string; functionName: string; published: boolean; detail: string }
> = {
  "source-provenance": {
    label: "Source provenance",
    functionName: "workspaceCollectSourceProvenance",
    published: true,
    detail:
      "Read-only shortcut, mirroring and MLV execution-definition evidence published with the validated snapshot.",
  },
  "sql-metadata": {
    label: "SQL metadata",
    functionName: "workspaceCollectSqlMetadata",
    published: true,
    detail:
      "Read-only tables, views and columns from fixed Fabric SQL endpoint catalog queries.",
  },
};

export interface ItemFamilyCapability {
  /** Fabric item type, Workload Hub type or derived family key. */
  key: string;
  label: string;
  kind: ItemFamilyKind;
  /** Only set when a Microsoft source states the maturity. */
  maturity?: "ga" | "preview";
  /** Present in the documented Fabric `ItemType` enumeration. */
  documentedItemType: boolean;
  /** Item types that contain a derived family. */
  parentTypes?: readonly string[];
  /** Documented item-definition reference, when one exists. */
  definitionUrl?: string;
  coverage: Record<CoverageDimension, CoverageEntry>;
  adapters: readonly ItemFamilyAdapterId[];
  /** Bounded follow-up proposed by the inventory gap list. */
  followUp?: string;
}

/** Documented Fabric `ItemType` values, matching the Catalog Search filter allowlist. */
export const FABRIC_DOCUMENTED_ITEM_TYPES = [
  "Dashboard", "Report", "SemanticModel", "PaginatedReport", "Datamart",
  "Lakehouse", "Eventhouse", "Environment", "KQLDatabase", "KQLQueryset",
  "KQLDashboard", "DataPipeline", "Notebook", "SparkJobDefinition",
  "MLExperiment", "MLModel", "Warehouse", "Eventstream", "SQLEndpoint",
  "MirroredWarehouse", "MirroredDatabase", "Reflex", "GraphQLApi",
  "MountedDataFactory", "SQLDatabase", "CopyJob", "VariableLibrary",
  "Dataflow", "ApacheAirflowJob", "WarehouseSnapshot", "DigitalTwinBuilder",
  "DigitalTwinBuilderFlow", "MirroredAzureDatabricksCatalog", "Map",
  "AnomalyDetector", "UserDataFunction", "GraphModel", "GraphQuerySet",
  "SnowflakeDatabase", "OperationsAgent", "CosmosDBDatabase", "Ontology",
  "EventSchemaSet", "DataAgent", "MirroredCatalog", "AppBackend", "OrgApp",
  "OrgAppAudience", "DataBuildToolJob", "AzureDatabricksStorage", "Plan",
] as const;

/** Item types listed in Microsoft's item-definition overview. */
const DOCUMENTED_DEFINITIONS: Readonly<Record<string, string>> = {
  CopyJob: "copyjob-definition",
  Dataflow: "dataflow-definition",
  Eventhouse: "eventhouse-definition",
  GraphQLApi: "graphql-api-definition",
  AzureDatabricksStorage: "azure-databricks-storage-definition",
  DataPipeline: "datapipeline-definition",
  DataBuildToolJob: "dbtjob-definition",
  EventSchemaSet: "eventschemaset-definition",
  GraphModel: "graph-model-definition",
  KQLDatabase: "kql-database-definition",
  KQLDashboard: "kql-dashboard-definition",
  KQLQueryset: "kql-queryset-definition",
  Lakehouse: "lakehouse-definition",
  MirroredAzureDatabricksCatalog: "mirrored-azuredatabricks-unitycatalog-definition",
  MirroredCatalog: "mirrored-catalog-definition",
  MirroredDatabase: "mirrored-database-definition",
  MountedDataFactory: "mounted-data-factory-definition",
  Environment: "environment-definition",
  Notebook: "notebook-definition",
  OrgApp: "orgapp-definition",
  OrgAppAudience: "orgappaudience-definition",
  PaginatedReport: "paginatedreport-definition",
  Report: "report-definition",
  SemanticModel: "semantic-model-definition",
  SnowflakeDatabase: "snowflake-database-definition",
  Eventstream: "eventstream-definition",
  Reflex: "reflex-definition",
  SparkJobDefinition: "spark-job-definition",
  VariableLibrary: "variable-library-definition",
};

const entry = (state: CoverageState, detail: string): CoverageEntry => ({ state, detail });

const IDENTITY = entry("collected", "ID, name, type and description from the Fabric Items API.");
const GRANTS = entry(
  "partial",
  "Workspace roles and item users when exposed. Restrictions are not evaluated.",
);
const JOBS = entry("partial", "Recent job instances when the job scheduler returns them.");
const NO_ADAPTER = entry("unsupported", "Top-level identity only. No verified structural adapter.");
const SCANNER_RELATIONS = entry(
  "partial",
  "Scanner relations when returned. Item Relations (Beta) evidence stays separate.",
);
const EXPLICIT_RELATIONS_ONLY = entry(
  "unsupported",
  "Only when a Fabric API returns an explicit relation.",
);
const NOT_SCHEDULED = entry("not-applicable", "No job instances apply to this family.");
const DEFINITION_NOT_REVIEWED = entry(
  "deferred",
  "A documented definition exists, but no metadata-only projection has been reviewed.",
);

function labelFor(type: string, fallback?: string): string {
  return (ITEM_TYPES as Record<string, { label: string } | undefined>)[type]?.label ?? fallback ?? humanize(type);
}

function humanize(type: string): string {
  return type
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

function family(
  key: string,
  overrides: Partial<Omit<ItemFamilyCapability, "coverage">> & {
    coverage?: Partial<Record<CoverageDimension, CoverageEntry>>;
  } = {},
): ItemFamilyCapability {
  const slug = DOCUMENTED_DEFINITIONS[key];
  const documented = (FABRIC_DOCUMENTED_ITEM_TYPES as readonly string[]).includes(key);
  const { coverage, ...rest } = overrides;
  return {
    key,
    label: labelFor(key, overrides.label),
    kind: "fabric-item",
    documentedItemType: documented,
    ...(slug ? { definitionUrl: `${DEFINITIONS_DOC}/${slug}` } : {}),
    adapters: [],
    ...rest,
    coverage: {
      catalog: IDENTITY,
      objects: slug ? DEFINITION_NOT_REVIEWED : NO_ADAPTER,
      lineage: EXPLICIT_RELATIONS_ONLY,
      access: GRANTS,
      operations: JOBS,
      ...coverage,
    },
  };
}

const definitionFollowUp = (label: string) =>
  `Review the documented ${label} definition for a metadata-only projection before adding an adapter.`;

const FAMILIES: readonly ItemFamilyCapability[] = [
  family("Lakehouse", {
    adapters: ["source-provenance"],
    coverage: {
      catalog: entry("collected", "Description, OneLake paths, default schema and SQL endpoint status."),
      objects: entry("partial", "Tables and columns from Lakehouse REST, scanner metadata or a downstream-model subset."),
      lineage: entry("collected", "Scanner relations and the SQL analytics endpoint path."),
    },
    followUp: "Publish shortcut and MLV execution-definition provenance after the durable snapshot cutover.",
  }),
  family("Warehouse", {
    adapters: ["source-provenance"],
    coverage: {
      catalog: entry("collected", "Description, collation, created and updated dates."),
      objects: entry("partial", "Tables, views and columns from the scanner. The SQL catalog stage runs as a shadow."),
      lineage: entry("collected", "Scanner relations."),
    },
    followUp: "Publish shortcut provenance after the durable snapshot cutover.",
  }),
  family("SQLDatabase", {
    coverage: {
      catalog: entry("collected", "Database identity, endpoint, collation and backup metadata."),
      objects: entry("collected", "Schemas, tables, views and columns from a read-only system-catalog query."),
      lineage: entry("collected", "Scanner relations and verified downstream bindings."),
      access: entry("partial", "Workspace roles, item users and SQL metadata visibility. Restrictions are not evaluated."),
    },
  }),
  family("SQLEndpoint", {
    coverage: {
      catalog: entry("collected", "Item identity and scanner metadata."),
      objects: entry("unsupported", "No dedicated object scan. Objects belong to the parent Lakehouse or Warehouse."),
      lineage: entry("collected", "Storage-to-endpoint-to-model relations."),
    },
  }),
  family("SemanticModel", {
    coverage: {
      catalog: entry("collected", "Description, storage mode, provider and documented owner."),
      objects: entry("collected", "Tables, columns, measures, descriptions, hidden flags, measure DAX and resolved dependencies."),
      lineage: entry("collected", "Scanner relations plus DAX-verified measure dependencies."),
    },
  }),
  family("Report", {
    coverage: {
      catalog: entry("collected", "Report type, bound semantic model, documented owner and page inventory."),
      objects: entry("partial", "Pages and order. Visuals and field bindings are not exposed."),
      lineage: entry("collected", "Model binding plus scanner relations."),
    },
  }),
  family("Dashboard", {
    coverage: {
      objects: entry("unsupported", "Tiles and visual bindings are not expanded."),
      lineage: SCANNER_RELATIONS,
    },
  }),
  family("Notebook", {
    coverage: {
      objects: entry("excluded", "Source code and cells stay outside the metadata boundary."),
      lineage: SCANNER_RELATIONS,
    },
  }),
  family("DataPipeline", {
    coverage: {
      objects: entry("excluded", "Activities and expressions are not copied."),
      lineage: SCANNER_RELATIONS,
    },
  }),
  family("Dataflow", {
    coverage: {
      objects: entry("excluded", "Entities and Power Query definitions are not copied."),
      lineage: entry("partial", "Official upstream Dataflow and Datamart IDs plus scanner relations. Cross-workspace dependencies are omitted."),
    },
  }),
  family("Datamart", {
    coverage: {
      objects: entry("unsupported", "No deep object inventory."),
      lineage: entry("partial", "Official upstream Dataflow and Datamart IDs plus scanner relations."),
    },
  }),
  family("Eventhouse", {
    coverage: {
      catalog: entry("collected", "Item metadata and contained KQL database IDs."),
      objects: entry("not-applicable", "KQL databases remain separate catalog items."),
      lineage: entry("collected", "Verified Eventhouse-to-database relations."),
    },
  }),
  family("KQLDatabase", {
    adapters: ["source-provenance"],
    coverage: {
      catalog: entry("collected", "Parent Eventhouse, query endpoint and database type."),
      objects: entry("collected", "Tables, columns, functions and materialized views from KQL structural metadata."),
      lineage: entry("collected", "Parent, materialization and verified consumer relations."),
      access: entry("partial", "Workspace roles, item users and KQL database reader access. Restrictions are not evaluated."),
    },
    followUp: "Publish shortcut provenance after the durable snapshot cutover.",
  }),
  family("KQLQueryset", {
    coverage: {
      objects: entry("excluded", "Saved query text is not copied."),
      lineage: SCANNER_RELATIONS,
    },
  }),
  family("KQLDashboard", {
    coverage: {
      objects: entry("excluded", "Dashboard queries and visual definitions are not copied."),
      lineage: SCANNER_RELATIONS,
    },
  }),
  family("Ontology", {
    maturity: "preview",
    coverage: {
      objects: entry("collected", "Entity types, properties, bindings, relationship types and contextualizations. Requires read-write item permission."),
      lineage: entry("collected", "Physical source-to-property bindings and entity relationship paths."),
      operations: NOT_SCHEDULED,
    },
  }),
  family("GraphModel", {
    maturity: "preview",
    coverage: {
      objects: entry("collected", "Node types, edge types, properties and source mappings. Requires read-write item permission."),
      lineage: entry("collected", "Physical source-to-node, edge and property mappings."),
      operations: NOT_SCHEDULED,
    },
  }),
  family("DataAgent", {
    coverage: {
      objects: entry("collected", "Configured source items and selected objects. Instructions and examples are excluded."),
      lineage: entry("collected", "Selected source objects feed Data Agent source and element nodes."),
      operations: NOT_SCHEDULED,
    },
  }),
  family("Eventstream", {
    coverage: {
      objects: entry("deferred", "Stream topology is not expanded. A documented definition exists but no metadata-only projection is reviewed."),
      lineage: SCANNER_RELATIONS,
    },
    followUp: "Project source and destination item IDs from the documented Eventstream definition, without event payloads.",
  }),
  family("MirroredDatabase", {
    adapters: ["sql-metadata", "source-provenance"],
    coverage: {
      objects: entry("collected", "Tables, views and columns from the SQL endpoint catalog, merged with selected source-table provenance from mirroring.json."),
      lineage: entry("partial", "Scanner relations. Provider, connection and SQL endpoint bindings come from the read-only adapter."),
      operations: entry("collected", "Replication state from getMirroringStatus is stored with the snapshot."),
    },
    followUp: "Add object-level source mappings if Fabric exposes stable mirrored-column bindings.",
  }),
  family("UserDataFunction", {
    coverage: {
      objects: entry("excluded", "Function code is not copied."),
      lineage: SCANNER_RELATIONS,
    },
  }),
  family("AppBackend", {
    maturity: "preview",
    coverage: {
      catalog: entry("collected", "Item identity from the Fabric Items API."),
      objects: entry("unsupported", "No public API exposes dependent services or child items."),
      access: entry("partial", "Workspace roles only. Restrictions are not evaluated."),
    },
  }),
  family("PaginatedReport", { label: "Paginated report", coverage: { lineage: SCANNER_RELATIONS }, followUp: definitionFollowUp("paginated report") }),
  family("Environment", { label: "Environment", followUp: definitionFollowUp("Environment") }),
  family("SparkJobDefinition", { label: "Spark job definition", followUp: definitionFollowUp("Spark job") }),
  family("MLExperiment", { label: "ML experiment" }),
  family("MLModel", { label: "ML model" }),
  family("MirroredWarehouse", { label: "Mirrored warehouse" }),
  family("Reflex", { label: "Activator", followUp: definitionFollowUp("Activator") }),
  family("GraphQLApi", { label: "API for GraphQL", followUp: definitionFollowUp("API for GraphQL") }),
  family("MountedDataFactory", { label: "Mounted Data Factory", followUp: definitionFollowUp("Mounted Data Factory") }),
  family("CopyJob", { label: "Copy job", followUp: definitionFollowUp("Copy job") }),
  family("VariableLibrary", {
    label: "Variable library",
    coverage: {
      objects: entry("deferred", "The documented definition carries variable values. Only names and types could be projected after review."),
    },
    followUp: definitionFollowUp("Variable library"),
  }),
  family("ApacheAirflowJob", { label: "Apache Airflow job" }),
  family("WarehouseSnapshot", { label: "Warehouse snapshot" }),
  family("DigitalTwinBuilder", { label: "Digital twin builder" }),
  family("DigitalTwinBuilderFlow", { label: "Digital twin builder flow" }),
  family("MirroredAzureDatabricksCatalog", {
    label: "Mirrored Azure Databricks catalog",
    followUp: definitionFollowUp("Mirrored Azure Databricks catalog"),
  }),
  family("Map", { label: "Map" }),
  family("AnomalyDetector", { label: "Anomaly detector" }),
  family("GraphQuerySet", { label: "Graph queryset" }),
  family("SnowflakeDatabase", { label: "Snowflake database", followUp: definitionFollowUp("Snowflake database") }),
  family("OperationsAgent", {
    label: "Operations agent",
    coverage: { objects: entry("unsupported", "No documented definition. Agent instructions stay outside the metadata boundary.") },
  }),
  family("CosmosDBDatabase", { label: "Cosmos DB database" }),
  family("EventSchemaSet", {
    label: "Event schema set",
    maturity: "preview",
    coverage: {
      objects: entry("deferred", "The documented definition supports user identity only. Atlas collectors use the Fabric application identity."),
    },
    followUp: "Evaluate a delegated-user Event Schema Set adapter for schema names and versions, without event payloads.",
  }),
  family("MirroredCatalog", { label: "Mirrored catalog", followUp: definitionFollowUp("Mirrored catalog") }),
  family("OrgApp", {
    label: "Org app",
    coverage: { objects: entry("deferred", "Dependent items are inventoried only when a documented contract exposes them.") },
    followUp: definitionFollowUp("Org app"),
  }),
  family("OrgAppAudience", { label: "Org app audience", followUp: definitionFollowUp("Org app audience") }),
  family("DataBuildToolJob", { label: "dbt job", followUp: definitionFollowUp("dbt job") }),
  family("AzureDatabricksStorage", { label: "Azure Databricks storage", followUp: definitionFollowUp("Azure Databricks storage") }),
  family("Plan", { label: "Plan" }),
];

export const MLV_REFRESH_JOB_TYPE = "RefreshMaterializedLakeViews";

const DERIVED_FAMILIES: readonly ItemFamilyCapability[] = [
  {
    key: "MaterializedLakeView",
    label: "Materialized lake view",
    kind: "derived",
    maturity: "ga",
    documentedItemType: false,
    parentTypes: ["Lakehouse"],
    adapters: ["source-provenance"],
    coverage: {
      catalog: entry("not-applicable", "Not a top-level Fabric item type. Views live inside their Lakehouse."),
      objects: entry("adapter-only", "View names selected in documented MLV execution definitions. No documented API lists every view."),
      lineage: entry("adapter-only", "Lakehouses included in an execution definition by ID. Not treated as directed lineage."),
      access: entry("unsupported", "Inherits Lakehouse access. OneLake security is not collected."),
      operations: entry("partial", `${MLV_REFRESH_JOB_TYPE} job instances on the parent Lakehouse when returned.`),
    },
    followUp: "Publish MLV execution-definition evidence after the durable snapshot cutover.",
  },
  {
    key: "KQLMaterializedView",
    label: "KQL materialized view",
    kind: "derived",
    documentedItemType: false,
    parentTypes: ["KQLDatabase"],
    adapters: [],
    coverage: {
      catalog: entry("not-applicable", "A KQL database object, not a Fabric item."),
      objects: entry("collected", "From the KQL database structural schema."),
      lineage: entry("collected", "Source-table materialization relations."),
      access: entry("unsupported", "Inherits KQL database access."),
      operations: entry("unsupported", "Materialization health is not collected."),
    },
  },
  {
    key: "OneLakeShortcut",
    label: "OneLake shortcut",
    kind: "derived",
    documentedItemType: false,
    parentTypes: ["Lakehouse", "Warehouse", "KQLDatabase"],
    adapters: ["source-provenance"],
    coverage: {
      catalog: entry("not-applicable", "A reference inside its item, not a Fabric item."),
      objects: entry("adapter-only", "Name, path and target type from the documented OneLake Shortcuts API."),
      lineage: entry("adapter-only", "OneLake targets by explicit workspace and item ID. External targets by connection ID only."),
      access: entry("unsupported", "Access is decided at the target. OneLake security and connection credentials are not collected."),
      operations: entry("not-applicable", "Shortcuts have no job instances."),
    },
  },
];

const BY_KEY = new Map(
  [...FAMILIES, ...DERIVED_FAMILIES].map((capability) => [capability.key, capability]),
);
const WORKLOAD_TYPE = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*){1,4}$/;

function fallbackFamily(type: string): ItemFamilyCapability {
  const workload = WORKLOAD_TYPE.test(type);
  const segments = type.split(".");
  const label = workload
    ? `${humanize(segments[segments.length - 1])} (${segments.slice(0, -1).join(".")})`
    : humanize(type) || "Item";
  return {
    key: type,
    label,
    kind: workload ? "workload-item" : "unknown-item",
    documentedItemType: false,
    adapters: [],
    coverage: {
      catalog: IDENTITY,
      objects: entry(
        "unsupported",
        workload
          ? "Workload Hub items have no Fabric-documented structural contract."
          : "Unknown item type. Top-level identity only.",
      ),
      lineage: EXPLICIT_RELATIONS_ONLY,
      access: GRANTS,
      operations: JOBS,
    },
  };
}

/** Returns the registered family or an explicit fallback; never throws. */
export function itemFamilyCapability(type: string | undefined | null): ItemFamilyCapability {
  const key = typeof type === "string" ? type.trim() : "";
  return BY_KEY.get(key) ?? fallbackFamily(key);
}

export function itemFamilyLabel(type: string): string {
  return itemFamilyCapability(type).label;
}

export function documentedItemFamilies(): ItemFamilyCapability[] {
  return [...FAMILIES];
}

export function derivedItemFamilies(): ItemFamilyCapability[] {
  return [...DERIVED_FAMILIES];
}

export function isMaterializedLakeViewRefreshJob(jobType: string | undefined | null): boolean {
  return jobType === MLV_REFRESH_JOB_TYPE;
}

export interface ObservedItemFamily {
  capability: ItemFamilyCapability;
  itemCount: number;
  /** Snapshot evidence for derived families, for example MLV refresh jobs. */
  evidence?: string;
}

/** Families present in a snapshot, including derived families with explicit evidence. */
export function observedItemFamilies(
  data: Pick<AtlasData, "items" | "jobs">,
): ObservedItemFamily[] {
  const counts = new Map<string, number>();
  for (const item of data.items) {
    counts.set(item.itemType, (counts.get(item.itemType) ?? 0) + 1);
  }
  const observed: ObservedItemFamily[] = [...counts.entries()].map(([type, itemCount]) => ({
    capability: itemFamilyCapability(type),
    itemCount,
  }));
  const lakehouses = new Set(data.items.filter((item) => item.itemType === "Lakehouse").map((item) => item.fabricId));
  const refreshJobs = data.jobs.filter(
    (job) => isMaterializedLakeViewRefreshJob(job.jobType) && lakehouses.has(job.itemFabricId),
  );
  if (refreshJobs.length) {
    const parents = new Set(refreshJobs.map((job) => job.itemFabricId)).size;
    observed.push({
      capability: itemFamilyCapability("MaterializedLakeView"),
      itemCount: 0,
      evidence: `${refreshJobs.length} refresh job${refreshJobs.length === 1 ? "" : "s"} on ${parents} Lakehouse${parents === 1 ? "" : "s"}`,
    });
  }
  return observed.sort(
    (left, right) =>
      right.itemCount - left.itemCount ||
      left.capability.label.localeCompare(right.capability.label),
  );
}

export interface InventoryGap {
  key: string;
  label: string;
  kind: ItemFamilyKind;
  observedItems: number;
  gaps: { dimension: CoverageDimension; state: CoverageState; detail: string }[];
  followUp?: string;
  definitionUrl?: string;
}

const GAP_STATES = new Set<CoverageState>(["unsupported", "deferred", "adapter-only"]);

/**
 * API-backed gap list: unsupported, deferred and adapter-only dimensions per
 * family. Observed families come first so follow-up issues stay bounded.
 */
export function inventoryGapList(
  observed: readonly ObservedItemFamily[] = [],
  families: readonly ItemFamilyCapability[] = [...FAMILIES, ...DERIVED_FAMILIES],
): InventoryGap[] {
  const observedCounts = new Map(observed.map((entry) => [entry.capability.key, entry.itemCount || 1]));
  const candidates = new Map(families.map((capability) => [capability.key, capability]));
  for (const entry of observed) {
    if (!candidates.has(entry.capability.key)) candidates.set(entry.capability.key, entry.capability);
  }
  return [...candidates.values()]
    .map((capability): InventoryGap => ({
      key: capability.key,
      label: capability.label,
      kind: capability.kind,
      observedItems: observedCounts.get(capability.key) ?? 0,
      gaps: COVERAGE_DIMENSIONS.flatMap((dimension) => {
        const coverage = capability.coverage[dimension];
        return GAP_STATES.has(coverage.state)
          ? [{ dimension, state: coverage.state, detail: coverage.detail }]
          : [];
      }),
      ...(capability.followUp ? { followUp: capability.followUp } : {}),
      ...(capability.definitionUrl ? { definitionUrl: capability.definitionUrl } : {}),
    }))
    .filter((gap) => gap.gaps.length > 0)
    .sort(
      (left, right) =>
        Number(right.observedItems > 0) - Number(left.observedItems > 0) ||
        right.observedItems - left.observedItems ||
        left.label.localeCompare(right.label),
    );
}
