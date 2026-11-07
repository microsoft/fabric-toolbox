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

/*
 * Read-only source-provenance stage. It projects three documented Fabric
 * contracts into metadata-only provenance evidence:
 * - OneLake shortcuts (`GET /items/{id}/shortcuts`) for Lakehouse, Warehouse
 *   and KQL Database items, keeping explicit OneLake target IDs and only the
 *   connection ID of external targets.
 * - Mirrored databases: item properties, `mirroring.json` from getDefinition
 *   and getMirroringStatus, keeping provider type and explicit connection or
 *   Fabric item IDs.
 * - Materialized lake view execution definitions under a Lakehouse, keeping
 *   selected view names and lakehouse references by ID.
 * It never stores external URLs, buckets, subpaths, source database names or
 * credentials, never resolves anything by name, writes no Rayfin rows and is
 * marked non-authoritative.
 */

export const SOURCE_PROVENANCE_STAGE = "source-provenance";
export const SHORTCUT_ITEM_TYPES: ReadonlySet<string> = new Set([
  "Lakehouse",
  "Warehouse",
  "KQLDatabase",
]);
export const MIRRORING_ITEM_TYPES: ReadonlySet<string> = new Set(["MirroredDatabase"]);
export const MLV_ITEM_TYPES: ReadonlySet<string> = new Set(["Lakehouse"]);

export const COLLECT_SOURCE_PROVENANCE_LIMITS = {
  ...FABRIC_REST_DEFAULTS,
  // Leaves headroom below the 200-240 second Fabric Functions execution limit.
  executionBudgetMs: 150_000,
  maxItems: 16,
  maxRequests: 160,
  maxListPages: 20,
  maxShortcutsPerItem: 1_000,
  maxMlvDefinitionsPerItem: 200,
  maxSelectedPerDefinition: 500,
  maxMountedTables: 2_000,
  maxExternalStorages: 16,
  maxLroPolls: 12,
  minPollDelayMs: 1_000,
  maxPollDelayMs: 5_000,
  maxDefinitionResponseBytes: 4 * 1024 * 1024,
  maxDecodedPartBytes: 2 * 1024 * 1024,
  minItemStartMs: 10_000,
  // Hard final guard below the 30 MiB Functions response limit.
  maxEnvelopeBytes: 16 * 1024 * 1024,
} as const;

export type CollectSourceProvenanceLimits = {
  [Name in keyof typeof COLLECT_SOURCE_PROVENANCE_LIMITS]: number;
};

export interface CollectSourceProvenanceDependencies {
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  wallClock?: () => number;
  signal?: AbortSignal;
  limits?: Partial<CollectSourceProvenanceLimits>;
}

export type SourceProvenanceItemInput = { id: string; type: string };
// A named alias keeps the SDK from coercing or echoing the raw input; the strict validator owns it.
export type SourceProvenanceItemsInput = SourceProvenanceItemInput[];

export interface CollectSourceProvenanceRequest {
  workspaceId: string;
  correlationId: string | null;
  items: SourceProvenanceItemInput[];
}

export type SourceProvenanceCode =
  | FabricSafeErrorCode
  | "read-write-permission-required"
  | "item-type-unsupported"
  | "invalid-definition"
  | "not-attempted"
  | "projection-truncated"
  | "partial-unsupported"
  | "not-applicable";

export interface SourceProvenanceStatus {
  status: "complete" | "unsupported" | "failed";
  code?: SourceProvenanceCode;
}

export interface OneLakeShortcutTarget {
  workspaceId: string;
  itemId: string;
  /** Path inside the target item, for example `Tables/sales`. */
  path?: string;
}

export interface ShortcutProvenance {
  name: string;
  /** Location of the shortcut inside the consuming item. */
  path: string;
  /** Verbatim target type, for example `OneLake` or `AdlsGen2`. */
  targetType: string;
  oneLake?: OneLakeShortcutTarget;
  /** External targets keep only the Fabric connection ID; never the URL. */
  connectionId?: string;
  transformType?: string;
  /** OneDrive/SharePoint shortcut asked Fabric to align the item label with the site label. */
  sensitivityLabelSyncRequested?: boolean;
}

export interface ShortcutSection extends SourceProvenanceStatus {
  shortcuts: ShortcutProvenance[];
  truncated: boolean;
}

export interface MirroringConnection {
  type: string;
  connectionId: string;
}

export interface MirroringLandingZone {
  type: string;
  connectionId?: string;
  workspaceId: string;
  itemId: string;
}

export interface MirroredTable {
  schema: string;
  table: string;
}

export interface MirroringDefinition {
  /** Verbatim provider type, for example `Oracle` or `Snowflake`. */
  sourceType: string;
  sourceSubType?: string;
  connectionId?: string;
  externalStorages: MirroringConnection[];
  landingZone?: MirroringLandingZone;
  targetType?: string;
  targetFormat?: string;
  defaultSchema?: string;
  retentionInDays?: number;
  changeDataFeed?: boolean;
  /** `all` when the definition omits `mountedTables` and new tables are added automatically. */
  tableSelection: "all" | "selected";
  tables: MirroredTable[];
  tablesTruncated: boolean;
}

/** Flattened so the generated client contract keeps every nested field typed. */
export interface MirroringDefinitionSection extends SourceProvenanceStatus {
  sourceType?: string;
  sourceSubType?: string;
  connectionId?: string;
  externalStorages: MirroringConnection[];
  landingZone?: MirroringLandingZone;
  targetType?: string;
  targetFormat?: string;
  defaultSchema?: string;
  retentionInDays?: number;
  changeDataFeed?: boolean;
  tableSelection?: "all" | "selected";
  tables: MirroredTable[];
  tablesTruncated: boolean;
}

export interface MirroringPropertiesSection extends SourceProvenanceStatus {
  sqlEndpointId?: string;
  defaultSchema?: string;
}

export interface MirroringReplicationSection extends SourceProvenanceStatus {
  state?: string;
}

export interface MirroringSection extends SourceProvenanceStatus {
  properties: MirroringPropertiesSection;
  definition: MirroringDefinitionSection;
  replication: MirroringReplicationSection;
}

export interface MlvItemReference {
  workspaceId: string;
  itemId: string;
}

export interface MlvExecutionDefinitionProvenance {
  id: string;
  displayName: string;
  refreshMode?: string;
  /** `All` covers every view in the lakehouse; `Selected` lists fully qualified names. */
  viewSelection: string;
  selectedViews: string[];
  lineageSelection?: string;
  lakehouses: MlvItemReference[];
  /** References by Variable Library variable are counted but never resolved. */
  variableReferences: number;
  environment?: MlvItemReference;
  truncated: boolean;
}

export interface MlvSection extends SourceProvenanceStatus {
  definitions: MlvExecutionDefinitionProvenance[];
  truncated: boolean;
}

export interface SourceProvenanceItemEvidence extends SourceProvenanceStatus {
  id: string;
  type: string;
  shortcuts?: ShortcutSection;
  mirroring?: MirroringSection;
  materializedLakeViews?: MlvSection;
}

export interface SourceProvenanceStageEnvelope {
  contractVersion: 1;
  stage: typeof SOURCE_PROVENANCE_STAGE;
  /** Provenance evidence never authorizes snapshot publication. */
  authoritative: false;
  /** Present only when the caller supplied a correlation UUID. */
  correlationId?: string;
  workspaceId: string;
  collectedAt: string;
  items: SourceProvenanceItemEvidence[];
  summary: SourceProvenanceStatus;
  /** Why remaining work is `not-attempted`, when the batch stopped early. */
  stopCode?: SourceProvenanceCode;
}

const INVALID_INPUT_MESSAGE =
  "Use protocolVersion 1, a strict workspace UUID, 1-16 unique {id, type} items and a strict correlation UUID or null.";
const AUTHORIZATION_MESSAGE =
  "Source provenance collection requires the configured Atlas synchronizer.";
const TOKEN_UNAVAILABLE_MESSAGE = "The Fabric application token was unavailable.";
const RESPONSE_TOO_LARGE_MESSAGE =
  "Source provenance collection exceeded the safe response size.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ITEM_TYPE = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
const KIND = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
const UNSAFE_TEXT = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/u;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const MAX_NAME_LENGTH = 256;
const MAX_PATH_LENGTH = 1_024;
const STOP_CODES = new Set<SourceProvenanceCode>([
  "deadline-exhausted",
  "request-timeout",
  "retry-after-deferred",
  "rate-limited",
  "request-budget-exhausted",
  "cancelled",
]);
const UNSUPPORTED_CODES = new Set<SourceProvenanceCode>([
  "authorization-failed",
  "endpoint-unsupported",
  "read-write-permission-required",
  "encrypted-label-blocked",
  "not-applicable",
]);

class ProvenanceContractError extends Error {
  constructor() {
    super("Source provenance response violated the documented contract.");
    this.name = "ProvenanceContractError";
  }
}

function invalid(): never {
  throw new ProvenanceContractError();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function validateCollectSourceProvenanceInput(
  protocolVersion: unknown,
  workspaceId: unknown,
  items: unknown,
  correlationId: unknown,
): CollectSourceProvenanceRequest {
  try {
    if (
      protocolVersion !== 1 ||
      !Array.isArray(items) ||
      items.length < 1 ||
      items.length > COLLECT_SOURCE_PROVENANCE_LIMITS.maxItems
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

function uuid(value: unknown): string | undefined {
  return typeof value === "string" && value.length === 36 && UUID.test(value)
    ? value.toLowerCase()
    : undefined;
}

function requiredUuid(value: unknown): string {
  return uuid(value) ?? invalid();
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string" || UNSAFE_TEXT.test(value)) return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : undefined;
}

function kind(value: unknown): string | undefined {
  return typeof value === "string" && KIND.test(value) ? value : undefined;
}

/** `AdlsGen2` -> `adlsGen2`, the documented property name of each target type. */
function targetProperty(type: string): string {
  return `${type.charAt(0).toLowerCase()}${type.slice(1)}`;
}

/**
 * Projects one documented shortcut. OneLake targets keep explicit workspace
 * and item IDs. Every other target keeps only its connection ID, so location,
 * bucket, subpath, domain and table fields are never retained.
 */
export function projectShortcut(value: unknown): ShortcutProvenance {
  if (!isRecord(value) || !isRecord(value.target)) invalid();
  const name = text(value.name, MAX_NAME_LENGTH) ?? invalid();
  const path = text(value.path, MAX_PATH_LENGTH) ?? invalid();
  const targetType = kind(value.target.type) ?? invalid();
  const details = value.target[targetProperty(targetType)];
  const shortcut: ShortcutProvenance = { name, path, targetType };
  if (targetType === "OneLake") {
    if (details != null) {
      if (!isRecord(details)) invalid();
      const target: OneLakeShortcutTarget = {
        workspaceId: requiredUuid(details.workspaceId),
        itemId: requiredUuid(details.itemId),
      };
      const targetPath = text(details.path, MAX_PATH_LENGTH);
      if (targetPath) target.path = targetPath;
      shortcut.oneLake = target;
    }
  } else if (details != null) {
    if (!isRecord(details)) invalid();
    const connectionId = uuid(details.connectionId);
    if (connectionId) shortcut.connectionId = connectionId;
    if (targetType === "OneDriveSharePoint" && typeof details.updateFabricItemSensitivity === "boolean") {
      shortcut.sensitivityLabelSyncRequested = details.updateFabricItemSensitivity;
    }
  }
  if (isRecord(value.transform)) {
    const transformType = kind(value.transform.type);
    if (transformType) shortcut.transformType = transformType;
  } else if (value.isShortcutTransform === true) {
    shortcut.transformType = "unspecified";
  }
  return shortcut;
}

function decodeJsonPart(payload: unknown, maxBytes: number): Record<string, unknown> {
  if (typeof payload !== "string" || !payload || payload.length % 4 !== 0 || !BASE64.test(payload)) {
    invalid();
  }
  if ((payload.length / 4) * 3 > maxBytes + 2) invalid();
  let bytes: Uint8Array;
  try {
    const binary = atob(payload);
    bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  } catch {
    invalid();
  }
  if (bytes.byteLength > maxBytes) invalid();
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    invalid();
  }
  if (!isRecord(parsed)) invalid();
  return parsed;
}

function connection(value: unknown): MirroringConnection | undefined {
  if (!isRecord(value) || !isRecord(value.typeProperties)) return undefined;
  const type = kind(value.type);
  const connectionId = uuid(value.typeProperties.connection);
  return type && connectionId ? { type, connectionId } : undefined;
}

/**
 * Projects the documented `mirroring.json` part. The source database name,
 * landing-zone folder and any undocumented field are intentionally dropped.
 */
export function projectMirroringDefinition(
  response: unknown,
  limits: Pick<CollectSourceProvenanceLimits, "maxDecodedPartBytes" | "maxMountedTables" | "maxExternalStorages"> =
    COLLECT_SOURCE_PROVENANCE_LIMITS,
): MirroringDefinition {
  if (!isRecord(response) || !isRecord(response.definition) || !Array.isArray(response.definition.parts)) {
    invalid();
  }
  const part = response.definition.parts.find(
    (candidate: unknown) => isRecord(candidate) && candidate.path === "mirroring.json",
  );
  if (!isRecord(part) || part.payloadType !== "InlineBase64") invalid();
  const document = decodeJsonPart(part.payload, limits.maxDecodedPartBytes);
  const properties = isRecord(document.properties) ? document.properties : document;
  if (!isRecord(properties.source)) invalid();
  const source = properties.source;
  const sourceType = kind(source.type) ?? invalid();
  const sourceProperties = isRecord(source.typeProperties) ? source.typeProperties : {};
  const definition: MirroringDefinition = {
    sourceType,
    externalStorages: [],
    tableSelection: properties.mountedTables == null ? "all" : "selected",
    tables: [],
    tablesTruncated: false,
  };
  const subType = kind(sourceProperties.subType);
  if (subType) definition.sourceSubType = subType;
  const connectionId = uuid(sourceProperties.connection);
  if (connectionId) definition.connectionId = connectionId;
  if (Array.isArray(sourceProperties.externalStorages)) {
    for (const storage of sourceProperties.externalStorages.slice(0, limits.maxExternalStorages)) {
      const projected = connection(storage);
      if (projected) definition.externalStorages.push(projected);
    }
  }
  if (isRecord(sourceProperties.landingZone) && isRecord(sourceProperties.landingZone.typeProperties)) {
    const zone = sourceProperties.landingZone;
    const zoneProperties = sourceProperties.landingZone.typeProperties as Record<string, unknown>;
    const workspaceId = uuid(zoneProperties.workspaceId);
    const itemId = uuid(zoneProperties.artifactId);
    const type = kind(zone.type);
    if (workspaceId && itemId && type) {
      const landingZone: MirroringLandingZone = { type, workspaceId, itemId };
      const zoneConnection = uuid(zoneProperties.connection);
      if (zoneConnection) landingZone.connectionId = zoneConnection;
      definition.landingZone = landingZone;
    }
  }
  if (isRecord(properties.target)) {
    const targetType = kind(properties.target.type);
    if (targetType) definition.targetType = targetType;
    const targetProperties = isRecord(properties.target.typeProperties) ? properties.target.typeProperties : {};
    const format = kind(targetProperties.format);
    if (format) definition.targetFormat = format;
    const defaultSchema = text(targetProperties.defaultSchema, MAX_NAME_LENGTH);
    if (defaultSchema) definition.defaultSchema = defaultSchema;
    if (
      typeof targetProperties.retentionInDays === "number" &&
      Number.isInteger(targetProperties.retentionInDays) &&
      targetProperties.retentionInDays >= 0 &&
      targetProperties.retentionInDays <= 3_650
    ) {
      definition.retentionInDays = targetProperties.retentionInDays;
    }
    if (typeof targetProperties.enableDeltaChangeDataFeed === "boolean") {
      definition.changeDataFeed = targetProperties.enableDeltaChangeDataFeed;
    }
  }
  if (properties.mountedTables != null) {
    if (!Array.isArray(properties.mountedTables)) invalid();
    const seen = new Set<string>();
    for (const mounted of properties.mountedTables) {
      const typeProperties =
        isRecord(mounted) && isRecord(mounted.source) && isRecord(mounted.source.typeProperties)
          ? mounted.source.typeProperties
          : invalid();
      const schema = text(typeProperties.schemaName, MAX_NAME_LENGTH) ?? invalid();
      const table = text(typeProperties.tableName, MAX_NAME_LENGTH) ?? invalid();
      const key = `${schema}\u0000${table}`;
      if (seen.has(key)) continue;
      if (definition.tables.length >= limits.maxMountedTables) {
        definition.tablesTruncated = true;
        break;
      }
      seen.add(key);
      definition.tables.push({ schema, table });
    }
  }
  return definition;
}

function itemReference(value: unknown): MlvItemReference | "variable" | undefined {
  if (!isRecord(value)) return undefined;
  if (value.referenceType === "ByVariable") return "variable";
  if (value.referenceType !== "ById") return undefined;
  const workspaceId = uuid(value.workspaceId);
  const itemId = uuid(value.itemId);
  return workspaceId && itemId ? { workspaceId, itemId } : undefined;
}

/** Projects one documented MLV execution definition without its free-text description. */
export function projectMlvExecutionDefinition(
  value: unknown,
  maxSelected: number = COLLECT_SOURCE_PROVENANCE_LIMITS.maxSelectedPerDefinition,
): MlvExecutionDefinitionProvenance {
  if (!isRecord(value)) invalid();
  const projected: MlvExecutionDefinitionProvenance = {
    id: requiredUuid(value.id),
    displayName: text(value.displayName, MAX_NAME_LENGTH) ?? invalid(),
    viewSelection: "unspecified",
    selectedViews: [],
    lakehouses: [],
    variableReferences: 0,
    truncated: false,
  };
  if (isRecord(value.settings)) {
    const refreshMode = kind(value.settings.refreshMode);
    if (refreshMode) projected.refreshMode = refreshMode;
    const environment = itemReference(value.settings.environment);
    if (environment === "variable") projected.variableReferences += 1;
    else if (environment) projected.environment = environment;
  }
  if (isRecord(value.currentLakehouseExecutionContext)) {
    const context = value.currentLakehouseExecutionContext;
    projected.viewSelection = kind(context.mode) ?? "unspecified";
    if (Array.isArray(context.selectedMlvs)) {
      for (const name of context.selectedMlvs) {
        const view = text(name, MAX_NAME_LENGTH);
        if (!view) invalid();
        if (projected.selectedViews.length >= maxSelected) {
          projected.truncated = true;
          break;
        }
        if (!projected.selectedViews.includes(view)) projected.selectedViews.push(view);
      }
    }
  }
  if (isRecord(value.extendedLineageExecutionContext)) {
    const context = value.extendedLineageExecutionContext;
    const lineageSelection = kind(context.mode);
    if (lineageSelection) projected.lineageSelection = lineageSelection;
    if (Array.isArray(context.selectedLakehouses)) {
      const seen = new Set<string>();
      for (const reference of context.selectedLakehouses) {
        const resolved = itemReference(reference);
        if (resolved === "variable") {
          projected.variableReferences += 1;
          continue;
        }
        if (!resolved) invalid();
        const key = `${resolved.workspaceId}:${resolved.itemId}`;
        if (seen.has(key)) continue;
        if (projected.lakehouses.length >= maxSelected) {
          projected.truncated = true;
          break;
        }
        seen.add(key);
        projected.lakehouses.push(resolved);
      }
    }
  }
  return projected;
}

/** Fixed, credential-free status codes; permission denials are unsupported enrichment. */
export function sourceProvenanceErrorCode(error: unknown, definition = false): SourceProvenanceCode {
  if (error instanceof ProvenanceContractError) return "invalid-definition";
  if (!(error instanceof FabricRestError)) return "upstream-failure";
  if (error.code === "invalid-response") return "invalid-definition";
  if (definition && error.code === "upstream-http-error" && (error.status === 401 || error.status === 403)) {
    return "read-write-permission-required";
  }
  return fabricSafeErrorCode(error, true);
}

function status(code: SourceProvenanceCode | undefined, ok: boolean): SourceProvenanceStatus {
  if (ok) return code ? { status: "complete", code } : { status: "complete" };
  if (code && UNSUPPORTED_CODES.has(code)) return { status: "unsupported", code };
  return { status: "failed", code: code ?? "upstream-failure" };
}

function combine(statuses: SourceProvenanceStatus[]): SourceProvenanceStatus {
  if (!statuses.length) return { status: "unsupported", code: "not-applicable" };
  const failed = statuses.find((entry) => entry.status === "failed");
  if (failed) return { status: "failed", code: failed.code ?? "upstream-failure" };
  const complete = statuses.filter((entry) => entry.status === "complete");
  if (complete.length === statuses.length) {
    const code = complete.find((entry) => entry.code)?.code;
    return code ? { status: "complete", code } : { status: "complete" };
  }
  if (complete.length) return { status: "complete", code: "partial-unsupported" };
  return { status: "unsupported", code: statuses[0].code ?? "endpoint-unsupported" };
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/** Collects bounded, metadata-only provenance with an application-identity token. */
export async function collectWorkspaceSourceProvenance(
  token: string,
  request: CollectSourceProvenanceRequest,
  dependencies: CollectSourceProvenanceDependencies = {},
): Promise<SourceProvenanceStageEnvelope> {
  if (typeof token !== "string" || !token || /\s/.test(token)) {
    throw new Error(TOKEN_UNAVAILABLE_MESSAGE);
  }
  const limits: CollectSourceProvenanceLimits = {
    ...COLLECT_SOURCE_PROVENANCE_LIMITS,
    ...dependencies.limits,
  };
  const wallClock = dependencies.wallClock ?? Date.now;
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
  const base = `/v1/workspaces/${request.workspaceId}`;
  let stopCode: SourceProvenanceCode | undefined;

  const checkStop = () => {
    if (stopCode) return;
    if (dependencies.signal?.aborted) stopCode = "cancelled";
    else if (deadline.remaining() <= limits.minItemStartMs) stopCode = "deadline-exhausted";
    else if (budget.remaining === 0) stopCode = "request-budget-exhausted";
  };
  const notAttempted = (): SourceProvenanceStatus => ({ status: "failed", code: "not-attempted" });
  const fail = (error: unknown, definition = false): SourceProvenanceStatus => {
    const code = sourceProvenanceErrorCode(error, definition);
    if (STOP_CODES.has(code)) stopCode = code;
    return status(code, false);
  };

  const collectShortcuts = async (itemId: string): Promise<ShortcutSection> => {
    checkStop();
    if (stopCode) return { ...notAttempted(), shortcuts: [], truncated: false };
    try {
      const records = await client.list(
        `${base}/items/${itemId}/shortcuts`,
        {
          maxPages: limits.maxListPages,
          maxRecords: limits.maxShortcutsPerItem + 1,
          stopAfter: limits.maxShortcutsPerItem + 1,
        },
        budget,
      );
      const truncated = records.length > limits.maxShortcutsPerItem;
      const shortcuts = records.slice(0, limits.maxShortcutsPerItem).map(projectShortcut);
      return { ...status(truncated ? "projection-truncated" : undefined, true), shortcuts, truncated };
    } catch (error) {
      return { ...fail(error), shortcuts: [], truncated: false };
    }
  };

  const collectMirroring = async (itemId: string): Promise<MirroringSection> => {
    const route = `${base}/mirroredDatabases/${itemId}`;
    const emptyDefinition = (state: SourceProvenanceStatus): MirroringDefinitionSection => ({
      ...state,
      externalStorages: [],
      tables: [],
      tablesTruncated: false,
    });
    const section: MirroringSection = {
      status: "failed",
      properties: notAttempted(),
      definition: emptyDefinition(notAttempted()),
      replication: notAttempted(),
    };
    checkStop();
    if (!stopCode) {
      try {
        const item = await client.getObject(route, budget);
        if (!isRecord(item.properties)) invalid();
        const properties: MirroringPropertiesSection = { status: "complete" };
        if (isRecord(item.properties.sqlEndpointProperties)) {
          const sqlEndpointId = uuid(item.properties.sqlEndpointProperties.id);
          if (sqlEndpointId) properties.sqlEndpointId = sqlEndpointId;
        }
        const defaultSchema = text(item.properties.defaultSchema, MAX_NAME_LENGTH);
        if (defaultSchema) properties.defaultSchema = defaultSchema;
        section.properties = properties;
      } catch (error) {
        section.properties = fail(error);
      }
    }
    checkStop();
    if (!stopCode) {
      try {
        const response = await client.postLongRunning(
          `${route}/getDefinition`,
          {
            maxPolls: limits.maxLroPolls,
            minPollDelayMs: limits.minPollDelayMs,
            maxPollDelayMs: limits.maxPollDelayMs,
            maxResponseBytes: limits.maxDefinitionResponseBytes,
          },
          budget,
        );
        const value = projectMirroringDefinition(response, limits);
        section.definition = {
          ...status(value.tablesTruncated ? "projection-truncated" : undefined, true),
          ...value,
        };
      } catch (error) {
        section.definition = emptyDefinition(fail(error, true));
      }
    }
    checkStop();
    if (!stopCode) {
      try {
        const response = await client.postLongRunning(
          `${route}/getMirroringStatus`,
          { maxPolls: 2, minPollDelayMs: limits.minPollDelayMs, maxPollDelayMs: limits.maxPollDelayMs },
          budget,
        );
        const state = kind(response.status) ?? invalid();
        section.replication = { status: "complete", state };
      } catch (error) {
        section.replication = fail(error);
      }
    }
    Object.assign(section, combine([section.properties, section.definition, section.replication]));
    return section;
  };

  const collectMlv = async (itemId: string): Promise<MlvSection> => {
    checkStop();
    if (stopCode) return { ...notAttempted(), definitions: [], truncated: false };
    try {
      const records = await client.list(
        `${base}/lakehouses/${itemId}/mlvexecutiondefinitions`,
        {
          maxPages: limits.maxListPages,
          maxRecords: limits.maxMlvDefinitionsPerItem + 1,
          stopAfter: limits.maxMlvDefinitionsPerItem + 1,
        },
        budget,
      );
      const definitions = records
        .slice(0, limits.maxMlvDefinitionsPerItem)
        .map((record) => projectMlvExecutionDefinition(record, limits.maxSelectedPerDefinition));
      const truncated =
        records.length > limits.maxMlvDefinitionsPerItem ||
        definitions.some((definition) => definition.truncated);
      return {
        ...status(truncated ? "projection-truncated" : undefined, true),
        definitions,
        truncated,
      };
    } catch (error) {
      return { ...fail(error), definitions: [], truncated: false };
    }
  };

  const items: SourceProvenanceItemEvidence[] = [];
  for (const item of request.items) {
    const evidence: SourceProvenanceItemEvidence = { ...item, status: "unsupported" };
    const sections: SourceProvenanceStatus[] = [];
    if (SHORTCUT_ITEM_TYPES.has(item.type)) {
      evidence.shortcuts = await collectShortcuts(item.id);
      sections.push(evidence.shortcuts);
    }
    if (MLV_ITEM_TYPES.has(item.type)) {
      evidence.materializedLakeViews = await collectMlv(item.id);
      sections.push(evidence.materializedLakeViews);
    }
    if (MIRRORING_ITEM_TYPES.has(item.type)) {
      evidence.mirroring = await collectMirroring(item.id);
      sections.push(evidence.mirroring);
    }
    const summary: SourceProvenanceStatus = sections.length
      ? combine(sections)
      : { status: "unsupported", code: "item-type-unsupported" };
    items.push({
      ...evidence,
      status: summary.status,
      ...(summary.code ? { code: summary.code } : {}),
    });
  }

  const envelope: SourceProvenanceStageEnvelope = {
    contractVersion: 1,
    stage: SOURCE_PROVENANCE_STAGE,
    authoritative: false,
    ...(request.correlationId ? { correlationId: request.correlationId } : {}),
    workspaceId: request.workspaceId,
    collectedAt: new Date(wallClock()).toISOString(),
    items,
    summary: combine(items.filter((item) => item.code !== "item-type-unsupported")),
    ...(stopCode ? { stopCode } : {}),
  };
  if (byteLength(envelope) > limits.maxEnvelopeBytes) {
    throw new Error(RESPONSE_TOO_LARGE_MESSAGE);
  }
  return envelope;
}

export async function workspaceCollectSourceProvenance(
  ctx: RayfinContext<AtlasSchema, AudienceType.Fabric>,
  protocolVersion: unknown,
  workspaceId: unknown,
  items: unknown,
  correlationId: unknown,
  dependencies?: CollectSourceProvenanceDependencies,
): Promise<SourceProvenanceStageEnvelope> {
  const request = validateCollectSourceProvenanceInput(protocolVersion, workspaceId, items, correlationId);
  await requireAtlasSynchronizer(
    ctx.getDataClient(),
    "source provenance collection",
    AUTHORIZATION_MESSAGE,
  );
  let token: string;
  try {
    token = ctx.Tokens.Fabric;
  } catch {
    throw new Error(TOKEN_UNAVAILABLE_MESSAGE);
  }
  return collectWorkspaceSourceProvenance(token, request, dependencies);
}
