// Fabric Atlas — UI data model, item-type metadata, and the workspace dataset.
// This is a self-contained sample (the "AlpineRent" demo: an alpine ski & bike
// rental analytics estate) used for preview mode and the screenshots. When the
// app is deployed and a live Sync runs, these shapes are replaced by the real
// workspace read from the Fabric APIs.

import {
  ITEM_METADATA_SCHEMA_NAME,
  type FabricItemMetadata,
  type MetadataObjectLineageEdge,
} from "./item-metadata";

export type ItemType =
  | "Lakehouse"
  | "Warehouse"
  | "Eventhouse"
  | "KQLDatabase"
  | "KQLQueryset"
  | "KQLDashboard"
  | "SQLEndpoint"
  | "SQLDatabase"
  | "Notebook"
  | "DataPipeline"
  | "Dataflow"
  | "Datamart"
  | "SemanticModel"
  | "Report"
  | "Dashboard"
  | "Eventstream"
  | "MirroredDatabase"
  | "Ontology"
  | "GraphModel"
  | "DataAgent"
  | "UserDataFunction"
  | "AppBackend";

export type Health = "healthy" | "stale" | "failing" | "unknown";
export type Endorsement = "none" | "promoted" | "certified";
export type PrincipalKind = "user" | "group" | "servicePrincipal" | "guest";
export type AccessLevel = "owner" | "edit" | "view" | "none";
export type AccessSource =
  | "workspaceRole"
  | "directShare"
  | "group"
  | "orgLink"
  | "itemOwner";
export type JobStatus = "completed" | "failed" | "running" | "cancelled";
export type WorkspaceRole = "Admin" | "Member" | "Contributor" | "Viewer";

export interface TypeMeta {
  label: string;
  code: string; // 2-letter glyph
  color: string; // glyph background (works on light + dark)
  icon: string; // lucide icon name
}

export const ITEM_TYPES: Record<ItemType, TypeMeta> = {
  Lakehouse: { label: "Lakehouse", code: "LH", color: "#2f9e6f", icon: "Database" },
  Warehouse: { label: "Warehouse", code: "DW", color: "#3b82f6", icon: "Warehouse" },
  Eventhouse: { label: "Eventhouse", code: "EH", color: "#0ea5b7", icon: "Zap" },
  KQLDatabase: { label: "KQL Database", code: "KQ", color: "#14b8a6", icon: "Table2" },
  KQLQueryset: { label: "KQL queryset", code: "QS", color: "#0d9488", icon: "Braces" },
  KQLDashboard: { label: "KQL dashboard", code: "KD", color: "#f59e0b", icon: "LayoutDashboard" },
  SQLEndpoint: { label: "SQL endpoint", code: "SE", color: "#0f6cbd", icon: "Table2" },
  Notebook: { label: "Notebook", code: "NB", color: "#ef7a45", icon: "NotebookText" },
  DataPipeline: { label: "Data pipeline", code: "PL", color: "#7c5cff", icon: "Workflow" },
  Dataflow: { label: "Dataflow Gen2", code: "DF", color: "#d158c4", icon: "Shuffle" },
  Datamart: { label: "Datamart", code: "DM", color: "#0f6cbd", icon: "Database" },
  SemanticModel: { label: "Semantic model", code: "SM", color: "#d9a520", icon: "Boxes" },
  Report: { label: "Report", code: "RP", color: "#eab308", icon: "BarChart3" },
  Dashboard: { label: "Dashboard", code: "DB", color: "#f59e0b", icon: "LayoutDashboard" },
  SQLDatabase: { label: "SQL database", code: "DB", color: "#2563eb", icon: "Database" },
  Eventstream: { label: "Eventstream", code: "ES", color: "#06b6d4", icon: "Radio" },
  MirroredDatabase: { label: "Mirrored DB", code: "MD", color: "#8b5cf6", icon: "Copy" },
  Ontology: { label: "Ontology", code: "ON", color: "#0f766e", icon: "Network" },
  GraphModel: { label: "Graph model", code: "GM", color: "#7c3aed", icon: "Waypoints" },
  DataAgent: { label: "Data agent", code: "DA", color: "#4f46e5", icon: "Bot" },
  UserDataFunction: { label: "User data function", code: "Fn", color: "#64748b", icon: "FunctionSquare" },
  AppBackend: { label: "Fabric app", code: "AP", color: "#0ea5b7", icon: "AppWindow" },
};

const FALLBACK_META: TypeMeta = { label: "Item", code: "··", color: "#8b95a5", icon: "Box" };

/** Item-type metadata that never throws — unknown/blank types get a neutral glyph. */
export function typeMeta(type: string | undefined | null): TypeMeta {
  if (!type) return FALLBACK_META;
  return (ITEM_TYPES as Record<string, TypeMeta>)[type] ?? { ...FALLBACK_META, label: String(type) };
}

export const HEALTH_COLOR: Record<Health, string> = {
  healthy: "#22a565",
  stale: "#e0a417",
  failing: "#e5484d",
  unknown: "#8b95a5",
};

export interface WorkspaceInfo {
  fabricId: string;
  displayName: string;
  capacity: string;
  region: string;
  deploymentId?: string;
  snapshotId?: string;
  syncedAt?: string;
  syncSections?: Record<
    string,
    {
      status: "complete" | "unsupported" | "failed";
      code?: string;
    }
  >;
}

export interface Item {
  fabricId: string;
  displayName: string;
  itemType: ItemType;
  description?: string;
  ownerName?: string;
  ownerEmail?: string;
  configuredBy?: string;
  modifiedBy?: string;
  health: Health;
  endorsement: Endorsement;
  endorsementRaw?: string;
  endorsementBy?: string;
  sensitivity?: string;
  sensitivityLabelId?: string;
  tags: string[];
  tagIds?: string[];
  ownerMetadataAvailable?: boolean;
  sensitivityMetadataAvailable?: boolean;
  endorsementMetadataAvailable?: boolean;
  tagMetadataAvailable?: boolean;
  lastRefresh?: string; // ISO
  createdAt?: string;
  updatedAt?: string;
  size?: string;
}

export interface Edge {
  source: string; // fabricId
  target: string; // fabricId
  relation: string;
  broken?: boolean;
}

export interface Principal {
  principalId: string;
  displayName: string;
  kind: PrincipalKind;
  email?: string;
  external?: boolean;
  workspaceRole: WorkspaceRole;
}

export interface Grant {
  itemFabricId?: string; // empty = workspace-level
  principalRef: string;
  accessLevel: AccessLevel;
  source: AccessSource;
  roleName?: string;
  flag?: "external" | "broad" | "servicePrincipal" | "admin";
}

export interface Job {
  itemFabricId: string;
  itemName: string;
  jobType: string;
  status: JobStatus;
  startedAt: string;
  durationSec: number;
  message?: string;
}

export interface ConfigKV {
  itemFabricId: string;
  section: string;
  label: string;
  value: string;
}

export interface Comment {
  id: string;
  itemFabricId?: string;
  authorId: string;
  authorName: string;
  authorEmail?: string;
  body: string;
  createdAt: string;
}

export interface SyncRun {
  id: string;
  correlationId?: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "completed" | "failed";
  itemsSynced?: number;
  durationMs?: number;
  failureCode?: string;
  failureMessage?: string;
  triggeredBy?: string;
  summary?: string;
}

export interface AtlasData {
  workspace: WorkspaceInfo;
  items: Item[];
  edges: Edge[];
  principals: Principal[];
  grants: Grant[];
  jobs: Job[];
  config: ConfigKV[];
  comments: Comment[];
  syncRuns: SyncRun[];
  // Tabular sub-objects (tables/views, columns and measures) keyed by real item
  // id, populated by live Fabric/Power BI metadata. Report pages stay in config
  // because the Asset Catalog's schema shape is intentionally tabular.
  schema?: Record<string, ModelTableSchema[]>;
  itemMetadata?: Record<string, FabricItemMetadata>;
  objectEdges?: MetadataObjectLineageEdge[];
}

// ---------- helpers ----------

export function initials(name: string): string {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = [
  "#3b82f6", "#22a565", "#d9a520", "#7c5cff", "#0ea5b7",
  "#ef7a45", "#d158c4", "#e5484d", "#14b8a6", "#6366f1",
];
export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function relativeTime(iso?: string): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (Number.isNaN(then)) return "—";
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60000).toISOString();

const OWNER = "System Administrator";
const OWNER_EMAIL = "admin@alpinerent.com";

// ---------- sample workspace (AlpineRent demo) ----------

// Synthetic item ids for the bundled demo dataset (not tied to any real workspace).
const LH = "10000000-0000-4000-8000-000000000001";
const SE = "10000000-0000-4000-8000-000000000002";
const NB_BRONZE = "10000000-0000-4000-8000-000000000003";
const NB_SILVER = "10000000-0000-4000-8000-000000000004";
const NB_GOLD = "10000000-0000-4000-8000-000000000005";
const NB_FCAST = "10000000-0000-4000-8000-000000000006";
const DW = "10000000-0000-4000-8000-000000000007";
const SM = "10000000-0000-4000-8000-000000000008";
const RP_EXEC = "10000000-0000-4000-8000-000000000009";
const RP_STATION = "10000000-0000-4000-8000-000000000010";
const PL = "10000000-0000-4000-8000-000000000011";
const EH = "10000000-0000-4000-8000-000000000012";
const KQL_DEFAULT = "10000000-0000-4000-8000-000000000013";
const KQL_EVENTS = "10000000-0000-4000-8000-000000000014";

// ---------- deep lineage: real semantic-model / gold schema (from TMDL) ----------

export interface ModelColumn {
  name: string;
  dataType: string;
  objectType?: string;
  description?: string;
  isHidden?: boolean;
}
export interface ModelMeasure {
  name: string;
  expr?: string;
  description?: string;
  isHidden?: boolean;
}
export interface ModelTableSchema {
  name: string;
  rows?: number;
  objectType?: string;
  source?: string;
  description?: string;
  isHidden?: boolean;
  columns: ModelColumn[];
  measures: ModelMeasure[];
  metadata?: FabricItemMetadata;
}

const AR_TABLES: ModelTableSchema[] = [
  {
    name: "rentals_daily_summary",
    rows: 210,
    measures: [
      { name: "Total Rentals", expr: "SUM(rentals_daily_summary[total_rentals])" },
      { name: "Total Revenue", expr: "SUM(rentals_daily_summary[total_revenue_chf])" },
      { name: "Avg Rental Duration", expr: "DIVIDE(SUMX(...), SUM(total_rentals))" },
      { name: "Active Member-Days", expr: "SUM(rentals_daily_summary[unique_members])" },
      { name: "Multiday Rentals", expr: "SUM(rentals_daily_summary[multiday_rentals])" },
    ],
    columns: [
      { name: "rental_date", dataType: "dateTime" },
      { name: "total_rentals", dataType: "int64" },
      { name: "total_revenue_chf", dataType: "double" },
      { name: "avg_duration_hours", dataType: "double" },
      { name: "unique_members", dataType: "int64" },
      { name: "avg_revenue_chf", dataType: "double" },
      { name: "multiday_rentals", dataType: "int64" },
      { name: "day_of_week", dataType: "string" },
    ],
  },
  {
    name: "station_utilization",
    rows: 34,
    measures: [
      { name: "Total Station Revenue", expr: "SUM(station_utilization[total_revenue_chf])" },
      { name: "Avg Utilization Index", expr: "AVERAGE(station_utilization[utilization_index])" },
    ],
    columns: [
      { name: "station_id", dataType: "string" },
      { name: "station_name", dataType: "string" },
      { name: "resort", dataType: "string" },
      { name: "region", dataType: "string" },
      { name: "elevation_band", dataType: "string" },
      { name: "capacity", dataType: "int64" },
      { name: "total_rentals", dataType: "int64" },
      { name: "total_revenue_chf", dataType: "double" },
      { name: "avg_duration_hours", dataType: "double" },
      { name: "unique_members", dataType: "int64" },
      { name: "one_way_rentals", dataType: "int64" },
      { name: "utilization_index", dataType: "double" },
      { name: "revenue_per_capacity", dataType: "double" },
    ],
  },
  {
    name: "equipment_performance",
    rows: 7,
    measures: [
      { name: "Equipment Revenue", expr: "SUM(equipment_performance[total_revenue_chf])" },
      { name: "Avg Daily Rate", expr: "AVERAGE(equipment_performance[avg_daily_rate_chf])" },
    ],
    columns: [
      { name: "category", dataType: "string" },
      { name: "total_rentals", dataType: "int64" },
      { name: "total_revenue_chf", dataType: "double" },
      { name: "avg_daily_rate_chf", dataType: "double" },
      { name: "avg_duration_hours", dataType: "double" },
      { name: "distinct_items", dataType: "int64" },
      { name: "revenue_per_item", dataType: "double" },
    ],
  },
  {
    name: "member_segments",
    rows: 4,
    measures: [
      { name: "Segment Members", expr: "SUM(member_segments[active_members])" },
      { name: "Segment Revenue", expr: "SUM(member_segments[total_revenue_chf])" },
    ],
    columns: [
      { name: "membership_tier", dataType: "string" },
      { name: "tier_rank", dataType: "int64" },
      { name: "active_members", dataType: "int64" },
      { name: "total_rentals", dataType: "int64" },
      { name: "total_revenue_chf", dataType: "double" },
      { name: "avg_rental_value_chf", dataType: "double" },
      { name: "revenue_per_member", dataType: "double" },
    ],
  },
  {
    name: "revenue_by_month",
    rows: 7,
    measures: [
      { name: "Monthly Revenue", expr: "SUM(revenue_by_month[total_revenue_chf])" },
      { name: "Revenue MoM %", expr: "DIVIDE([Monthly Revenue]-[PM], [PM])" },
    ],
    columns: [
      { name: "rental_month", dataType: "string" },
      { name: "total_rentals", dataType: "int64" },
      { name: "total_revenue_chf", dataType: "double" },
      { name: "unique_members", dataType: "int64" },
    ],
  },
  {
    name: "demand_forecast",
    rows: 14,
    measures: [
      { name: "Forecast Rentals", expr: "SUM(demand_forecast[forecast_rentals])" },
      { name: "Forecast Revenue", expr: "SUM(demand_forecast[forecast_revenue_chf])" },
    ],
    columns: [
      { name: "forecast_date", dataType: "dateTime" },
      { name: "method", dataType: "string" },
      { name: "forecast_rentals", dataType: "double" },
      { name: "forecast_revenue_chf", dataType: "double" },
      { name: "generated_ts", dataType: "dateTime" },
    ],
  },
];

/** Real table/column/measure schema, keyed by item fabricId. The Semantic model
 *  carries measures; the Lakehouse gold layer carries the same tables (source of
 *  the Direct Lake model) without measures. Pulled from the model TMDL. */
export const MODEL_SCHEMA: Record<string, ModelTableSchema[]> = {
  [SM]: AR_TABLES,
  [LH]: AR_TABLES.map((t) => ({ ...t, measures: [] })),
};

/** Sub-object schema for an item: live-synced schema first, sample schema as fallback. */
export function schemaFor(
  data: { schema?: Record<string, ModelTableSchema[]> },
  id: string,
): ModelTableSchema[] | undefined {
  const tables = data.schema?.[id] ?? MODEL_SCHEMA[id];
  return tables?.filter((table) => table.name !== ITEM_METADATA_SCHEMA_NAME);
}

export const SAMPLE_DATA: AtlasData = {
  workspace: {
    fabricId: "10000000-0000-4000-8000-0000000000f0",
    displayName: "AlpineRent Analytics",
    capacity: "F16 · West Europe",
    region: "West Europe",
  },
  items: [
    { fabricId: PL, displayName: "AlpineRent Daily Load", itemType: "DataPipeline", health: "healthy", endorsement: "none", ownerName: OWNER, ownerEmail: OWNER_EMAIL, tags: ["orchestration"], lastRefresh: iso(20), description: "Orchestrates Bronze → Silver → Gold → Forecast." },
    { fabricId: NB_BRONZE, displayName: "01_bronze_ingest", itemType: "Notebook", health: "healthy", endorsement: "none", ownerName: OWNER, ownerEmail: OWNER_EMAIL, tags: ["etl", "bronze"], lastRefresh: iso(40), description: "Generates AlpineRent sample data into the bronze schema." },
    { fabricId: NB_SILVER, displayName: "02_silver_transform", itemType: "Notebook", health: "healthy", endorsement: "none", ownerName: OWNER, ownerEmail: OWNER_EMAIL, tags: ["etl", "silver"], lastRefresh: iso(35), description: "Cleans and conforms bronze into silver." },
    { fabricId: NB_GOLD, displayName: "03_gold_aggregate", itemType: "Notebook", health: "healthy", endorsement: "none", ownerName: OWNER, ownerEmail: OWNER_EMAIL, tags: ["etl", "gold"], sensitivity: "General", lastRefresh: iso(30), description: "Builds the gold analytics tables." },
    { fabricId: NB_FCAST, displayName: "04_demand_forecast", itemType: "Notebook", health: "healthy", endorsement: "none", ownerName: OWNER, ownerEmail: OWNER_EMAIL, tags: ["ml", "gold"], lastRefresh: iso(26), description: "Simple demand forecast into gold.demand_forecast." },
    { fabricId: LH, displayName: "alpinerent_lakehouse", itemType: "Lakehouse", health: "healthy", endorsement: "certified", ownerName: OWNER, ownerEmail: OWNER_EMAIL, tags: ["alpinerent", "medallion"], sensitivity: "Highly Confidential", lastRefresh: iso(28), size: "bronze / silver / gold", description: "Schema-enabled lakehouse with bronze, silver and gold schemas." },
    { fabricId: DW, displayName: "alpinerent_dw", itemType: "Warehouse", health: "healthy", endorsement: "none", ownerName: OWNER, ownerEmail: OWNER_EMAIL, tags: ["star-schema"], sensitivity: "General", lastRefresh: iso(55), description: "Star schema: dim_date, dim_station, dim_equipment, fact_rentals." },
    { fabricId: EH, displayName: "AlpineRent Telemetry", itemType: "Eventhouse", health: "healthy", endorsement: "none", ownerName: OWNER, ownerEmail: OWNER_EMAIL, tags: ["realtime"], lastRefresh: iso(15), description: "Real-time telemetry host for station and bike events." },
    { fabricId: SE, displayName: "alpinerent_lakehouse", itemType: "SQLEndpoint", health: "healthy", endorsement: "none", ownerName: OWNER, ownerEmail: OWNER_EMAIL, tags: ["sql"], sensitivity: "Confidential", lastRefresh: iso(28), description: "SQL analytics endpoint auto-provisioned over the lakehouse." },
    { fabricId: SM, displayName: "AlpineRent Sales Model", itemType: "SemanticModel", health: "healthy", endorsement: "certified", ownerName: OWNER, ownerEmail: OWNER_EMAIL, tags: ["gold", "direct-lake"], sensitivity: "Confidential", lastRefresh: iso(12), description: "Direct Lake model over the gold schema, 6 tables + measures." },
    { fabricId: KQL_DEFAULT, displayName: "AlpineRent Telemetry", itemType: "KQLDatabase", health: "unknown", endorsement: "none", ownerName: OWNER, ownerEmail: OWNER_EMAIL, tags: ["realtime"], lastRefresh: iso(15), description: "Default database of the Eventhouse (empty)." },
    { fabricId: KQL_EVENTS, displayName: "AlpineRent Telemetry Events", itemType: "KQLDatabase", health: "healthy", endorsement: "none", ownerName: OWNER, ownerEmail: OWNER_EMAIL, tags: ["realtime", "kql"], lastRefresh: iso(15), description: "StationTelemetry, BikeEvents, LiftRideEvents + StationHourlyLoad()." },
    { fabricId: RP_EXEC, displayName: "AlpineRent Executive Dashboard", itemType: "Report", health: "healthy", endorsement: "promoted", ownerName: OWNER, ownerEmail: OWNER_EMAIL, tags: ["exec"], sensitivity: "Confidential", lastRefresh: iso(10), description: "KPIs, daily revenue trend, top stations, monthly table." },
    { fabricId: RP_STATION, displayName: "AlpineRent Station Utilization", itemType: "Report", health: "healthy", endorsement: "none", ownerName: OWNER, ownerEmail: OWNER_EMAIL, tags: ["ops"], sensitivity: "Confidential", lastRefresh: iso(10), description: "Station utilization and demand forecast." },
  ],
  edges: [
    { source: PL, target: NB_BRONZE, relation: "orchestrates" },
    { source: PL, target: NB_SILVER, relation: "orchestrates" },
    { source: PL, target: NB_GOLD, relation: "orchestrates" },
    { source: PL, target: NB_FCAST, relation: "orchestrates" },
    { source: NB_BRONZE, target: LH, relation: "writes bronze" },
    { source: NB_SILVER, target: LH, relation: "writes silver" },
    { source: NB_GOLD, target: LH, relation: "writes gold" },
    { source: NB_FCAST, target: LH, relation: "writes forecast" },
    { source: LH, target: SE, relation: "endpoint" },
    { source: LH, target: SM, relation: "Direct Lake" },
    { source: SM, target: RP_EXEC, relation: "binds" },
    { source: SM, target: RP_STATION, relation: "binds" },
    { source: EH, target: KQL_DEFAULT, relation: "default db" },
    { source: EH, target: KQL_EVENTS, relation: "database" },
  ],
  principals: [
    { principalId: "u-admin", displayName: "System Administrator", kind: "user", email: OWNER_EMAIL, workspaceRole: "Admin" },
    { principalId: "u-tom", displayName: "Tom Berg", kind: "user", email: "tom.berg@alpinerent.com", workspaceRole: "Member" },
    { principalId: "g-de", displayName: "Data Engineering", kind: "group", workspaceRole: "Contributor" },
    { principalId: "g-bi", displayName: "BI Analysts", kind: "group", workspaceRole: "Viewer" },
    { principalId: "sp-etl", displayName: "svc-alpine-etl", kind: "servicePrincipal", workspaceRole: "Contributor" },
    { principalId: "u-lea", displayName: "Léa Martin", kind: "user", email: "lea.martin@alpinerent.com", workspaceRole: "Viewer" },
    { principalId: "gu-partner", displayName: "ext-partner@vendor.com", kind: "guest", email: "ext-partner@vendor.com", external: true, workspaceRole: "Viewer" },
  ],
  grants: [
    { principalRef: "System Administrator", accessLevel: "owner", source: "workspaceRole", roleName: "Admin", flag: "admin" },
    { principalRef: "Tom Berg", accessLevel: "edit", source: "workspaceRole", roleName: "Member" },
    { principalRef: "Data Engineering", accessLevel: "edit", source: "workspaceRole", roleName: "Contributor" },
    { principalRef: "BI Analysts", accessLevel: "view", source: "workspaceRole", roleName: "Viewer" },
    { principalRef: "svc-alpine-etl", accessLevel: "edit", source: "workspaceRole", roleName: "Contributor", flag: "servicePrincipal" },
    { itemFabricId: RP_EXEC, principalRef: "System Administrator", accessLevel: "owner", source: "itemOwner" },
    { itemFabricId: SM, principalRef: "System Administrator", accessLevel: "owner", source: "itemOwner" },
    { itemFabricId: RP_STATION, principalRef: "Léa Martin", accessLevel: "view", source: "directShare", roleName: "Read" },
    { itemFabricId: SM, principalRef: "Léa Martin", accessLevel: "view", source: "directShare", roleName: "ReadReshareExplore" },
    { itemFabricId: RP_EXEC, principalRef: "ext-partner@vendor.com", accessLevel: "view", source: "directShare", flag: "external" },
    { itemFabricId: LH, principalRef: "svc-alpine-etl", accessLevel: "edit", source: "directShare", flag: "servicePrincipal" },
    { itemFabricId: NB_GOLD, principalRef: "Data Engineering", accessLevel: "edit", source: "directShare" },
  ],
  jobs: [
    { itemFabricId: NB_BRONZE, itemName: "01_bronze_ingest", jobType: "Notebook run", status: "completed", startedAt: iso(40), durationSec: 182 },
    { itemFabricId: NB_SILVER, itemName: "02_silver_transform", jobType: "Notebook run", status: "completed", startedAt: iso(35), durationSec: 151 },
    { itemFabricId: NB_GOLD, itemName: "03_gold_aggregate", jobType: "Notebook run", status: "completed", startedAt: iso(30), durationSec: 168 },
    { itemFabricId: NB_FCAST, itemName: "04_demand_forecast", jobType: "Notebook run", status: "completed", startedAt: iso(26), durationSec: 74 },
    { itemFabricId: PL, itemName: "AlpineRent Daily Load", jobType: "Pipeline run", status: "completed", startedAt: iso(20), durationSec: 615 },
    { itemFabricId: SM, itemName: "AlpineRent Sales Model", jobType: "Refresh", status: "completed", startedAt: iso(12), durationSec: 44, message: "Direct Lake framing refresh" },
  ],
  config: [
    { itemFabricId: LH, section: "General", label: "Schemas", value: "bronze, silver, gold" },
    { itemFabricId: LH, section: "Gold tables", label: "rentals_daily_summary", value: "210 rows" },
    { itemFabricId: LH, section: "Gold tables", label: "station_utilization", value: "34 rows" },
    { itemFabricId: LH, section: "Gold tables", label: "equipment_performance", value: "7 rows" },
    { itemFabricId: LH, section: "Gold tables", label: "member_segments", value: "4 rows" },
    { itemFabricId: LH, section: "Gold tables", label: "revenue_by_month", value: "7 rows" },
    { itemFabricId: LH, section: "Gold tables", label: "demand_forecast", value: "14 rows" },
    { itemFabricId: DW, section: "Tables", label: "dim_date", value: "210 rows" },
    { itemFabricId: DW, section: "Tables", label: "dim_station", value: "15 rows" },
    { itemFabricId: DW, section: "Tables", label: "dim_equipment", value: "20 rows" },
    { itemFabricId: DW, section: "Tables", label: "fact_rentals", value: "900 rows" },
    { itemFabricId: DW, section: "General", label: "Constraints", value: "PK/FK not enforced" },
    { itemFabricId: SM, section: "General", label: "Storage mode", value: "Direct Lake" },
    { itemFabricId: SM, section: "General", label: "Datasource", value: "AzureDataLakeStorage (SSO, no gateway)" },
    { itemFabricId: SM, section: "General", label: "Tables", value: "6 (gold schema)" },
    { itemFabricId: SM, section: "Measures", label: "Total Rentals", value: "11,936" },
    { itemFabricId: SM, section: "Measures", label: "Total Revenue", value: "CHF 533,821.21" },
    { itemFabricId: SM, section: "Measures", label: "Avg Rental Duration", value: "19.7 h" },
    { itemFabricId: SM, section: "Measures", label: "Revenue MoM %", value: "-8.1% … +6.1% (Dec → Jun)" },
    { itemFabricId: RP_EXEC, section: "General", label: "Pages", value: "1" },
    { itemFabricId: RP_EXEC, section: "General", label: "Visuals", value: "6" },
    { itemFabricId: RP_EXEC, section: "Binding", label: "Semantic model", value: "AlpineRent Sales Model" },
    { itemFabricId: KQL_EVENTS, section: "Tables", label: "StationTelemetry", value: "telemetry stream" },
    { itemFabricId: KQL_EVENTS, section: "Tables", label: "BikeEvents", value: "GPS + status" },
    { itemFabricId: KQL_EVENTS, section: "Tables", label: "LiftRideEvents", value: "lift ridership" },
    { itemFabricId: KQL_EVENTS, section: "Functions", label: "StationHourlyLoad()", value: "KQL function" },
    { itemFabricId: PL, section: "General", label: "Activities", value: "4 (Bronze, Silver, Gold, Forecast)" },
    { itemFabricId: PL, section: "Schedule", label: "Trigger", value: "Manual" },
  ],
  comments: [
    { id: "c1", authorId: "u-admin", authorName: OWNER, authorEmail: OWNER_EMAIL, body: "First Atlas sync done — 14 items across 9 types, zero failures. Gold layer has 210 daily rows.", createdAt: iso(6) },
    { id: "c2", itemFabricId: SM, authorId: "u-admin", authorName: OWNER, authorEmail: OWNER_EMAIL, body: "Direct Lake model validated live: Total Revenue CHF 533,821, 11,936 rentals, avg 19.7 h.", createdAt: iso(5) },
  ],
  syncRuns: [
    { id: "s1", startedAt: iso(7), finishedAt: iso(6), status: "completed", itemsSynced: 14, triggeredBy: OWNER, summary: "14 items · 14 lineage edges · 1 principal · 6 jobs" },
  ],
  schema: MODEL_SCHEMA,
};
