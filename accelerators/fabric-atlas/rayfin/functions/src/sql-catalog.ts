import type * as Mssql from "mssql";

/*
 * Read-only SQL catalog access for Fabric SQL Database, Warehouse and Lakehouse
 * SQL analytics endpoints. Every statement is a fixed `sys.*` catalog query with
 * typed parameters; no identifier, coordinate or caller value is ever spliced
 * into SQL text. Driver failures surface only as fixed codes, so server
 * messages, principal names and tokens never leave this module.
 */

export type SqlEndpointKind =
  | "sql-database"
  | "warehouse"
  | "lakehouse-sql-endpoint"
  | "mirrored-database-sql-endpoint";

export type SqlDriverErrorCode =
  | "tds-runtime-unavailable"
  | "authorization-failed"
  | "sql-connection-failed"
  | "sql-catalog-query-failed"
  | "sql-timeout"
  | "sql-throttled"
  | "sql-transient"
  | "response-size-exceeded"
  | "cancelled";

export class SqlDriverError extends Error {
  constructor(readonly code: SqlDriverErrorCode) {
    super(`SQL catalog access failed (${code}).`);
    this.name = "SqlDriverError";
  }
}

export type SqlParameterType = "int" | "nvarchar";

export interface SqlQueryParameter {
  name: string;
  type: SqlParameterType;
  value: number | string;
}

export interface SqlConnectionTarget {
  kind: SqlEndpointKind;
  /** Lowercase host validated against the Fabric SQL origin allowlist. */
  server: string;
  port: 1433;
  /** SQL Database name, or the Fabric SQL endpoint item GUID used for routing. */
  database: string;
  readOnlyIntent: boolean;
}

export interface SqlConnectOptions {
  timeoutMs: number;
  /** Driver-level backstop for each request; the stage also enforces its own timer. */
  requestTimeoutMs: number;
  signal?: AbortSignal;
}

export interface SqlQueryOptions {
  timeoutMs: number;
  /** Rows beyond this bound are not read; the result is flagged truncated. */
  maxRows: number;
  /** Streamed value bytes beyond this bound fail with `response-size-exceeded`. */
  maxBytes: number;
  signal?: AbortSignal;
}

export interface SqlQueryResult {
  rows: unknown[];
  truncated: boolean;
}

export interface SqlCatalogSession {
  query(text: string, parameters: readonly SqlQueryParameter[], options: SqlQueryOptions): Promise<SqlQueryResult>;
  close(): Promise<void>;
}

/** Minimal TDS driver surface; tests inject fakes and production uses `mssql`. */
export interface SqlCatalogDriver {
  connect(target: SqlConnectionTarget, token: string, options: SqlConnectOptions): Promise<SqlCatalogSession>;
}

/** Fixed T-SQL Atlas may run. Variable values are always bound as parameters. */
export const SQL_CATALOG_QUERIES = {
  objects: [
    "SELECT TOP (@rowLimit)",
    "    objects.object_id AS object_id,",
    "    schemas.name AS schema_name,",
    "    objects.name AS object_name,",
    "    objects.type AS object_type,",
    "    columns.column_id AS column_id,",
    "    columns.name AS column_name,",
    "    types.name AS type_name",
    "FROM sys.objects AS objects",
    "INNER JOIN sys.schemas AS schemas",
    "    ON schemas.schema_id = objects.schema_id",
    "LEFT JOIN sys.columns AS columns",
    "    ON columns.object_id = objects.object_id",
    "LEFT JOIN sys.types AS types",
    "    ON types.user_type_id = columns.user_type_id",
    "WHERE objects.type IN (@tableType, @viewType)",
    "  AND objects.is_ms_shipped = 0",
    "ORDER BY schemas.name, objects.name, objects.object_id, columns.column_id;",
  ].join("\n"),
  schemas: [
    "SELECT TOP (@rowLimit)",
    "    schemas.name AS schema_name",
    "FROM sys.schemas AS schemas",
    "WHERE schemas.schema_id = @defaultSchemaId",
    "   OR (schemas.schema_id >= @firstUserSchemaId AND schemas.schema_id < @firstRoleSchemaId)",
    "ORDER BY schemas.name;",
  ].join("\n"),
  primaryKeys: [
    "SELECT TOP (@rowLimit)",
    "    key_constraints.object_id AS constraint_id,",
    "    schemas.name AS schema_name,",
    "    tables.name AS table_name,",
    "    key_constraints.name AS constraint_name,",
    "    columns.name AS column_name,",
    "    index_columns.key_ordinal AS key_ordinal",
    "FROM sys.key_constraints AS key_constraints",
    "INNER JOIN sys.tables AS tables",
    "    ON tables.object_id = key_constraints.parent_object_id",
    "INNER JOIN sys.schemas AS schemas",
    "    ON schemas.schema_id = tables.schema_id",
    "INNER JOIN sys.index_columns AS index_columns",
    "    ON index_columns.object_id = tables.object_id",
    "   AND index_columns.index_id = key_constraints.unique_index_id",
    "INNER JOIN sys.columns AS columns",
    "    ON columns.object_id = index_columns.object_id",
    "   AND columns.column_id = index_columns.column_id",
    "WHERE key_constraints.type = @primaryKeyType",
    "  AND tables.is_ms_shipped = 0",
    "ORDER BY schemas.name, tables.name, key_constraints.name, key_constraints.object_id, index_columns.key_ordinal;",
  ].join("\n"),
  foreignKeys: [
    "SELECT TOP (@rowLimit)",
    "    foreign_keys.object_id AS constraint_id,",
    "    foreign_keys.name AS constraint_name,",
    "    source_schemas.name AS source_schema,",
    "    source_tables.name AS source_table,",
    "    source_columns.name AS source_column,",
    "    target_schemas.name AS target_schema,",
    "    target_tables.name AS target_table,",
    "    target_columns.name AS target_column,",
    "    foreign_key_columns.constraint_column_id AS key_ordinal",
    "FROM sys.foreign_keys AS foreign_keys",
    "INNER JOIN sys.foreign_key_columns AS foreign_key_columns",
    "    ON foreign_key_columns.constraint_object_id = foreign_keys.object_id",
    "INNER JOIN sys.tables AS source_tables",
    "    ON source_tables.object_id = foreign_key_columns.parent_object_id",
    "INNER JOIN sys.schemas AS source_schemas",
    "    ON source_schemas.schema_id = source_tables.schema_id",
    "INNER JOIN sys.columns AS source_columns",
    "    ON source_columns.object_id = foreign_key_columns.parent_object_id",
    "   AND source_columns.column_id = foreign_key_columns.parent_column_id",
    "INNER JOIN sys.tables AS target_tables",
    "    ON target_tables.object_id = foreign_key_columns.referenced_object_id",
    "INNER JOIN sys.schemas AS target_schemas",
    "    ON target_schemas.schema_id = target_tables.schema_id",
    "INNER JOIN sys.columns AS target_columns",
    "    ON target_columns.object_id = foreign_key_columns.referenced_object_id",
    "   AND target_columns.column_id = foreign_key_columns.referenced_column_id",
    "WHERE foreign_keys.is_ms_shipped = 0",
    "ORDER BY foreign_keys.name, foreign_keys.object_id, foreign_key_columns.constraint_column_id;",
  ].join("\n"),
} as const;

export type SqlCatalogQueryName = keyof typeof SQL_CATALOG_QUERIES;

/** Typed parameters for each fixed query; `rowLimit` reads one row past the bound. */
export function sqlCatalogParameters(name: SqlCatalogQueryName, maxRows: number): SqlQueryParameter[] {
  const rowLimit: SqlQueryParameter = { name: "rowLimit", type: "int", value: maxRows + 1 };
  switch (name) {
    case "objects":
      return [
        rowLimit,
        { name: "tableType", type: "nvarchar", value: "U" },
        { name: "viewType", type: "nvarchar", value: "V" },
      ];
    case "schemas":
      // dbo is schema 1; 2-4 are guest, INFORMATION_SCHEMA and sys; 16384+ are fixed database roles.
      return [
        rowLimit,
        { name: "defaultSchemaId", type: "int", value: 1 },
        { name: "firstUserSchemaId", type: "int", value: 5 },
        { name: "firstRoleSchemaId", type: "int", value: 16_384 },
      ];
    case "primaryKeys":
      return [rowLimit, { name: "primaryKeyType", type: "nvarchar", value: "PK" }];
    case "foreignKeys":
      return [rowLimit];
  }
}

// ---------- trusted connection coordinates ----------

const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const MAX_HOST_LENGTH = 253;
const MAX_DATABASE_NAME = 128;
const COORDINATE_FORBIDDEN = /[;{}=\\'"[\]]/;

/** True for C0 controls and DEL, which never belong in coordinates or tokens. */
export function hasControlCharacter(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/** Documented Fabric SQL host suffixes for each endpoint kind. */
export const SQL_HOST_SUFFIXES: Readonly<Record<SqlEndpointKind, string>> = {
  "sql-database": ".database.fabric.microsoft.com",
  warehouse: ".datawarehouse.fabric.microsoft.com",
  "lakehouse-sql-endpoint": ".datawarehouse.fabric.microsoft.com",
  "mirrored-database-sql-endpoint": ".datawarehouse.fabric.microsoft.com",
};

export class SqlCoordinateError extends Error {
  constructor() {
    super("SQL connection coordinates were invalid.");
    this.name = "SqlCoordinateError";
  }
}

/**
 * Validates a Fabric-provided SQL host (`host`, `host,1433` or `tcp:host,1433`).
 * Only DNS labels under the documented suffix and TDS port 1433 are accepted;
 * URLs, credentials, connection-string keywords and lookalike hosts are rejected.
 */
export function trustedSqlHost(value: unknown, kind: SqlEndpointKind): string {
  if (typeof value !== "string") throw new SqlCoordinateError();
  let text = value.trim();
  if (
    !text ||
    text.length > MAX_HOST_LENGTH + 10 ||
    hasControlCharacter(text) ||
    COORDINATE_FORBIDDEN.test(text) ||
    /\s|\/|@/.test(text)
  ) {
    throw new SqlCoordinateError();
  }
  if (text.toLowerCase().startsWith("tcp:")) text = text.slice(4);
  const parts = text.split(",");
  if (parts.length > 2 || (parts.length === 2 && parts[1] !== "1433")) throw new SqlCoordinateError();
  const host = parts[0].toLowerCase();
  const suffix = SQL_HOST_SUFFIXES[kind];
  const labels = host.split(".");
  if (
    host.length > MAX_HOST_LENGTH ||
    !host.endsWith(suffix) ||
    host.length <= suffix.length ||
    labels.some((label) => !HOST_LABEL.test(label))
  ) {
    throw new SqlCoordinateError();
  }
  return host;
}

/** Validates a Fabric SQL Database name passed in the TDS login, never in SQL text. */
export function trustedSqlDatabaseName(value: unknown): string {
  if (typeof value !== "string") throw new SqlCoordinateError();
  const text = value.trim();
  if (!text || text.length > MAX_DATABASE_NAME || hasControlCharacter(text) || COORDINATE_FORBIDDEN.test(text)) {
    throw new SqlCoordinateError();
  }
  return text;
}

// ---------- catalog projection ----------

const MAX_IDENTIFIER = 128;

/** C0/C1 controls, line/paragraph separators and bidirectional overrides are never rendered. */
function hasUnsafeIdentifierCharacter(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (
      code <= 0x1f ||
      (code >= 0x7f && code <= 0x9f) ||
      code === 0x2028 ||
      code === 0x2029 ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069)
    ) {
      return true;
    }
  }
  return false;
}

export interface SqlCatalogColumn {
  name: string;
  dataType: string;
}

export interface SqlCatalogObject {
  schema: string;
  name: string;
  kind: "table" | "view";
  columns: SqlCatalogColumn[];
}

export interface SqlPrimaryKey {
  name: string;
  schema: string;
  table: string;
  columns: string[];
}

export interface SqlForeignKey {
  name: string;
  sourceSchema: string;
  sourceTable: string;
  sourceColumns: string[];
  targetSchema: string;
  targetTable: string;
  targetColumns: string[];
}

export interface SqlCatalogLimits {
  maxObjectsPerItem: number;
  maxColumnsPerObject: number;
}

export interface SqlObjectProjection {
  objects: SqlCatalogObject[];
  truncated: boolean;
  rejectedNames: number;
}

/** Raised when the driver returns a row whose shape is not the fixed query's shape. */
export class SqlCatalogShapeError extends Error {
  constructor() {
    super("SQL catalog response was invalid.");
    this.name = "SqlCatalogShapeError";
  }
}

function isRow(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function row(value: unknown): Record<string, unknown> {
  if (!isRow(value)) throw new SqlCatalogShapeError();
  return value;
}

/** A catalog identifier, or undefined when it is not safe to render. */
export function safeIdentifier(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value || value.length > MAX_IDENTIFIER || hasUnsafeIdentifierCharacter(value) || value.trim() !== value) {
    return undefined;
  }
  return value;
}

function nullableText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new SqlCatalogShapeError();
  return value;
}

function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new SqlCatalogShapeError();
  return value;
}

function nullableInteger(value: unknown): number | null {
  return value == null ? null : integer(value);
}

/**
 * Groups object rows by object ID. The query orders rows by object, so an
 * object is contiguous; a repeated object ID after another object is invalid.
 * A truncated result drops the last object because its columns may be partial.
 */
export function projectSqlObjects(
  rows: readonly unknown[],
  rowsTruncated: boolean,
  limits: SqlCatalogLimits,
): SqlObjectProjection {
  const objects: SqlCatalogObject[] = [];
  const seen = new Set<number>();
  let truncated = rowsTruncated;
  let objectLimitReached = false;
  let rejectedNames = 0;
  let current: { id: number; object?: SqlCatalogObject } | undefined;

  for (const value of rows) {
    const entry = row(value);
    const objectId = integer(entry.object_id);
    const schemaName = nullableText(entry.schema_name);
    const objectName = nullableText(entry.object_name);
    const objectType = nullableText(entry.object_type)?.trim();
    const columnId = nullableInteger(entry.column_id);
    const columnName = nullableText(entry.column_name);
    const typeName = nullableText(entry.type_name);
    if (objectType !== "U" && objectType !== "V") throw new SqlCatalogShapeError();

    if (!current || current.id !== objectId) {
      if (seen.has(objectId)) throw new SqlCatalogShapeError();
      seen.add(objectId);
      const schema = safeIdentifier(schemaName);
      const name = safeIdentifier(objectName);
      if (!schema || !name) {
        rejectedNames += 1;
        current = { id: objectId };
        continue;
      }
      if (objects.length >= limits.maxObjectsPerItem) {
        truncated = true;
        objectLimitReached = true;
        break;
      }
      const object: SqlCatalogObject = { schema, name, kind: objectType === "U" ? "table" : "view", columns: [] };
      objects.push(object);
      current = { id: objectId, object };
    }
    const object = current.object;
    if (!object || columnId == null) continue;
    const column = safeIdentifier(columnName);
    const dataType = safeIdentifier(typeName);
    if (!column) {
      rejectedNames += 1;
      continue;
    }
    if (object.columns.length >= limits.maxColumnsPerObject) {
      truncated = true;
      continue;
    }
    object.columns.push({ name: column, dataType: dataType ?? "column" });
  }
  if (rowsTruncated && !objectLimitReached && objects.length > 0 && current?.object === objects.at(-1)) {
    objects.pop();
  }
  return { objects, truncated, rejectedNames };
}

export function projectSqlSchemaNames(
  rows: readonly unknown[],
  maxSchemas: number,
): { schemas: string[]; truncated: boolean; rejectedNames: number } {
  const schemas: string[] = [];
  let rejectedNames = 0;
  for (const value of rows) {
    const name = safeIdentifier(nullableText(row(value).schema_name));
    if (!name) {
      rejectedNames += 1;
      continue;
    }
    if (schemas.length >= maxSchemas) return { schemas, truncated: true, rejectedNames };
    if (!schemas.includes(name)) schemas.push(name);
  }
  return { schemas, truncated: false, rejectedNames };
}

/** Drops only the constraint of the last row when the row bound cut it short. */
function completeGroups<T>(groups: Map<number, T>, order: number[], partialId: number | undefined): T[] {
  return order.filter((id) => groups.has(id) && id !== partialId).map((id) => groups.get(id)!);
}

export function projectSqlPrimaryKeys(
  rows: readonly unknown[],
  rowsTruncated: boolean,
): { primaryKeys: SqlPrimaryKey[]; rejectedNames: number } {
  const groups = new Map<number, SqlPrimaryKey & { ordinals: number[] }>();
  const order: number[] = [];
  const rejected = new Set<number>();
  let lastId: number | undefined;
  for (const value of rows) {
    const entry = row(value);
    const id = integer(entry.constraint_id);
    const ordinal = integer(entry.key_ordinal);
    const schema = safeIdentifier(nullableText(entry.schema_name));
    const table = safeIdentifier(nullableText(entry.table_name));
    const name = safeIdentifier(nullableText(entry.constraint_name));
    const column = safeIdentifier(nullableText(entry.column_name));
    lastId = id;
    if (rejected.has(id)) continue;
    if (!groups.has(id)) order.push(id);
    if (!schema || !table || !name || !column) {
      rejected.add(id);
      groups.delete(id);
      continue;
    }
    const group = groups.get(id) ?? { name, schema, table, columns: [], ordinals: [] };
    if (group.name !== name || group.schema !== schema || group.table !== table) throw new SqlCatalogShapeError();
    group.columns.push(column);
    group.ordinals.push(ordinal);
    groups.set(id, group);
  }
  const primaryKeys = completeGroups(groups, order, rowsTruncated ? lastId : undefined).map((group) => ({
    name: group.name,
    schema: group.schema,
    table: group.table,
    columns: group.columns
      .map((column, index) => ({ column, ordinal: group.ordinals[index] }))
      .sort((left, right) => left.ordinal - right.ordinal)
      .map((entry) => entry.column),
  }));
  return { primaryKeys, rejectedNames: rejected.size };
}

export function projectSqlForeignKeys(
  rows: readonly unknown[],
  rowsTruncated: boolean,
): { foreignKeys: SqlForeignKey[]; rejectedNames: number } {
  const groups = new Map<number, SqlForeignKey>();
  const order: number[] = [];
  const rejected = new Set<number>();
  let lastId: number | undefined;
  for (const value of rows) {
    const entry = row(value);
    const id = integer(entry.constraint_id);
    integer(entry.key_ordinal);
    const names = [
      entry.constraint_name,
      entry.source_schema,
      entry.source_table,
      entry.source_column,
      entry.target_schema,
      entry.target_table,
      entry.target_column,
    ].map((name) => safeIdentifier(nullableText(name)));
    lastId = id;
    if (rejected.has(id)) continue;
    if (!groups.has(id)) order.push(id);
    if (names.some((name) => !name)) {
      rejected.add(id);
      groups.delete(id);
      continue;
    }
    const [name, sourceSchema, sourceTable, sourceColumn, targetSchema, targetTable, targetColumn] = names as string[];
    const group = groups.get(id) ?? {
      name,
      sourceSchema,
      sourceTable,
      sourceColumns: [],
      targetSchema,
      targetTable,
      targetColumns: [],
    };
    if (
      group.name !== name ||
      group.sourceSchema !== sourceSchema ||
      group.sourceTable !== sourceTable ||
      group.targetSchema !== targetSchema ||
      group.targetTable !== targetTable
    ) {
      throw new SqlCatalogShapeError();
    }
    group.sourceColumns.push(sourceColumn);
    group.targetColumns.push(targetColumn);
    groups.set(id, group);
  }
  return { foreignKeys: completeGroups(groups, order, rowsTruncated ? lastId : undefined), rejectedNames: rejected.size };
}

// ---------- driver error classification ----------

// Permission denied, object/database access and contained-login failures.
const PERMISSION_ERRORS = new Set([229, 230, 262, 297, 300, 916, 4060, 15247, 18456, 33155]);
// Resource governance and service-busy errors.
const THROTTLE_ERRORS = new Set([10928, 10929, 40501, 49918, 49919, 49920]);
// Databases that are resuming, failing over or briefly unavailable.
const TRANSIENT_ERRORS = new Set([4221, 40143, 40197, 40540, 40613, 42108, 42109]);
const TRANSIENT_CONNECTION_CODES = new Set(["ESOCKET", "ECONNCLOSED", "ECONNRESET", "EINSTLOOKUP", "ENOTOPEN"]);

function errorProperty(error: unknown, key: string): unknown {
  return error && typeof error === "object" ? (error as Record<string, unknown>)[key] : undefined;
}

function sqlErrorNumber(error: unknown): number | undefined {
  for (const candidate of [error, errorProperty(error, "originalError"), errorProperty(errorProperty(error, "originalError"), "info")]) {
    const value = errorProperty(candidate, "number");
    if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  }
  return undefined;
}

function isTransientLogin(error: unknown): boolean {
  return errorProperty(error, "isTransient") === true || errorProperty(errorProperty(error, "originalError"), "isTransient") === true;
}

/** Maps any driver failure to a fixed code; the driver message is never read. */
export function classifySqlError(error: unknown, phase: "connect" | "query"): SqlDriverErrorCode {
  if (error instanceof SqlDriverError) return error.code;
  const code = errorProperty(error, "code");
  const number = sqlErrorNumber(error);
  if (code === "ECANCEL") return "cancelled";
  if (code === "ETIMEOUT") return "sql-timeout";
  if (number !== undefined && THROTTLE_ERRORS.has(number)) return "sql-throttled";
  if (number !== undefined && TRANSIENT_ERRORS.has(number)) return "sql-transient";
  if (code === "ELOGIN") return isTransientLogin(error) ? "sql-transient" : "authorization-failed";
  if (number !== undefined && PERMISSION_ERRORS.has(number)) return "authorization-failed";
  if (typeof code === "string" && TRANSIENT_CONNECTION_CODES.has(code)) return "sql-transient";
  return phase === "connect" ? "sql-connection-failed" : "sql-catalog-query-failed";
}

// ---------- mssql adapter ----------

type MssqlModule = Pick<typeof Mssql, "ConnectionPool" | "Int" | "NVarChar">;

function valueBytes(value: unknown): number {
  if (typeof value === "string") return Buffer.byteLength(value, "utf8") + 2;
  return 8;
}

function rowBytes(value: unknown): number {
  if (!isRow(value)) return 8;
  let total = 2;
  for (const [key, entry] of Object.entries(value)) total += key.length + valueBytes(entry);
  return total;
}

async function closeQuietly(pool: Mssql.ConnectionPool): Promise<void> {
  try {
    await pool.close();
  } catch {
    // Cleanup failures cannot leak details or change the projected result.
  }
}

/** Wraps one `mssql` connection; requests stream rows so bounds apply before buffering. */
class MssqlCatalogSession implements SqlCatalogSession {
  constructor(
    private readonly mssql: MssqlModule,
    private readonly pool: Mssql.ConnectionPool,
  ) {}

  async query(text: string, parameters: readonly SqlQueryParameter[], options: SqlQueryOptions): Promise<SqlQueryResult> {
    if (options.signal?.aborted) throw new SqlDriverError("cancelled");
    const request = this.pool.request();
    request.stream = true;
    for (const parameter of parameters) {
      request.input(parameter.name, parameter.type === "int" ? this.mssql.Int : this.mssql.NVarChar(128), parameter.value);
    }
    const rows: unknown[] = [];
    let bytes = 0;
    let stop: "rows" | "bytes" | "timeout" | "cancelled" | undefined;
    let failure: unknown;
    const halt = (reason: NonNullable<typeof stop>) => {
      if (stop) return;
      stop = reason;
      try {
        request.cancel();
      } catch {
        // A request that already completed cannot be cancelled.
      }
    };
    request.on("row", (value: unknown) => {
      if (stop) return;
      if (rows.length >= options.maxRows) {
        halt("rows");
        return;
      }
      bytes += rowBytes(value);
      if (bytes > options.maxBytes) {
        halt("bytes");
        return;
      }
      rows.push(value);
    });
    request.on("error", (error: unknown) => {
      failure ??= error;
    });
    const timer = setTimeout(() => halt("timeout"), options.timeoutMs);
    const onAbort = () => halt("cancelled");
    options.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      await request.query(text);
    } catch (error) {
      failure ??= error;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    }
    if (stop === "cancelled") throw new SqlDriverError("cancelled");
    if (stop === "timeout") throw new SqlDriverError("sql-timeout");
    if (stop === "bytes") throw new SqlDriverError("response-size-exceeded");
    if (stop === "rows") return { rows, truncated: true };
    if (failure) throw new SqlDriverError(classifySqlError(failure, "query"));
    return { rows, truncated: false };
  }

  close(): Promise<void> {
    return closeQuietly(this.pool);
  }
}

export type MssqlModuleLoader = () => Promise<unknown>;

// A literal specifier keeps the driver reachable for the Functions esbuild bundle.
const loadMssql: MssqlModuleLoader = () => import("mssql");

function mssqlModule(loaded: unknown): MssqlModule {
  const candidate = (errorProperty(loaded, "ConnectionPool") ? loaded : errorProperty(loaded, "default")) as MssqlModule | undefined;
  if (!candidate || typeof candidate.ConnectionPool !== "function" || !candidate.Int || typeof candidate.NVarChar !== "function") {
    throw new SqlDriverError("tds-runtime-unavailable");
  }
  return candidate;
}

/**
 * Production driver using `mssql`/`tedious` with the documented Fabric
 * settings: TLS with certificate validation, an Entra access token and no
 * driver-level retries, so the stage owns every retry and deadline.
 */
export function createMssqlCatalogDriver(load: MssqlModuleLoader = loadMssql): SqlCatalogDriver {
  let module: Promise<MssqlModule> | undefined;
  return {
    async connect(target, token, options) {
      if (options.signal?.aborted) throw new SqlDriverError("cancelled");
      module ??= load().then(mssqlModule, () => {
        throw new SqlDriverError("tds-runtime-unavailable");
      });
      let mssql: MssqlModule;
      try {
        mssql = await module;
      } catch {
        module = undefined;
        throw new SqlDriverError("tds-runtime-unavailable");
      }
      let pool: Mssql.ConnectionPool;
      try {
        pool = new mssql.ConnectionPool({
          server: target.server,
          port: target.port,
          database: target.database,
          connectionTimeout: options.timeoutMs,
          requestTimeout: options.requestTimeoutMs,
          pool: { min: 0, max: 1, idleTimeoutMillis: 1_000 },
          options: {
            encrypt: true,
            trustServerCertificate: false,
            readOnlyIntent: target.readOnlyIntent,
            appName: "FabricAtlas-catalog",
            maxRetriesOnTransientErrors: 0,
            abortTransactionOnError: true,
          },
          authentication: { type: "azure-active-directory-access-token", options: { token } },
        });
      } catch {
        throw new SqlDriverError("sql-connection-failed");
      }
      pool.on("error", () => undefined);
      let stop: "timeout" | "cancelled" | undefined;
      const halt = (reason: NonNullable<typeof stop>) => {
        stop ??= reason;
        void closeQuietly(pool);
      };
      const timer = setTimeout(() => halt("timeout"), options.timeoutMs);
      const onAbort = () => halt("cancelled");
      options.signal?.addEventListener("abort", onAbort, { once: true });
      try {
        await pool.connect();
      } catch (error) {
        await closeQuietly(pool);
        if (stop === "cancelled") throw new SqlDriverError("cancelled");
        if (stop === "timeout") throw new SqlDriverError("sql-timeout");
        throw new SqlDriverError(classifySqlError(error, "connect"));
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
      }
      if (stop) {
        await closeQuietly(pool);
        throw new SqlDriverError(stop === "cancelled" ? "cancelled" : "sql-timeout");
      }
      return new MssqlCatalogSession(mssql, pool);
    },
  };
}
