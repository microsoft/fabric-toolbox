import {
  AudienceType,
  type RayfinContext,
} from "@microsoft/fabric-user-data-functions";
import type { AtlasSchema } from "../../data/schema.js";
import {
  ExecutionDeadline,
  FABRIC_REST_DEFAULTS,
  FabricRestClient,
  FabricRestError,
  RequestBudget,
  fabricSafeErrorCode,
  type FabricSafeErrorCode,
} from "./fabric-rest.js";
import {
  SQL_CATALOG_QUERIES,
  SqlCatalogShapeError,
  SqlCoordinateError,
  SqlDriverError,
  classifySqlError,
  createMssqlCatalogDriver,
  hasControlCharacter,
  projectSqlForeignKeys,
  projectSqlObjects,
  projectSqlPrimaryKeys,
  projectSqlSchemaNames,
  safeIdentifier,
  sqlCatalogParameters,
  trustedSqlDatabaseName,
  trustedSqlHost,
  type SqlCatalogDriver,
  type SqlCatalogObject,
  type SqlCatalogQueryName,
  type SqlCatalogSession,
  type SqlConnectionTarget,
  type SqlDriverErrorCode,
  type SqlEndpointKind,
  type SqlForeignKey,
  type SqlPrimaryKey,
  type SqlQueryResult,
} from "./sql-catalog.js";
import { requireAtlasSynchronizer } from "./synchronizer-gate.js";
import { strictUuid } from "./sync/protocol.js";

/*
 * Read-only, non-authoritative SQL metadata stage for Fabric SQL Database,
 * Warehouse and Lakehouse SQL analytics endpoints. Connection coordinates come
 * only from documented Fabric REST item routes (AudienceType.Fabric); catalog
 * structure comes from fixed, parameterized `sys.*` queries over TDS
 * (AudienceType.Sql). No table rows, module definitions, credentials or
 * connection strings are ever read into the result.
 */

/** Documented Fabric REST item routes and the SQL endpoint each one exposes. */
export const SQL_PROPERTY_ROUTES: ReadonlyMap<string, { route: string; kind: SqlEndpointKind }> = new Map([
  ["SQLDatabase", { route: "sqlDatabases", kind: "sql-database" }],
  ["Warehouse", { route: "warehouses", kind: "warehouse" }],
  ["Lakehouse", { route: "lakehouses", kind: "lakehouse-sql-endpoint" }],
  ["MirroredDatabase", {
    route: "mirroredDatabases",
    kind: "mirrored-database-sql-endpoint",
  }],
]);

/**
 * SQL analytics endpoint items are collected through their parent Lakehouse,
 * whose documented coordinates route TDS by the parent item GUID.
 */
export const SQL_ITEMS_VIA_PARENT: ReadonlySet<string> = new Set(["SQLEndpoint"]);

export const COLLECT_SQL_METADATA_LIMITS = {
  ...FABRIC_REST_DEFAULTS,
  // Leaves headroom below the 200-240 second Fabric Functions execution limit.
  executionBudgetMs: 150_000,
  maxItems: 8,
  maxRequests: 32,
  maxLakehousePages: 100,
  maxLakehouseRecords: 50_000,
  minItemStartMs: 20_000,
  sqlConnectTimeoutMs: 15_000,
  sqlQueryTimeoutMs: 20_000,
  maxSqlConnectAttempts: 2,
  maxSqlRetryDelayMs: 4_000,
  // Connection attempts plus catalog queries across the batch.
  maxSqlOperations: 48,
  maxSchemaRows: 1_000,
  maxCatalogRows: 50_000,
  maxKeyRows: 5_000,
  maxQueryBytes: 8 * 1024 * 1024,
  maxObjectsPerItem: 50_000,
  maxColumnsPerObject: 1_024,
  // Projected schema tables and Config facts across the batch.
  maxSchemaBytes: 16 * 1024 * 1024,
  maxErrors: 50,
  // Hard final guard below the 30 MiB Functions response limit.
  maxEnvelopeBytes: 24 * 1024 * 1024,
} as const;

export type CollectSqlMetadataLimits = {
  [Name in keyof typeof COLLECT_SQL_METADATA_LIMITS]: number;
};

export interface CollectSqlMetadataDependencies {
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  signal?: AbortSignal;
  limits?: Partial<CollectSqlMetadataLimits>;
  sqlDriver?: SqlCatalogDriver;
}

export type SqlMetadataItemInput = { id: string; type: string };
// A named alias keeps the SDK from coercing or echoing the raw input; the strict validator owns it.
export type SqlMetadataItemsInput = SqlMetadataItemInput[];

export interface CollectSqlMetadataRequest {
  workspaceId: string;
  correlationId: string | null;
  items: SqlMetadataItemInput[];
}

export interface SqlMetadataTokens {
  fabric: string;
  /** Absent when the declared SQL audience was not minted; schemas are then unsupported. */
  sql?: string;
}

export type SqlMetadataStatusCode =
  | FabricSafeErrorCode
  | Exclude<SqlDriverErrorCode, "sql-transient">
  | "item-type-unsupported"
  | "parent-item-required"
  | "not-attempted"
  | "token-unavailable"
  | "invalid-connection-coordinates"
  | "sql-endpoint-unavailable"
  | "sql-endpoint-not-provisioned"
  | "sql-operation-budget-exhausted"
  | "projection-truncated"
  | "partial-unsupported"
  | "not-applicable";

export type SqlMetadataStatus = {
  status: "complete" | "unsupported" | "failed";
  code?: SqlMetadataStatusCode;
};

export type SqlCatalogSource =
  | "fabric-sql-database-catalog"
  | "fabric-warehouse-catalog"
  | "fabric-lakehouse-sql-endpoint-catalog"
  | "fabric-mirrored-database-sql-endpoint-catalog"
  | "fabric-lakehouse-tables-rest"
  | "fabric-lakehouse-rest-and-sql-catalog";

/** Structural catalog evidence per SQL-capable item; objects live in `schema`. */
export type SqlCatalogEvidence = {
  status: "complete" | "unsupported" | "failed";
  code?: SqlMetadataStatusCode;
  source?: SqlCatalogSource;
  /** User schema names, including empty schemas. */
  schemas?: string[];
  tables?: number;
  views?: number;
  columns?: number;
  primaryKeys?: number;
  foreignKeys?: number;
  /** Schema-name and key-constraint queries; a failure keeps the object inventory. */
  structure?: SqlMetadataStatus;
  /** Direct Lakehouse table inventory from the documented Fabric REST API. */
  lakehouseTables?: SqlMetadataStatus;
  /** A collection limit was reached; the projection is incomplete. */
  truncated?: true;
  /** Catalog names that were not safe to render and were skipped. */
  rejectedNames?: number;
};

/** The reviewed Atlas schema-table contract (`RawSync.schema`). */
export type SqlSchemaTable = {
  name: string;
  objectType: string;
  source: string;
  columns: { name: string; dataType: string }[];
  measures: never[];
};

export type SqlItemEvidence = {
  id: string;
  type: string;
  status: "complete" | "unsupported" | "failed";
  code?: SqlMetadataStatusCode;
  endpointKind?: SqlEndpointKind;
  /** Lakehouse SQL analytics endpoint item ID from the parent Lakehouse properties. */
  sqlEndpointId?: string;
};

export type SqlConfigEntry = {
  itemId: string;
  section: string;
  label: string;
  value: string;
};

export interface SqlMetadataStageEnvelope {
  contractVersion: 1;
  stage: "sql-metadata";
  /** This stage can never authorize snapshot publication. */
  authoritative: false;
  /** Present only when the caller supplied a correlation UUID. */
  correlationId?: string;
  workspaceId: string;
  items: SqlItemEvidence[];
  /** Catalog evidence for every requested SQL-capable item, keyed by item ID. */
  catalogs: Record<string, SqlCatalogEvidence>;
  /** Atlas schema tables for complete catalogs, keyed by item ID. */
  schema: Record<string, SqlSchemaTable[]>;
  /** SQL catalogs have no reviewed artifact-metadata kind; the Python collector emits none either. */
  artifactMetadata: Record<string, never>;
  config: SqlConfigEntry[];
  sections: { sqlProperties: SqlMetadataStatus; sqlSchema: SqlMetadataStatus };
  capabilities: { sqlSchema: SqlMetadataStatus };
  errors: string[];
  syncedAt: string;
}

const INVALID_INPUT_MESSAGE =
  "Use protocolVersion 1, a strict workspace UUID, 1-8 unique {id, type} items and a strict correlation UUID or null.";
const AUTHORIZATION_MESSAGE =
  "SQL metadata collection requires the configured Atlas administrator.";
const TOKEN_UNAVAILABLE_MESSAGE = "The Fabric application token was unavailable.";
const RESPONSE_TOO_LARGE_MESSAGE =
  "SQL metadata collection exceeded the safe response size.";
const ITEM_TYPE = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
// Fabric item references are GUIDs that are not always RFC-variant UUIDs.
const HEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d{1,7})?(Z|[+-]\d{2}:\d{2})?$/;
const COLLATION = /^[A-Za-z0-9_]{1,128}$/;
const PROVISIONING_STATUS = /^[A-Za-z]{1,32}$/;
const MAX_TOKEN_LENGTH = 65_536;
const MAX_BACKUP_RETENTION_DAYS = 36_500;
// Reserve for closing the TDS session and projecting after the last SQL call.
const SQL_RESERVE_MS = 1_000;
const SUCCESS_PROVISIONING = "Success";

const CATALOG_SOURCES: Readonly<Record<SqlEndpointKind, SqlCatalogSource>> = {
  "sql-database": "fabric-sql-database-catalog",
  warehouse: "fabric-warehouse-catalog",
  "lakehouse-sql-endpoint": "fabric-lakehouse-sql-endpoint-catalog",
  "mirrored-database-sql-endpoint":
    "fabric-mirrored-database-sql-endpoint-catalog",
};

/** Atlas `source` labels; the SQL Database label matches the Python collector. */
const SCHEMA_SOURCES: Readonly<Record<SqlEndpointKind, string>> = {
  "sql-database": "Fabric SQL system catalog",
  warehouse: "Fabric Warehouse system catalog",
  "lakehouse-sql-endpoint": "Fabric SQL analytics endpoint system catalog",
  "mirrored-database-sql-endpoint":
    "Fabric mirrored database SQL endpoint system catalog",
};

const OBJECT_TYPES: Readonly<Record<SqlEndpointKind, { table: SqlSchemaTable["objectType"]; view: SqlSchemaTable["objectType"] }>> = {
  "sql-database": { table: "SQL table", view: "SQL view" },
  warehouse: { table: "SQL table", view: "SQL view" },
  "lakehouse-sql-endpoint": { table: "SQL endpoint table", view: "SQL endpoint view" },
  "mirrored-database-sql-endpoint": {
    table: "SQL endpoint table",
    view: "SQL endpoint view",
  },
};

const SCHEMA_UNSUPPORTED_CODES = new Set<SqlMetadataStatusCode>([
  "endpoint-unsupported",
  "token-unavailable",
  "tds-runtime-unavailable",
  "authorization-failed",
  "sql-endpoint-unavailable",
  "sql-endpoint-not-provisioned",
]);

// Fabric REST stops shared with the other collector stages.
const PROPERTY_STOP_CODES = new Set<SqlMetadataStatusCode>([
  "deadline-exhausted",
  "request-timeout",
  "retry-after-deferred",
  "rate-limited",
  "request-budget-exhausted",
  "cancelled",
]);

// SQL stops: later items would hit the same deadline, throttle, budget or cancellation.
const SQL_STOP_CODES = new Set<SqlMetadataStatusCode>([
  "deadline-exhausted",
  "sql-throttled",
  "sql-operation-budget-exhausted",
  "cancelled",
]);

class SqlStageFailure extends Error {
  constructor(readonly code: SqlMetadataStatusCode) {
    super(`SQL metadata stage failed (${code}).`);
    this.name = "SqlStageFailure";
  }
}

function invalid(): never {
  throw new FabricRestError("invalid-response");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function validateCollectSqlMetadataInput(
  protocolVersion: unknown,
  workspaceId: unknown,
  items: unknown,
  correlationId: unknown,
): CollectSqlMetadataRequest {
  try {
    if (
      protocolVersion !== 1 ||
      !Array.isArray(items) ||
      items.length < 1 ||
      items.length > COLLECT_SQL_METADATA_LIMITS.maxItems
    ) {
      throw new Error();
    }
    const seen = new Set<string>();
    const batch = items.map((item: unknown) => {
      if (!isPlainObject(item)) throw new Error();
      const keys = Object.keys(item).sort();
      if (keys.length !== 2 || keys[0] !== "id" || keys[1] !== "type") throw new Error();
      const id = strictUuid(item.id);
      if (typeof item.type !== "string" || !ITEM_TYPE.test(item.type) || seen.has(id)) {
        throw new Error();
      }
      seen.add(id);
      return { id, type: item.type };
    });
    return {
      workspaceId: strictUuid(workspaceId),
      correlationId: correlationId == null ? null : strictUuid(correlationId),
      items: batch,
    };
  } catch {
    throw new Error(INVALID_INPUT_MESSAGE);
  }
}

function hexUuid(value: unknown): string {
  return typeof value === "string" && HEX_UUID.test(value) ? value.toLowerCase() : invalid();
}

function optionalPattern(value: unknown, pattern: RegExp): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") invalid();
  const text = value.trim();
  if (!text) return undefined;
  return pattern.test(text) ? text : invalid();
}

/** Python `_normalize_timestamp`: UTC ISO-8601 with milliseconds; offset-less values are UTC. */
function optionalTimestamp(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") invalid();
  const text = value.trim();
  if (!text) return undefined;
  const match = ISO_TIMESTAMP.exec(text);
  if (!match) invalid();
  const parsed = new Date(`${match[1]}${(match[2] ?? "").slice(0, 4)}${match[3] ?? "Z"}`);
  return Number.isNaN(parsed.getTime()) ? invalid() : parsed.toISOString();
}

function optionalRetentionDays(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > MAX_BACKUP_RETENTION_DAYS) {
    invalid();
  }
  return String(value);
}

function itemProperties(
  value: unknown,
  request: CollectSqlMetadataRequest,
  item: SqlMetadataItemInput,
): Record<string, unknown> {
  if (!isRecord(value)) invalid();
  if (
    hexUuid(value.id) !== item.id ||
    value.type !== item.type ||
    (value.workspaceId != null && hexUuid(value.workspaceId) !== request.workspaceId)
  ) {
    invalid();
  }
  if (value.properties == null) return {};
  return isRecord(value.properties) ? value.properties : invalid();
}

export interface SqlPropertyProjection {
  config: SqlConfigEntry[];
  /** Trusted connection target, or a fixed reason why no catalog query is attempted. */
  target?: SqlConnectionTarget;
  blocked?: SqlMetadataStatus;
  sqlEndpointId?: string;
}

function coordinates(build: () => SqlConnectionTarget): Pick<SqlPropertyProjection, "target" | "blocked"> {
  try {
    return { target: build() };
  } catch (error) {
    if (error instanceof SqlCoordinateError) {
      return { blocked: { status: "failed", code: "invalid-connection-coordinates" } };
    }
    throw error;
  }
}

/**
 * Projects only the item properties the Python collector already shows and
 * derives a trusted TDS target. Connection strings are read for their host
 * only and are never returned; unknown properties are ignored.
 */
export function projectSqlItemProperties(
  value: unknown,
  request: CollectSqlMetadataRequest,
  item: SqlMetadataItemInput,
  kind: SqlEndpointKind,
): SqlPropertyProjection {
  const properties = itemProperties(value, request, item);
  const rows: SqlConfigEntry[] = [];
  const add = (section: string, label: string, rowValue: string | undefined) => {
    if (rowValue) rows.push({ itemId: item.id, section, label, value: rowValue });
  };

  if (kind === "sql-database") {
    const collation = optionalPattern(properties.collation, COLLATION);
    const retention = optionalRetentionDays(properties.backupRetentionDays);
    const resolved = coordinates(() => ({
      kind,
      server: trustedSqlHost(properties.serverFqdn, kind),
      port: 1433,
      database: trustedSqlDatabaseName(properties.databaseName),
      readOnlyIntent: true,
    }));
    add("SQL database", "Database name", resolved.target?.database);
    add("SQL database", "Server", resolved.target ? `${resolved.target.server},1433` : undefined);
    add("SQL database", "Collation", collation);
    add("SQL database", "Backup retention days", retention);
    return { config: rows, ...resolved };
  }

  if (kind === "warehouse") {
    const collation = optionalPattern(properties.collationType, COLLATION);
    const created = optionalTimestamp(properties.createdDate);
    const updated = optionalTimestamp(properties.lastUpdatedTime);
    add("Warehouse", "Collation", collation);
    add("Warehouse", "Created", created);
    add("Warehouse", "Updated", updated);
    const resolved = coordinates(() => ({
      kind,
      server: trustedSqlHost(properties.connectionString, kind),
      port: 1433,
      // Fabric routes Warehouse TDS sessions by item GUID.
      database: item.id,
      readOnlyIntent: false,
    }));
    return { config: rows, ...resolved };
  }

  const endpoint = properties.sqlEndpointProperties;
  if (endpoint == null) {
    return { config: rows, blocked: { status: "unsupported", code: "sql-endpoint-unavailable" } };
  }
  if (!isRecord(endpoint)) invalid();
  const sqlEndpointId = endpoint.id == null ? undefined : hexUuid(endpoint.id);
  const provisioning = optionalPattern(endpoint.provisioningStatus, PROVISIONING_STATUS);
  add("SQL endpoint", "Item ID", sqlEndpointId);
  add("SQL endpoint", "Provisioning status", provisioning);
  if (provisioning !== undefined && provisioning !== SUCCESS_PROVISIONING) {
    return { config: rows, sqlEndpointId, blocked: { status: "unsupported", code: "sql-endpoint-not-provisioned" } };
  }
  const resolved = coordinates(() => ({
    kind,
    server: trustedSqlHost(endpoint.connectionString, kind),
    port: 1433,
    // Fabric routes Lakehouse TDS sessions by the SQL analytics endpoint GUID.
    database: trustedSqlDatabaseName(sqlEndpointId),
    readOnlyIntent: false,
  }));
  return { config: rows, sqlEndpointId, ...resolved };
}

/** Python `_qualified_object_name`. */
function qualifiedName(schema: string, name: string): string {
  return name.toLowerCase().startsWith(`${schema.toLowerCase()}.`) ? name : `${schema}.${name}`;
}

export function sqlSchemaTables(kind: SqlEndpointKind, objects: readonly SqlCatalogObject[]): SqlSchemaTable[] {
  const types = OBJECT_TYPES[kind];
  return objects.map((object) => ({
    name: qualifiedName(object.schema, object.name),
    objectType: object.kind === "table" ? types.table : types.view,
    source: SCHEMA_SOURCES[kind],
    columns: object.columns.map((column) => ({ name: column.name, dataType: column.dataType })),
    measures: [],
  }));
}

type LakehouseRestCollection = {
  evidence: SqlMetadataStatus;
  tables?: SqlSchemaTable[];
  schemas?: string[];
  truncated?: true;
  rejectedNames?: number;
};

/** Python `_table_records`: flatten legacy lists and schema-enabled table trees. */
function lakehouseTableRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(lakehouseTableRecords);
  if (!isRecord(value)) return [];
  const nested = ["data", "value", "tables"].flatMap((key) =>
    Array.isArray(value[key]) ? lakehouseTableRecords(value[key]) : [],
  );
  if (nested.length) return nested;
  return value.name && ("columns" in value || "type" in value || "format" in value) ? [value] : [];
}

function lakehouseRestTables(
  values: readonly unknown[],
  limits: CollectSqlMetadataLimits,
): Omit<LakehouseRestCollection, "evidence"> {
  const tables: SqlSchemaTable[] = [];
  const schemas = new Set<string>();
  let truncated = false;
  let rejectedNames = 0;
  for (const value of lakehouseTableRecords(values)) {
    const name = safeIdentifier(value.name);
    const schemaName = safeIdentifier(value.schema ?? value.schemaName ?? value.schema_name);
    if (!name) {
      rejectedNames += 1;
      continue;
    }
    if (tables.length >= limits.maxObjectsPerItem) {
      truncated = true;
      continue;
    }
    if (schemaName) schemas.add(schemaName);
    const columns: SqlSchemaTable["columns"] = [];
    if (Array.isArray(value.columns)) {
      for (const columnValue of value.columns) {
        if (!isRecord(columnValue)) continue;
        const columnName = safeIdentifier(columnValue.name);
        if (!columnName) {
          rejectedNames += 1;
          continue;
        }
        if (columns.length >= limits.maxColumnsPerObject) {
          truncated = true;
          continue;
        }
        columns.push({
          name: columnName,
          dataType: safeIdentifier(columnValue.dataType ?? columnValue.type) ?? "column",
        });
      }
    }
    tables.push({
      name: schemaName ? qualifiedName(schemaName, name) : name,
      objectType: safeIdentifier(value.objectType ?? value.type) ?? "Table",
      source: "Fabric Lakehouse Tables REST",
      columns,
      measures: [],
    });
  }
  return {
    tables,
    schemas: [...schemas],
    ...(truncated ? { truncated: true as const } : {}),
    ...(rejectedNames ? { rejectedNames } : {}),
  };
}

function mergeLakehouseTables(
  restTables: readonly SqlSchemaTable[],
  sqlTables: readonly SqlSchemaTable[],
): SqlSchemaTable[] {
  const merged = new Map<string, SqlSchemaTable>();
  for (const table of [...restTables, ...sqlTables]) {
    const key = table.name.trim().toLocaleLowerCase();
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, table);
      continue;
    }
    const columns = new Map(previous.columns.map((column) => [column.name.toLocaleLowerCase(), column]));
    for (const column of table.columns) {
      columns.set(column.name.toLocaleLowerCase(), { ...columns.get(column.name.toLocaleLowerCase()), ...column });
    }
    merged.set(key, { ...previous, ...table, columns: [...columns.values()] });
  }
  return [...merged.values()];
}

/** Python `_sql_catalog_projection` facts as Config rows. */
export function sqlKeyConfig(itemId: string, primaryKeys: readonly SqlPrimaryKey[], foreignKeys: readonly SqlForeignKey[]): SqlConfigEntry[] {
  return [
    ...primaryKeys.map((key) => ({
      itemId,
      section: "SQL Primary keys",
      label: `${key.schema}.${key.table}`,
      value: `${key.name}: ${key.columns.join(", ")}`,
    })),
    ...foreignKeys.map((key) => ({
      itemId,
      section: "SQL Foreign keys",
      label: key.name,
      value:
        `${key.sourceSchema}.${key.sourceTable}(${key.sourceColumns.join(", ")}) -> ` +
        `${key.targetSchema}.${key.targetTable}(${key.targetColumns.join(", ")})`,
    })),
  ];
}

interface Tracker {
  success: number;
  unsupported: number;
  failed: number;
  codes: SqlMetadataStatusCode[];
}

function track(tracker: Tracker, result: "success" | "unsupported" | "failed", code?: SqlMetadataStatusCode): void {
  tracker[result] += 1;
  if (code && !tracker.codes.includes(code)) tracker.codes.push(code);
}

/** Python `_finish_optional_section`. */
function finishSection(tracker: Tracker): SqlMetadataStatus {
  if (tracker.failed) return { status: "failed", code: tracker.codes[0] ?? "upstream-failure" };
  if (tracker.success) {
    const code = tracker.unsupported ? "partial-unsupported" : tracker.codes[0];
    return code ? { status: "complete", code } : { status: "complete" };
  }
  if (tracker.unsupported) {
    return { status: "unsupported", code: tracker.codes[0] ?? "endpoint-unsupported" };
  }
  return { status: "unsupported", code: "not-applicable" };
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function usableToken(value: unknown): string | undefined {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_TOKEN_LENGTH &&
    !/\s/.test(value) &&
    !hasControlCharacter(value)
    ? value
    : undefined;
}

function sqlStatusCode(code: SqlDriverErrorCode): SqlMetadataStatusCode {
  return code === "sql-transient" ? "sql-connection-failed" : code;
}

/** Collects bounded SQL catalog metadata; one item failure never invalidates another. */
export async function collectWorkspaceSqlMetadata(
  tokens: SqlMetadataTokens,
  request: CollectSqlMetadataRequest,
  dependencies: CollectSqlMetadataDependencies = {},
): Promise<SqlMetadataStageEnvelope> {
  const fabricToken = usableToken(tokens.fabric);
  if (!fabricToken) throw new Error(TOKEN_UNAVAILABLE_MESSAGE);
  const sqlToken = usableToken(tokens.sql);
  const limits: CollectSqlMetadataLimits = { ...COLLECT_SQL_METADATA_LIMITS, ...dependencies.limits };
  const now = dependencies.now;
  const deadline = new ExecutionDeadline(limits.executionBudgetMs, now);
  const signal = dependencies.signal;
  const sleep =
    dependencies.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const client = new FabricRestClient(fabricToken, {
    deadline,
    fetch: dependencies.fetch,
    sleep,
    signal,
    requestTimeoutMs: limits.requestTimeoutMs,
    maxAttempts: limits.maxAttempts,
    maxRetryAfterMs: limits.maxRetryAfterMs,
    maxResponseBytes: limits.maxResponseBytes,
  });
  const budget = new RequestBudget(limits.maxRequests);
  let sqlDriver = dependencies.sqlDriver;
  let sqlOperations = 0;
  const tracker: Tracker = { success: 0, unsupported: 0, failed: 0, codes: [] };
  const schemaTracker: Tracker = { success: 0, unsupported: 0, failed: 0, codes: [] };
  const errors: string[] = [];
  const addError = (entry: string) => {
    if (errors.length < limits.maxErrors && !errors.includes(entry)) errors.push(entry);
  };
  const items: SqlItemEvidence[] = [];
  const config: SqlConfigEntry[] = [];
  const catalogs: Record<string, SqlCatalogEvidence> = {};
  const schema: Record<string, SqlSchemaTable[]> = {};
  let stopCode: SqlMetadataStatusCode | undefined;
  // Set once the TDS runtime cannot load; it cannot recover inside this invocation.
  let runtimeUnavailable = false;
  let usedSchemaBytes = 0;

  const preStop = (section: "sqlProperties" | "sqlSchema", target: Tracker, needsRequest: boolean): void => {
    if (stopCode) return;
    let code: SqlMetadataStatusCode | undefined;
    if (signal?.aborted) code = "cancelled";
    else if (deadline.remaining() <= limits.minItemStartMs) code = "deadline-exhausted";
    else if (needsRequest && budget.remaining === 0) code = "request-budget-exhausted";
    else if (!needsRequest && sqlOperations >= limits.maxSqlOperations) code = "sql-operation-budget-exhausted";
    if (code) {
      stopCode = code;
      track(target, "failed", code);
      addError(`${section}: ${code}`);
    }
  };

  const sqlTimeout = (configured: number): number => {
    if (signal?.aborted) throw new SqlStageFailure("cancelled");
    const remaining = deadline.remaining() - SQL_RESERVE_MS;
    if (remaining <= 0) throw new SqlStageFailure("deadline-exhausted");
    return Math.min(configured, remaining);
  };

  const takeSqlOperation = (): void => {
    if (sqlOperations >= limits.maxSqlOperations) throw new SqlStageFailure("sql-operation-budget-exhausted");
    sqlOperations += 1;
  };

  const connect = async (target: SqlConnectionTarget, token: string): Promise<SqlCatalogSession> => {
    sqlDriver ??= createMssqlCatalogDriver();
    for (let attempt = 0; ; attempt += 1) {
      takeSqlOperation();
      const timeoutMs = sqlTimeout(limits.sqlConnectTimeoutMs);
      try {
        return await sqlDriver.connect(target, token, {
          timeoutMs,
          requestTimeoutMs: limits.sqlQueryTimeoutMs,
          signal,
        });
      } catch (error) {
        const code = classifySqlError(error, "connect");
        if (code !== "sql-transient" || attempt + 1 >= limits.maxSqlConnectAttempts) {
          throw new SqlDriverError(code === "sql-transient" ? "sql-connection-failed" : code);
        }
        const delay = Math.min(limits.maxSqlRetryDelayMs, 1_000 * 2 ** attempt);
        if (delay >= deadline.remaining() - SQL_RESERVE_MS) throw new SqlStageFailure("deadline-exhausted");
        await sleep(delay);
        if (signal?.aborted) throw new SqlStageFailure("cancelled");
      }
    }
  };

  const runQuery = async (
    session: SqlCatalogSession,
    name: SqlCatalogQueryName,
    maxRows: number,
  ): Promise<SqlQueryResult> => {
    takeSqlOperation();
    const timeoutMs = sqlTimeout(limits.sqlQueryTimeoutMs);
    try {
      const result = await session.query(SQL_CATALOG_QUERIES[name], sqlCatalogParameters(name, maxRows), {
        timeoutMs,
        maxRows,
        maxBytes: limits.maxQueryBytes,
        signal,
      });
      if (!isRecord(result) || !Array.isArray(result.rows) || typeof result.truncated !== "boolean") {
        throw new SqlCatalogShapeError();
      }
      return result;
    } catch (error) {
      if (error instanceof SqlCatalogShapeError || error instanceof SqlStageFailure) throw error;
      throw new SqlDriverError(classifySqlError(error, "query"));
    }
  };

  const failureCode = (error: unknown, phase: "connect" | "query"): SqlMetadataStatusCode => {
    if (error instanceof SqlStageFailure) return error.code;
    if (error instanceof SqlCatalogShapeError) return "invalid-response";
    return sqlStatusCode(classifySqlError(error, phase));
  };

  const collectLakehouseRest = async (
    item: SqlMetadataItemInput,
  ): Promise<LakehouseRestCollection> => {
    let code: SqlMetadataStatusCode | undefined;
    if (signal?.aborted) code = "cancelled";
    else if (deadline.remaining() <= limits.minItemStartMs) code = "deadline-exhausted";
    else if (budget.remaining === 0) code = "request-budget-exhausted";
    if (code) {
      stopCode ??= code;
      addError(`lakehouseTables:${item.id}: ${code}`);
      return { evidence: { status: "failed", code } };
    }
    try {
      const pages = await client.getPaged(
        `/v1/workspaces/${request.workspaceId}/lakehouses/${item.id}/tables`,
        {
          query: { maxResults: 100 },
          maxPages: limits.maxLakehousePages,
          maxResponseBytes: limits.maxResponseBytes,
        },
        budget,
      );
      const values: unknown[] = [];
      for (const page of pages) {
        if (!Array.isArray(page.data)) throw new FabricRestError("invalid-response");
        if (values.length + page.data.length > limits.maxLakehouseRecords) {
          throw new FabricRestError("record-limit-exceeded");
        }
        values.push(...page.data);
      }
      const projection = lakehouseRestTables(values, limits);
      const projectionCode: SqlMetadataStatusCode | undefined =
        projection.truncated ? "projection-truncated" :
          projection.rejectedNames ? "partial-unsupported" : undefined;
      return {
        evidence: { status: "complete", ...(projectionCode ? { code: projectionCode } : {}) },
        ...projection,
      };
    } catch (error) {
      const failure = fabricSafeErrorCode(error, true);
      const unsupported = failure === "endpoint-unsupported";
      if (!unsupported) addError(`lakehouseTables:${item.id}: ${failure}`);
      if (PROPERTY_STOP_CODES.has(failure)) stopCode ??= failure;
      return { evidence: { status: unsupported ? "unsupported" : "failed", code: failure } };
    }
  };

  const collectCatalog = async (
    item: SqlMetadataItemInput,
    kind: SqlEndpointKind,
    target: SqlConnectionTarget,
    token: string,
    trackOutcome: boolean,
  ): Promise<{ evidence: SqlCatalogEvidence; tables?: SqlSchemaTable[]; facts?: SqlConfigEntry[] }> => {
    let session: SqlCatalogSession;
    try {
      session = await connect(target, token);
    } catch (error) {
      const code = failureCode(error, "connect");
      if (code === "tds-runtime-unavailable") runtimeUnavailable = true;
      throw new SqlStageFailure(code);
    }
    try {
      const objectRows = await runQuery(session, "objects", limits.maxCatalogRows);
      const objects = projectSqlObjects(objectRows.rows, objectRows.truncated, limits);
      let truncated = objects.truncated;
      let rejectedNames = objects.rejectedNames;
      let structure: SqlMetadataStatus = { status: "complete" };
      let schemaNames: string[] = [];
      let primaryKeys: SqlPrimaryKey[] = [];
      let foreignKeys: SqlForeignKey[] = [];
      for (const name of ["schemas", "primaryKeys", "foreignKeys"] as const) {
        if (structure.status !== "complete") break;
        try {
          if (name === "schemas") {
            const result = await runQuery(session, name, limits.maxSchemaRows);
            const projected = projectSqlSchemaNames(result.rows, limits.maxSchemaRows);
            schemaNames = projected.schemas;
            truncated ||= result.truncated || projected.truncated;
            rejectedNames += projected.rejectedNames;
          } else if (name === "primaryKeys") {
            const result = await runQuery(session, name, limits.maxKeyRows);
            const projected = projectSqlPrimaryKeys(result.rows, result.truncated);
            primaryKeys = projected.primaryKeys;
            truncated ||= result.truncated;
            rejectedNames += projected.rejectedNames;
          } else {
            const result = await runQuery(session, name, limits.maxKeyRows);
            const projected = projectSqlForeignKeys(result.rows, result.truncated);
            foreignKeys = projected.foreignKeys;
            truncated ||= result.truncated;
            rejectedNames += projected.rejectedNames;
          }
        } catch (error) {
          const code = failureCode(error, "query");
          // The object inventory stays valid; a stop still ends the batch afterwards.
          structure = { status: SCHEMA_UNSUPPORTED_CODES.has(code) ? "unsupported" : "failed", code };
          if (structure.status === "failed") addError(`sqlStructure:${item.id}: ${code}`);
          if (SQL_STOP_CODES.has(code) && !stopCode) {
            // Record the stop before this item's success so the section names the real cause.
            stopCode = code;
            if (trackOutcome) track(schemaTracker, "failed", code);
          }
        }
      }
      const tables = sqlSchemaTables(kind, objects.objects);
      const code: SqlMetadataStatusCode | undefined =
        structure.status !== "complete" || rejectedNames ? "partial-unsupported" : truncated ? "projection-truncated" : undefined;
      const evidence: SqlCatalogEvidence = {
        status: "complete",
        ...(code ? { code } : {}),
        source: CATALOG_SOURCES[kind],
        schemas: schemaNames,
        tables: objects.objects.filter((object) => object.kind === "table").length,
        views: objects.objects.filter((object) => object.kind === "view").length,
        columns: objects.objects.reduce((total, object) => total + object.columns.length, 0),
        primaryKeys: primaryKeys.length,
        foreignKeys: foreignKeys.length,
        structure,
        ...(truncated ? { truncated: true as const } : {}),
        ...(rejectedNames ? { rejectedNames } : {}),
      };
      return { evidence, tables, facts: sqlKeyConfig(item.id, primaryKeys, foreignKeys) };
    } finally {
      try {
        await session.close();
      } catch {
        // Session cleanup cannot change the projected catalog or leak driver details.
      }
    }
  };

  const collectSchema = async (
    item: SqlMetadataItemInput,
    kind: SqlEndpointKind,
    projection: SqlPropertyProjection,
    trackOutcome = true,
  ): Promise<{ evidence: SqlCatalogEvidence; tables?: SqlSchemaTable[]; facts?: SqlConfigEntry[] }> => {
    const settle = (status: SqlMetadataStatus): { evidence: SqlCatalogEvidence } => {
      const result = status.status === "unsupported" ? "unsupported" : "failed";
      if (trackOutcome) track(schemaTracker, result, status.code);
      if (result === "failed") addError(`sqlSchema:${item.id}: ${status.code}`);
      if (status.code && SQL_STOP_CODES.has(status.code)) stopCode ??= status.code;
      return { evidence: { status: result, ...(status.code ? { code: status.code } : {}) } };
    };
    if (projection.blocked) return settle(projection.blocked);
    if (!sqlToken) return settle({ status: "unsupported", code: "token-unavailable" });
    if (runtimeUnavailable) return settle({ status: "unsupported", code: "tds-runtime-unavailable" });
    preStop("sqlSchema", schemaTracker, false);
    if (stopCode) {
      if (trackOutcome) track(schemaTracker, "failed", "not-attempted");
      return { evidence: { status: "failed", code: "not-attempted" } };
    }
    try {
      const collected = await collectCatalog(item, kind, projection.target!, sqlToken, trackOutcome);
      const size = byteLength(collected.tables) + byteLength(collected.facts);
      if (usedSchemaBytes + size > limits.maxSchemaBytes) {
        // The aggregate schema budget is spent; later items are not attempted.
        stopCode ??= "response-size-exceeded";
        track(schemaTracker, "failed", "response-size-exceeded");
        addError(`sqlSchema:${item.id}: response-size-exceeded`);
        return { evidence: { status: "failed", code: "response-size-exceeded" } };
      }
      usedSchemaBytes += size;
      if (trackOutcome) track(schemaTracker, "success", collected.evidence.code);
      return collected;
    } catch (error) {
      const code = failureCode(error, "query");
      return settle({ status: SCHEMA_UNSUPPORTED_CODES.has(code) ? "unsupported" : "failed", code });
    }
  };

  const combineLakehouseSchema = (
    rest: LakehouseRestCollection,
    sql: { evidence: SqlCatalogEvidence; tables?: SqlSchemaTable[]; facts?: SqlConfigEntry[] },
  ): { evidence: SqlCatalogEvidence; tables?: SqlSchemaTable[]; facts?: SqlConfigEntry[] } => {
    const restComplete = rest.evidence.status === "complete";
    const sqlComplete = sql.evidence.status === "complete";
    if (restComplete || sqlComplete) {
      const tables = mergeLakehouseTables(rest.tables ?? [], sql.tables ?? []);
      const truncated = Boolean(rest.truncated || sql.evidence.truncated);
      const rejectedNames = (rest.rejectedNames ?? 0) + (sql.evidence.rejectedNames ?? 0);
      const partial =
        rest.evidence.status !== "complete" ||
        sql.evidence.status !== "complete" ||
        rest.evidence.code === "partial-unsupported" ||
        sql.evidence.code === "partial-unsupported";
      const code: SqlMetadataStatusCode | undefined =
        truncated || rest.evidence.code === "projection-truncated" || sql.evidence.code === "projection-truncated"
          ? "projection-truncated"
          : partial || rejectedNames
            ? "partial-unsupported"
            : undefined;
      const schemas = [...new Set([...(sql.evidence.schemas ?? []), ...(rest.schemas ?? [])])];
      return {
        evidence: {
          status: "complete",
          ...(code ? { code } : {}),
          source: restComplete && sqlComplete
            ? "fabric-lakehouse-rest-and-sql-catalog"
            : restComplete
              ? "fabric-lakehouse-tables-rest"
              : "fabric-lakehouse-sql-endpoint-catalog",
          schemas,
          tables: tables.filter((table) => !table.objectType.toLocaleLowerCase().includes("view")).length,
          views: tables.filter((table) => table.objectType.toLocaleLowerCase().includes("view")).length,
          columns: tables.reduce((total, table) => total + table.columns.length, 0),
          primaryKeys: sql.evidence.primaryKeys ?? 0,
          foreignKeys: sql.evidence.foreignKeys ?? 0,
          ...(sql.evidence.structure ? { structure: sql.evidence.structure } : {}),
          lakehouseTables: rest.evidence,
          ...(truncated ? { truncated: true as const } : {}),
          ...(rejectedNames ? { rejectedNames } : {}),
        },
        tables,
        facts: sql.facts,
      };
    }
    const failed = rest.evidence.status === "failed" || sql.evidence.status === "failed";
    const evidence: SqlCatalogEvidence = {
      status: failed ? "failed" : "unsupported",
      code: rest.evidence.code ?? sql.evidence.code ?? "upstream-failure",
      lakehouseTables: rest.evidence,
    };
    return { evidence };
  };

  for (const item of request.items) {
    const route = SQL_PROPERTY_ROUTES.get(item.type);
    if (!route) {
      const code = SQL_ITEMS_VIA_PARENT.has(item.type) ? "parent-item-required" : "item-type-unsupported";
      items.push({ ...item, status: "unsupported", code });
      track(tracker, "unsupported", code);
      continue;
    }
    preStop("sqlProperties", tracker, true);
    if (stopCode) {
      items.push({ ...item, status: "failed", code: "not-attempted", endpointKind: route.kind });
      track(tracker, "failed", "not-attempted");
      track(schemaTracker, "failed", "not-attempted");
      catalogs[item.id] = { status: "failed", code: "not-attempted" };
      continue;
    }
    let projection: SqlPropertyProjection;
    try {
      const response = await client.getObject(`/v1/workspaces/${request.workspaceId}/${route.route}/${item.id}`, budget);
      projection = projectSqlItemProperties(response, request, item, route.kind);
      track(tracker, "success");
    } catch (error) {
      const code = fabricSafeErrorCode(error, true);
      const unsupported = code === "endpoint-unsupported";
      items.push({ ...item, status: unsupported ? "unsupported" : "failed", code, endpointKind: route.kind });
      track(tracker, unsupported ? "unsupported" : "failed", code);
      // Without validated coordinates the catalog is never queried.
      const schemaCode: SqlMetadataStatusCode = unsupported ? code : "not-attempted";
      track(schemaTracker, unsupported ? "unsupported" : "failed", schemaCode);
      catalogs[item.id] = { status: unsupported ? "unsupported" : "failed", code: schemaCode };
      if (!unsupported) addError(`sqlProperties:${item.id}: ${code}`);
      if (PROPERTY_STOP_CODES.has(code)) stopCode ??= code;
      continue;
    }
    let collected: { evidence: SqlCatalogEvidence; tables?: SqlSchemaTable[]; facts?: SqlConfigEntry[] };
    if (route.kind === "lakehouse-sql-endpoint") {
      const sql = await collectSchema(item, route.kind, projection, false);
      const rest = await collectLakehouseRest(item);
      collected = combineLakehouseSchema(rest, sql);
      const addedBytes = Math.max(0, byteLength(collected.tables) - byteLength(sql.tables));
      if (usedSchemaBytes + addedBytes > limits.maxSchemaBytes) {
        collected = {
          evidence: {
            status: "failed",
            code: "response-size-exceeded",
            lakehouseTables: rest.evidence,
          },
        };
        stopCode ??= "response-size-exceeded";
        addError(`sqlSchema:${item.id}: response-size-exceeded`);
      } else {
        usedSchemaBytes += addedBytes;
      }
      const outcome = collected.evidence.status === "complete"
        ? "success"
        : collected.evidence.status === "unsupported"
          ? "unsupported"
          : "failed";
      track(schemaTracker, outcome, collected.evidence.code);
    } else {
      collected = await collectSchema(item, route.kind, projection);
    }
    items.push({
      ...item,
      status: "complete",
      endpointKind: route.kind,
      ...(projection.sqlEndpointId ? { sqlEndpointId: projection.sqlEndpointId } : {}),
    });
    catalogs[item.id] = collected.evidence;
    const capability = collected.evidence.code ?? collected.evidence.status;
    config.push(...projection.config, { itemId: item.id, section: "Metadata capability", label: "SQL schema", value: capability });
    if (collected.tables) {
      schema[item.id] = collected.tables;
      config.push(...(collected.facts ?? []));
    }
    if (route.kind === "lakehouse-sql-endpoint") {
      const lakehouseStatus = collected.evidence.lakehouseTables;
      config.push({
        itemId: item.id,
        section: "Inventory",
        label: "Lakehouse Tables REST",
        value: `${lakehouseStatus?.status ?? "failed"}${lakehouseStatus?.code ? `: ${lakehouseStatus.code}` : ""}`,
      });
      config.push({
        itemId: item.id,
        section: "Inventory",
        label: "Coverage",
        value: collected.tables
          ? "Lakehouse Tables REST inventory merged with SQL analytics endpoint columns when available."
          : "Lakehouse table inventory was unavailable.",
      });
    } else {
      config.push({
        itemId: item.id,
        section: "Inventory",
        label: "Coverage",
        value: collected.tables
          ? `Tables/views and columns returned by ${SCHEMA_SOURCES[route.kind]}.`
          : "Fabric REST exposes item properties only; complete tables, views and columns require SQL connectivity.",
      });
    }
    for (const table of collected.tables ?? []) {
      config.push({ itemId: item.id, section: "Tables", label: table.name, value: table.objectType });
    }
  }

  const sqlSchema = finishSection(schemaTracker);
  const envelope: SqlMetadataStageEnvelope = {
    contractVersion: 1,
    stage: "sql-metadata",
    authoritative: false,
    ...(request.correlationId ? { correlationId: request.correlationId } : {}),
    workspaceId: request.workspaceId,
    items,
    catalogs,
    schema,
    artifactMetadata: {},
    config,
    sections: { sqlProperties: finishSection(tracker), sqlSchema },
    capabilities: { sqlSchema: { ...sqlSchema } },
    errors,
    syncedAt: new Date().toISOString(),
  };
  if (byteLength(envelope) > limits.maxEnvelopeBytes) {
    throw new Error(RESPONSE_TOO_LARGE_MESSAGE);
  }
  return envelope;
}

export async function workspaceCollectSqlMetadata(
  ctx: RayfinContext<AtlasSchema, AudienceType.Fabric | AudienceType.Sql>,
  protocolVersion: unknown,
  workspaceId: unknown,
  items: unknown,
  correlationId: unknown,
  dependencies?: CollectSqlMetadataDependencies,
): Promise<SqlMetadataStageEnvelope> {
  const request = validateCollectSqlMetadataInput(protocolVersion, workspaceId, items, correlationId);
  await requireAtlasSynchronizer(ctx.getDataClient(), "SQL metadata collection", AUTHORIZATION_MESSAGE);
  let fabric: string;
  try {
    fabric = ctx.Tokens.Fabric;
  } catch {
    throw new Error(TOKEN_UNAVAILABLE_MESSAGE);
  }
  let sql: string | undefined;
  try {
    sql = ctx.Tokens.Sql;
  } catch {
    // A missing SQL audience token only makes catalog evidence unsupported.
    sql = undefined;
  }
  return collectWorkspaceSqlMetadata({ fabric, sql }, request, dependencies);
}
