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
import { requireAtlasSynchronizer } from "./synchronizer-gate.js";
import { strictUuid } from "./sync/protocol.js";
import {
  KqlSchemaError,
  extractKqlSchemaScript,
  parseKqlDatabaseSchema,
  type KqlSchemaFunction,
  type KqlSchemaMaterializedView,
  type KqlSchemaTable,
} from "./kql-schema.js";

/*
 * Read-only, non-authoritative KQL metadata stage. Eventhouse and KQL database
 * properties come from Fabric REST item routes, and KQL database structure
 * comes from the documented getDefinition `DatabaseSchema.kql` part. The Kusto
 * data plane is never called: Rayfin 1.36.2 Functions expose no Kusto audience
 * (only Sql, Storage, Fabric, AzureAI and ADO), which remains a dated blocker.
 */

/** Documented Fabric REST item routes with KQL structural properties. */
export const KQL_PROPERTY_ROUTES: ReadonlyMap<string, string> = new Map([
  ["Eventhouse", "eventhouses"],
  ["KQLDatabase", "kqlDatabases"],
]);

/** KQL item types whose Fabric REST item has no structural properties. */
export const KQL_ITEMS_WITHOUT_PROPERTIES: ReadonlySet<string> = new Set([
  "KQLQueryset",
  "KQLDashboard",
]);

export type KqlCapabilityBlocker = {
  capability: "kqlDataPlaneSchema";
  code: "kusto-audience-unsupported";
  observedOn: "2026-10-02";
  rayfinVersion: "1.36.2";
  /** The supported structural replacement used instead of the data plane. */
  replacement: "fabric-kql-database-definition";
};

export const KQL_DATA_PLANE_BLOCKER: Readonly<KqlCapabilityBlocker> = {
  capability: "kqlDataPlaneSchema",
  code: "kusto-audience-unsupported",
  observedOn: "2026-10-02",
  rayfinVersion: "1.36.2",
  replacement: "fabric-kql-database-definition",
};

export const COLLECT_KQL_METADATA_LIMITS = {
  ...FABRIC_REST_DEFAULTS,
  // Leaves headroom below the 200-240 second Fabric Functions execution limit.
  executionBudgetMs: 150_000,
  maxItems: 16,
  maxRequests: 120,
  maxResponseBytes: 1024 * 1024,
  maxDatabaseItemIds: 1_000,
  maxLroPolls: 12,
  minPollDelayMs: 1_000,
  maxPollDelayMs: 5_000,
  maxDefinitionResponseBytes: 16 * 1024 * 1024,
  // Projected schema objects across the batch.
  maxSchemaBytes: 16 * 1024 * 1024,
  minItemStartMs: 5_000,
  maxErrors: 50,
  // Hard final guard below the 30 MiB Functions response limit.
  maxEnvelopeBytes: 24 * 1024 * 1024,
} as const;

export type CollectKqlMetadataLimits = {
  [Name in keyof typeof COLLECT_KQL_METADATA_LIMITS]: number;
};

export interface CollectKqlMetadataDependencies {
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  signal?: AbortSignal;
  limits?: Partial<CollectKqlMetadataLimits>;
}

export type KqlMetadataItemInput = { id: string; type: string };
// A named alias keeps the SDK from coercing or echoing the raw input; the strict validator owns it.
export type KqlMetadataItemsInput = KqlMetadataItemInput[];

export interface CollectKqlMetadataRequest {
  workspaceId: string;
  correlationId: string | null;
  items: KqlMetadataItemInput[];
}

export type KqlMetadataStatusCode =
  | FabricSafeErrorCode
  | "item-type-unsupported"
  | "no-structural-properties"
  | "not-attempted"
  | "read-write-permission-required"
  | "invalid-definition"
  | "projection-limit-exceeded"
  | "schema-part-missing"
  | "forward-compatible-parts-skipped"
  | "projection-truncated"
  | "partial-unsupported"
  | "not-applicable";

export type KqlMetadataStatus = {
  status: "complete" | "unsupported" | "failed";
  code?: KqlMetadataStatusCode;
};

export type KqlEventhouseProperties = {
  /** Kusto cluster origin; recorded as metadata and never called. */
  queryServiceUri?: string;
  databaseItemIds: string[];
};

/**
 * Structural schema from the `DatabaseSchema.kql` definition part. Function
 * bodies, view queries, property bags, mappings, policies and principals are
 * never returned. Materialized-view columns are query-derived and unavailable.
 */
export type KqlDatabaseSchema = {
  status: "complete" | "unsupported" | "failed";
  code?: KqlMetadataStatusCode;
  source?: "fabric-kql-database-definition";
  tables?: KqlSchemaTable[];
  functions?: KqlSchemaFunction[];
  materializedViews?: KqlSchemaMaterializedView[];
  /** Known non-structural statements that were skipped unread. */
  ignoredStatements?: number;
  /** Statements that could not be proven to be supported declarations. */
  unsupportedStatements?: number;
  /** A collection limit was reached; the projection is incomplete. */
  truncated?: true;
  /** Definition parts other than the reviewed ones; never decoded. */
  unknownParts?: number;
};

export type KqlDatabaseProperties = {
  parentEventhouseItemId?: string;
  /** Kusto cluster origin; recorded as metadata and never called. */
  queryServiceUri?: string;
  databaseType?: string;
  databaseName?: string;
};

/** The reviewed frontend `kql` artifact metadata contract. */
export type KqlArtifactMetadata = {
  kind: "kql";
  functions: KqlSchemaFunction[];
  materializedViews: { name: string; sourceTable?: string; columns: never[] }[];
};

export type KqlItemEvidence = {
  id: string;
  type: string;
  status: "complete" | "unsupported" | "failed";
  code?: KqlMetadataStatusCode;
  eventhouse?: KqlEventhouseProperties;
  kqlDatabase?: KqlDatabaseProperties;
};

export type KqlConfigEntry = {
  itemId: string;
  section: string;
  label: string;
  value: string;
};

export interface KqlMetadataStageEnvelope {
  contractVersion: 1;
  stage: "kql-metadata";
  /** This stage can never authorize snapshot publication. */
  authoritative: false;
  /** Present only when the caller supplied a correlation UUID. */
  correlationId?: string;
  workspaceId: string;
  items: KqlItemEvidence[];
  /** Structural schema evidence for every requested KQL database, keyed by item ID. */
  schemas: Record<string, KqlDatabaseSchema>;
  /** Reviewed `kql` artifact metadata for KQL databases whose schema was parsed. */
  artifactMetadata: Record<string, KqlArtifactMetadata>;
  config: KqlConfigEntry[];
  sections: { kqlProperties: KqlMetadataStatus; kqlSchema: KqlMetadataStatus };
  capabilities: { kqlSchema: KqlMetadataStatus };
  /** Dated platform blockers; the Kusto data plane remains unavailable. */
  blockers: KqlCapabilityBlocker[];
  errors: string[];
  syncedAt: string;
}

const INVALID_INPUT_MESSAGE =
  "Use protocolVersion 1, a strict workspace UUID, 1-16 unique {id, type} items and a strict correlation UUID or null.";
const AUTHORIZATION_MESSAGE =
  "KQL metadata collection requires the configured Atlas administrator.";
const TOKEN_UNAVAILABLE_MESSAGE = "The Fabric application token was unavailable.";
const RESPONSE_TOO_LARGE_MESSAGE =
  "KQL metadata collection exceeded the safe response size.";
const ITEM_TYPE = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
// Fabric item references are GUIDs that are not always RFC-variant UUIDs.
const HEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KUSTO_HOST_SUFFIXES = [".kusto.fabric.microsoft.com", ".kusto.windows.net"];
const MAX_TEXT = 256;
const STOP_CODES = new Set<KqlMetadataStatusCode>([
  "deadline-exhausted",
  "request-timeout",
  "retry-after-deferred",
  "rate-limited",
  "request-budget-exhausted",
  "cancelled",
]);

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

export function validateCollectKqlMetadataInput(
  protocolVersion: unknown,
  workspaceId: unknown,
  items: unknown,
  correlationId: unknown,
): CollectKqlMetadataRequest {
  try {
    if (
      protocolVersion !== 1 ||
      !Array.isArray(items) ||
      items.length < 1 ||
      items.length > COLLECT_KQL_METADATA_LIMITS.maxItems
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

function optionalHexUuid(value: unknown): string | undefined {
  return value == null ? undefined : hexUuid(value);
}

/** Bounded text without control characters; absent or blank values are omitted. */
function optionalText(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") invalid();
  const text = value.trim();
  if (!text) return undefined;
  if (text.length > MAX_TEXT || [...text].some((character) => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)) {
    invalid();
  }
  return text;
}

/**
 * Python `_kusto_url` origin rule: HTTPS on a Fabric or Azure Kusto host,
 * without credentials, path, query or fragment. Only the origin is kept.
 */
function kustoOrigin(value: unknown): string | undefined {
  const text = optionalText(value);
  if (!text) return undefined;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    invalid();
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    !KUSTO_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix)) ||
    url.username ||
    url.password ||
    url.port !== "" ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    invalid();
  }
  return `https://${host}`;
}

function itemProperties(
  value: Record<string, unknown>,
  request: CollectKqlMetadataRequest,
  item: KqlMetadataItemInput,
): Record<string, unknown> {
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

/** Projects only the Eventhouse properties used by the Python collector. */
export function projectEventhouse(
  value: unknown,
  request: CollectKqlMetadataRequest,
  item: KqlMetadataItemInput,
  maxDatabaseItemIds: number = COLLECT_KQL_METADATA_LIMITS.maxDatabaseItemIds,
): { properties: KqlEventhouseProperties; config: KqlConfigEntry[] } {
  if (!isRecord(value)) invalid();
  const properties = itemProperties(value, request, item);
  const queryServiceUri = kustoOrigin(properties.queryServiceUri);
  const rawIds = properties.databasesItemIds;
  if (rawIds != null && (!Array.isArray(rawIds) || rawIds.length > maxDatabaseItemIds)) invalid();
  const databaseItemIds = Array.isArray(rawIds)
    ? [...new Set(rawIds.map(hexUuid))].sort()
    : [];
  const config: KqlConfigEntry[] = [];
  if (queryServiceUri) {
    config.push({ itemId: item.id, section: "Eventhouse", label: "Query service URI", value: queryServiceUri });
  }
  if (Array.isArray(rawIds)) {
    config.push({ itemId: item.id, section: "Eventhouse", label: "KQL databases", value: String(databaseItemIds.length) });
  }
  return {
    properties: { ...(queryServiceUri ? { queryServiceUri } : {}), databaseItemIds },
    config,
  };
}

/** Projects only the KQL database properties used by the Python collector. */
export function projectKqlDatabase(
  value: unknown,
  request: CollectKqlMetadataRequest,
  item: KqlMetadataItemInput,
): { properties: Omit<KqlDatabaseProperties, "schema">; config: KqlConfigEntry[] } {
  if (!isRecord(value)) invalid();
  const properties = itemProperties(value, request, item);
  const parentEventhouseItemId = optionalHexUuid(properties.parentEventhouseItemId);
  const queryServiceUri = kustoOrigin(properties.queryServiceUri);
  const databaseType = optionalText(properties.databaseType);
  // Python identity order: properties.databaseName, then the item display name.
  const databaseName = optionalText(properties.databaseName) ?? optionalText(value.displayName);
  const row = (label: string, rowValue: string | undefined): KqlConfigEntry[] =>
    rowValue ? [{ itemId: item.id, section: "KQL database", label, value: rowValue }] : [];
  return {
    properties: {
      ...(parentEventhouseItemId ? { parentEventhouseItemId } : {}),
      ...(queryServiceUri ? { queryServiceUri } : {}),
      ...(databaseType ? { databaseType } : {}),
      ...(databaseName ? { databaseName } : {}),
    },
    config: [
      ...row("Parent Eventhouse item ID", parentEventhouseItemId),
      ...row("Query service URI", queryServiceUri),
      ...row("Database identity", databaseName),
      ...row("Database type", databaseType),
    ],
  };
}

/**
 * Projects the `DatabaseSchema.kql` definition part. The schema is complete
 * only when every statement is a supported declaration or a known
 * non-structural command and no collection limit was reached.
 */
export function projectKqlSchema(response: unknown): KqlDatabaseSchema {
  const { script, unknownParts } = extractKqlSchemaScript(response);
  if (script === undefined) {
    return { status: "unsupported", code: "schema-part-missing", ...(unknownParts ? { unknownParts } : {}) };
  }
  const parsed = parseKqlDatabaseSchema(script);
  const code: KqlMetadataStatusCode | undefined = parsed.unsupportedStatements
    ? "partial-unsupported"
    : parsed.truncated
      ? "projection-truncated"
      : unknownParts
        ? "forward-compatible-parts-skipped"
        : undefined;
  return {
    status: "complete",
    ...(code ? { code } : {}),
    source: "fabric-kql-database-definition",
    tables: parsed.tables,
    functions: parsed.functions,
    materializedViews: parsed.materializedViews,
    ignoredStatements: parsed.ignoredStatements,
    unsupportedStatements: parsed.unsupportedStatements,
    ...(parsed.truncated ? { truncated: true as const } : {}),
    ...(unknownParts ? { unknownParts } : {}),
  };
}

/** Python Config rows for a KQL database schema, derived from names only. */
function schemaConfig(itemId: string, schema: KqlDatabaseSchema): KqlConfigEntry[] {
  const rows: KqlConfigEntry[] = [
    { itemId, section: "Metadata capability", label: "KQL schema", value: schema.code ?? schema.status },
  ];
  const row = (section: string, label: string, value: string) => rows.push({ itemId, section, label, value });
  for (const fn of schema.functions ?? []) row("KQL stored functions", fn.name, "Stored function");
  for (const view of schema.materializedViews ?? []) row("KQL materialized views", view.name, "Materialized view");
  for (const table of schema.tables ?? []) row("Tables", table.name, "KQL table");
  for (const view of schema.materializedViews ?? []) row("Tables", view.name, "KQL materialized view");
  for (const fn of schema.functions ?? []) row("Tables", fn.name, "KQL function");
  return rows;
}

const SCHEMA_UNSUPPORTED_CODES = new Set<KqlMetadataStatusCode>([
  "endpoint-unsupported",
  "read-write-permission-required",
  "encrypted-label-blocked",
]);

/** Python `_definition_error_code` for the getDefinition request. */
function schemaErrorCode(error: unknown): KqlMetadataStatusCode {
  if (error instanceof KqlSchemaError) return error.code;
  if (!(error instanceof FabricRestError)) return "upstream-failure";
  if (error.code === "invalid-response") return "invalid-definition";
  if (error.code === "upstream-http-error" && (error.status === 401 || error.status === 403)) {
    return "read-write-permission-required";
  }
  return fabricSafeErrorCode(error, true);
}

interface Tracker {
  success: number;
  unsupported: number;
  failed: number;
  codes: KqlMetadataStatusCode[];
}

function track(tracker: Tracker, result: "success" | "unsupported" | "failed", code?: KqlMetadataStatusCode): void {
  tracker[result] += 1;
  if (code && !tracker.codes.includes(code)) tracker.codes.push(code);
}

/** Python `_finish_optional_section`. */
function finishSection(tracker: Tracker): KqlMetadataStatus {
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

/** Collects bounded KQL structural metadata through Fabric REST only. */
export async function collectWorkspaceKqlMetadata(
  token: string,
  request: CollectKqlMetadataRequest,
  dependencies: CollectKqlMetadataDependencies = {},
): Promise<KqlMetadataStageEnvelope> {
  if (typeof token !== "string" || !token || /\s/.test(token)) {
    throw new Error(TOKEN_UNAVAILABLE_MESSAGE);
  }
  const limits: CollectKqlMetadataLimits = { ...COLLECT_KQL_METADATA_LIMITS, ...dependencies.limits };
  const deadline = new ExecutionDeadline(limits.executionBudgetMs, dependencies.now);
  const client = new FabricRestClient(token, {
    deadline,
    fetch: dependencies.fetch,
    sleep: dependencies.sleep,
    signal: dependencies.signal,
    requestTimeoutMs: limits.requestTimeoutMs,
    maxAttempts: limits.maxAttempts,
    maxRetryAfterMs: limits.maxRetryAfterMs,
    maxResponseBytes: limits.maxResponseBytes,
  });
  const budget = new RequestBudget(limits.maxRequests);
  const tracker: Tracker = { success: 0, unsupported: 0, failed: 0, codes: [] };
  const schemaTracker: Tracker = { success: 0, unsupported: 0, failed: 0, codes: [] };
  const errors: string[] = [];
  const addError = (entry: string) => {
    if (errors.length < limits.maxErrors && !errors.includes(entry)) errors.push(entry);
  };
  const items: KqlItemEvidence[] = [];
  const config: KqlConfigEntry[] = [];
  const schemas: Record<string, KqlDatabaseSchema> = {};
  const artifactMetadata: Record<string, KqlArtifactMetadata> = {};
  let stopCode: KqlMetadataStatusCode | undefined;
  let usedSchemaBytes = 0;

  const preStop = (section: "kqlProperties" | "kqlSchema", target: Tracker): void => {
    if (stopCode) return;
    let code: KqlMetadataStatusCode | undefined;
    if (dependencies.signal?.aborted) code = "cancelled";
    else if (deadline.remaining() <= limits.minItemStartMs) code = "deadline-exhausted";
    else if (budget.remaining === 0) code = "request-budget-exhausted";
    if (code) {
      stopCode = code;
      track(target, "failed", code);
      addError(`${section}: ${code}`);
    }
  };

  const collectSchema = async (item: KqlMetadataItemInput): Promise<KqlDatabaseSchema> => {
    preStop("kqlSchema", schemaTracker);
    if (stopCode) {
      track(schemaTracker, "failed", "not-attempted");
      return { status: "failed", code: "not-attempted" };
    }
    try {
      const response = await client.postLongRunning(
        `/v1/workspaces/${request.workspaceId}/kqlDatabases/${item.id}/getDefinition`,
        {
          maxPolls: limits.maxLroPolls,
          minPollDelayMs: limits.minPollDelayMs,
          maxPollDelayMs: limits.maxPollDelayMs,
          maxResponseBytes: limits.maxDefinitionResponseBytes,
        },
        budget,
      );
      const schema = projectKqlSchema(response);
      if (schema.status !== "complete") {
        track(schemaTracker, "unsupported", schema.code);
        return schema;
      }
      const size = byteLength(schema);
      if (usedSchemaBytes + size > limits.maxSchemaBytes) {
        // The aggregate schema budget is spent; later items are not attempted.
        stopCode = "response-size-exceeded";
        track(schemaTracker, "failed", stopCode);
        addError(`kqlSchema:${item.id}: ${stopCode}`);
        return { status: "failed", code: stopCode };
      }
      usedSchemaBytes += size;
      track(schemaTracker, "success", schema.code);
      return schema;
    } catch (error) {
      const code = schemaErrorCode(error);
      const unsupported = SCHEMA_UNSUPPORTED_CODES.has(code);
      track(schemaTracker, unsupported ? "unsupported" : "failed", code);
      if (!unsupported) addError(`kqlSchema:${item.id}: ${code}`);
      if (STOP_CODES.has(code)) stopCode = code;
      return { status: unsupported ? "unsupported" : "failed", code };
    }
  };

  for (const item of request.items) {
    const route = KQL_PROPERTY_ROUTES.get(item.type);
    if (!route) {
      const code = KQL_ITEMS_WITHOUT_PROPERTIES.has(item.type)
        ? "no-structural-properties"
        : "item-type-unsupported";
      items.push({ ...item, status: "unsupported", code });
      track(tracker, "unsupported", code);
      continue;
    }
    preStop("kqlProperties", tracker);
    if (stopCode) {
      items.push({ ...item, status: "failed", code: "not-attempted" });
      track(tracker, "failed", "not-attempted");
      if (item.type === "KQLDatabase") {
        track(schemaTracker, "failed", "not-attempted");
        schemas[item.id] = { status: "failed", code: "not-attempted" };
      }
      continue;
    }
    try {
      const response = await client.getObject(`/v1/workspaces/${request.workspaceId}/${route}/${item.id}`, budget);
      if (item.type === "Eventhouse") {
        const projection = projectEventhouse(response, request, item, limits.maxDatabaseItemIds);
        items.push({ ...item, status: "complete", eventhouse: projection.properties });
        config.push(...projection.config);
        track(tracker, "success");
      } else {
        const projection = projectKqlDatabase(response, request, item);
        track(tracker, "success");
        const schema = await collectSchema(item);
        items.push({ ...item, status: "complete", kqlDatabase: projection.properties });
        schemas[item.id] = schema;
        config.push(...projection.config, ...schemaConfig(item.id, schema));
        if (schema.status === "complete") {
          artifactMetadata[item.id] = {
            kind: "kql",
            functions: schema.functions ?? [],
            materializedViews: (schema.materializedViews ?? []).map((view) => ({ ...view, columns: [] })),
          };
        }
      }
    } catch (error) {
      const code = fabricSafeErrorCode(error, true);
      const unsupported = code === "endpoint-unsupported";
      items.push({ ...item, status: unsupported ? "unsupported" : "failed", code });
      track(tracker, unsupported ? "unsupported" : "failed", code);
      if (item.type === "KQLDatabase") {
        // Without validated properties the schema is not requested.
        const schemaCode: KqlMetadataStatusCode = unsupported ? code : "not-attempted";
        track(schemaTracker, unsupported ? "unsupported" : "failed", schemaCode);
        schemas[item.id] = { status: unsupported ? "unsupported" : "failed", code: schemaCode };
      }
      if (!unsupported) addError(`kqlProperties:${item.id}: ${code}`);
      if (STOP_CODES.has(code)) stopCode = code;
    }
  }

  const kqlSchema = finishSection(schemaTracker);
  const envelope: KqlMetadataStageEnvelope = {
    contractVersion: 1,
    stage: "kql-metadata",
    authoritative: false,
    ...(request.correlationId ? { correlationId: request.correlationId } : {}),
    workspaceId: request.workspaceId,
    items,
    schemas,
    artifactMetadata,
    config,
    sections: { kqlProperties: finishSection(tracker), kqlSchema },
    capabilities: { kqlSchema: { ...kqlSchema } },
    blockers: [{ ...KQL_DATA_PLANE_BLOCKER }],
    errors,
    syncedAt: new Date().toISOString(),
  };
  if (byteLength(envelope) > limits.maxEnvelopeBytes) {
    throw new Error(RESPONSE_TOO_LARGE_MESSAGE);
  }
  return envelope;
}

export async function workspaceCollectKqlMetadata(
  ctx: RayfinContext<AtlasSchema, AudienceType.Fabric>,
  protocolVersion: unknown,
  workspaceId: unknown,
  items: unknown,
  correlationId: unknown,
  dependencies?: CollectKqlMetadataDependencies,
): Promise<KqlMetadataStageEnvelope> {
  const request = validateCollectKqlMetadataInput(protocolVersion, workspaceId, items, correlationId);
  await requireAtlasSynchronizer(ctx.getDataClient(), "KQL metadata collection", AUTHORIZATION_MESSAGE);
  let token: string;
  try {
    token = ctx.Tokens.Fabric;
  } catch {
    throw new Error(TOKEN_UNAVAILABLE_MESSAGE);
  }
  return collectWorkspaceKqlMetadata(token, request, dependencies);
}
