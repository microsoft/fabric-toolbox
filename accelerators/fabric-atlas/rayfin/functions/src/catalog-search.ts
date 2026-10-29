import {
  AudienceType,
  type RayfinContext,
} from "@microsoft/fabric-user-data-functions";
import type { AtlasSchema } from "../../data/schema.js";
import {
  ExecutionDeadline,
  FabricRestClient,
  FabricRestError,
  RequestBudget,
} from "./fabric-rest.js";
import { requireAtlasSynchronizer } from "./synchronizer-gate.js";

/*
 * Optional OneLake Catalog Search (Preview) discovery. The Function calls only
 * the fixed `POST /v1/catalog/search` endpoint with the Fabric application
 * identity after the SynchronizerAuthority gate. It returns allowlisted catalog
 * metadata, never business rows, writes nothing and is never authoritative:
 * an absent search result must not remove or contradict snapshot evidence.
 */

export const CATALOG_SEARCH_SOURCE = "onelake-catalog-search";
export const CATALOG_SEARCH_API_VERSION = "v1-preview";
export const CATALOG_SEARCH_PATH = "/v1/catalog/search";

/** Documented `ItemType` values plus `Workspace`, verified 2026-10-02. */
export const CATALOG_SEARCH_FILTER_TYPES = [
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
  "Workspace",
] as const;

export const CATALOG_SEARCH_INPUT_LIMITS = {
  maxSearchLength: 200,
  minPageSize: 1,
  // Below the API maximum of 1000 so one page stays small and interactive.
  maxPageSize: 50,
  defaultPageSize: 25,
  // Documented API maximum for WorkspaceId filter values.
  maxWorkspaceIds: 12,
  maxItemTypes: CATALOG_SEARCH_FILTER_TYPES.length,
  maxContinuationTokenLength: 4_096,
} as const;

export const CATALOG_SEARCH_LIMITS = {
  // Interactive search; far below the 200-240 second Functions limit.
  executionBudgetMs: 45_000,
  requestTimeoutMs: 15_000,
  // One request plus at most two retries for throttling or transient failures.
  maxAttempts: 3,
  maxRetryAfterMs: 5_000,
  maxPages: 4,
  // maxPages * maxPageSize, so a page never needs to be split.
  maxResults: 200,
  // Hard guard when a continuation carries a larger page size.
  maxEntriesPerPage: 100,
  maxPageBytes: 1024 * 1024,
  minPageStartMs: 3_000,
  maxEnvelopeBytes: 2 * 1024 * 1024,
} as const;

export type CatalogSearchLimits = {
  [Name in keyof typeof CATALOG_SEARCH_LIMITS]: number;
};

// Named input aliases let the strict validator inspect raw values without SDK coercion.
export type CatalogSearchTextInput = string;
export type CatalogSearchItemTypesInput = string[];
export type CatalogSearchWorkspaceIdsInput = string[];
export type CatalogSearchPageSizeInput = number;
export type CatalogSearchContinuationInput = string;

export type CatalogSearchFailureCode =
  | "invalid-input"
  | "not-authorized"
  | "token-unavailable"
  | "permission-denied"
  | "rejected-request"
  | "throttled"
  | "timeout"
  | "unavailable"
  | "malformed-response"
  | "response-too-large"
  | "cancelled";

export type CatalogSearchStopReason =
  | "page-limit"
  | "deadline-exhausted"
  | "result-limit"
  | "failure";

export interface CatalogSearchRequest {
  search: string | null;
  itemTypes: string[];
  workspaceIds: string[];
  pageSize: number | null;
  continuationToken: string | null;
}

/** One allowlisted catalog entry. Unknown upstream fields are dropped. */
export interface CatalogSearchEntry {
  /** Stable `{entry kind}:{lowercase id}` key for de-duplication and navigation. */
  key: string;
  id: string;
  /** Verbatim `catalogEntryType`; future values are preserved. */
  catalogEntryType: string;
  /** Verbatim Fabric item type or `Workspace`; future values are preserved. */
  type: string;
  displayName: string;
  description?: string;
  workspaceId?: string;
  workspaceDisplayName?: string;
}

export interface CatalogSearchCoverage {
  pagesFetched: number;
  entriesReceived: number;
  entriesReturned: number;
  /** Entries dropped because they violated the allowlisted entry contract. */
  entriesSkipped: number;
  duplicatesDropped: number;
  descriptionsTruncated: number;
  /** A continuation token is returned and more entries can be requested. */
  moreAvailable: boolean;
  stopReason?: CatalogSearchStopReason;
}

export interface CatalogSearchScope {
  search: string | null;
  itemTypes: string[];
  workspaceIds: string[];
  pageSize: number | null;
  continued: boolean;
}

export interface CatalogSearchEnvelope {
  contractVersion: 1;
  source: typeof CATALOG_SEARCH_SOURCE;
  apiVersion: typeof CATALOG_SEARCH_API_VERSION;
  /** Discovery evidence never replaces or deletes snapshot evidence. */
  authoritative: false;
  /** Results are permission-filtered for the Atlas application identity. */
  identity: "fabric-application";
  /** `complete`: every attempted page succeeded; see `coverage.moreAvailable`. */
  status: "complete" | "partial" | "failed";
  failureCode?: CatalogSearchFailureCode;
  retryable: boolean;
  searchedAt: string;
  scope?: CatalogSearchScope;
  entries: CatalogSearchEntry[];
  coverage: CatalogSearchCoverage;
  continuationToken: string | null;
}

export interface CatalogSearchDependencies {
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  wallClock?: () => number;
  signal?: AbortSignal;
  limits?: Partial<CatalogSearchLimits>;
}

const AUTHORIZATION_MESSAGE =
  "Catalog Search requires the configured Atlas synchronizer.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTINUATION_TOKEN = /^[\x21-\x7E]+$/;
// C0/C1 controls and bidirectional overrides are never forwarded.
const UNSAFE_TEXT = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/u;
const SEARCHABLE = /[\p{L}\p{N}]/u;
const ENTRY_KIND = /^[A-Za-z][A-Za-z0-9]{0,49}$/;
// Workload Hub items report dotted types such as `Publisher.Workload.ItemType`.
const ITEM_TYPE = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*){0,4}$/;
const MAX_ITEM_TYPE_LENGTH = 100;
const MAX_DISPLAY_NAME_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 500;
const FILTER_TYPES = new Set<string>(CATALOG_SEARCH_FILTER_TYPES);

class CatalogInputError extends Error {}
class CatalogContractError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value) || value.length > max) throw new CatalogInputError();
  return value.map((entry: unknown) => {
    if (typeof entry !== "string") throw new CatalogInputError();
    return entry;
  });
}

function unique(values: string[]): string[] {
  if (new Set(values).size !== values.length) throw new CatalogInputError();
  return values;
}

/**
 * Strict input contract. A continuation token already carries search, filter
 * and page size, so it must be sent alone, exactly as the API requires.
 */
export function validateCatalogSearchInput(
  protocolVersion: unknown,
  search: unknown,
  itemTypes: unknown,
  workspaceIds: unknown,
  pageSize: unknown,
  continuationToken: unknown,
): CatalogSearchRequest {
  const limits = CATALOG_SEARCH_INPUT_LIMITS;
  if (protocolVersion !== 1) throw new CatalogInputError();
  const types = unique(stringArray(itemTypes, limits.maxItemTypes));
  if (types.some((type) => !FILTER_TYPES.has(type))) throw new CatalogInputError();
  const workspaces = unique(
    stringArray(workspaceIds, limits.maxWorkspaceIds).map((id) => {
      if (id.length !== 36 || !UUID.test(id)) throw new CatalogInputError();
      return id.toLowerCase();
    }),
  );
  if (
    pageSize !== null &&
    (typeof pageSize !== "number" ||
      !Number.isInteger(pageSize) ||
      pageSize < limits.minPageSize ||
      pageSize > limits.maxPageSize)
  ) {
    throw new CatalogInputError();
  }

  if (continuationToken !== null) {
    if (
      typeof continuationToken !== "string" ||
      continuationToken.length > limits.maxContinuationTokenLength ||
      !CONTINUATION_TOKEN.test(continuationToken) ||
      search !== null ||
      types.length > 0 ||
      workspaces.length > 0 ||
      pageSize !== null
    ) {
      throw new CatalogInputError();
    }
    return {
      search: null,
      itemTypes: [],
      workspaceIds: [],
      pageSize: null,
      continuationToken,
    };
  }

  if (typeof search !== "string" || UNSAFE_TEXT.test(search)) {
    throw new CatalogInputError();
  }
  const text = search.trim().replace(/\s+/g, " ");
  if (!text || text.length > limits.maxSearchLength || !SEARCHABLE.test(text)) {
    throw new CatalogInputError();
  }
  return {
    search: text,
    itemTypes: types,
    workspaceIds: workspaces,
    pageSize,
    continuationToken: null,
  };
}

/** Builds the documented filter from allowlisted types and strict UUIDs only. */
export function catalogSearchFilter(
  itemTypes: readonly string[],
  workspaceIds: readonly string[],
): string | undefined {
  const groups: string[] = [];
  if (itemTypes.length) {
    groups.push(`(${itemTypes.map((type) => `Type eq '${type}'`).join(" or ")})`);
  }
  if (workspaceIds.length) {
    groups.push(
      `(${workspaceIds.map((id) => `WorkspaceId eq '${id}'`).join(" or ")})`,
    );
  }
  return groups.length ? groups.join(" and ") : undefined;
}

export function catalogSearchRequestBody(
  request: CatalogSearchRequest,
): Record<string, unknown> {
  if (request.continuationToken !== null) {
    return { continuationToken: request.continuationToken };
  }
  const filter = catalogSearchFilter(request.itemTypes, request.workspaceIds);
  return {
    search: request.search,
    pageSize: request.pageSize ?? CATALOG_SEARCH_INPUT_LIMITS.defaultPageSize,
    ...(filter ? { filter } : {}),
  };
}

function safeText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string" || UNSAFE_TEXT.test(value)) return undefined;
  const text = value.trim();
  return text && text.length <= max ? text : undefined;
}

function entryKey(catalogEntryType: string, id: string): string {
  if (catalogEntryType === "FabricItem") return `item:${id}`;
  if (catalogEntryType === "Workspace") return `workspace:${id}`;
  return `entry:${catalogEntryType.toLowerCase()}:${id}`;
}

interface SanitizedEntry {
  entry: CatalogSearchEntry;
  descriptionTruncated: boolean;
}

/** Returns `undefined` for an entry that violates the allowlisted contract. */
export function sanitizeCatalogEntry(value: unknown): SanitizedEntry | undefined {
  if (!isRecord(value)) return undefined;
  const id =
    typeof value.id === "string" && value.id.length === 36 && UUID.test(value.id)
      ? value.id.toLowerCase()
      : undefined;
  const catalogEntryType =
    typeof value.catalogEntryType === "string" &&
    ENTRY_KIND.test(value.catalogEntryType)
      ? value.catalogEntryType
      : undefined;
  const type =
    typeof value.type === "string" &&
    value.type.length <= MAX_ITEM_TYPE_LENGTH &&
    ITEM_TYPE.test(value.type)
      ? value.type
      : undefined;
  const displayName = safeText(value.displayName, MAX_DISPLAY_NAME_LENGTH);
  if (!id || !catalogEntryType || !type || !displayName) return undefined;

  let description: string | undefined;
  let descriptionTruncated = false;
  if (value.description != null) {
    if (typeof value.description !== "string") return undefined;
    const text = value.description.replace(/[\p{Cc}\u202A-\u202E\u2066-\u2069]+/gu, " ").trim();
    if (text) {
      descriptionTruncated = text.length > MAX_DESCRIPTION_LENGTH;
      description = descriptionTruncated
        ? `${text.slice(0, MAX_DESCRIPTION_LENGTH - 1).trimEnd()}…`
        : text;
    }
  }

  let workspaceId: string | undefined;
  let workspaceDisplayName: string | undefined;
  if (catalogEntryType === "Workspace") {
    workspaceId = id;
    workspaceDisplayName = displayName;
  } else if (value.hierarchy != null) {
    if (!isRecord(value.hierarchy)) return undefined;
    const workspace = value.hierarchy.workspace;
    if (workspace != null) {
      if (!isRecord(workspace)) return undefined;
      workspaceId =
        typeof workspace.id === "string" &&
        workspace.id.length === 36 &&
        UUID.test(workspace.id)
          ? workspace.id.toLowerCase()
          : undefined;
      workspaceDisplayName = safeText(
        workspace.displayName,
        MAX_DISPLAY_NAME_LENGTH,
      );
      if (!workspaceId || !workspaceDisplayName) return undefined;
    }
  }

  return {
    entry: {
      key: entryKey(catalogEntryType, id),
      id,
      catalogEntryType,
      type,
      displayName,
      ...(description ? { description } : {}),
      ...(workspaceId ? { workspaceId } : {}),
      ...(workspaceDisplayName ? { workspaceDisplayName } : {}),
    },
    descriptionTruncated,
  };
}

interface ParsedPage {
  values: unknown[];
  continuationToken: string | null;
}

export function parseCatalogSearchPage(
  payload: unknown,
  maxEntries: number = CATALOG_SEARCH_LIMITS.maxEntriesPerPage,
): ParsedPage {
  if (!isRecord(payload) || !Array.isArray(payload.value)) {
    throw new CatalogContractError();
  }
  if (payload.value.length > maxEntries) throw new CatalogContractError();
  const token = payload.continuationToken;
  if (token == null || token === "") {
    return { values: payload.value, continuationToken: null };
  }
  if (
    typeof token !== "string" ||
    token.length > CATALOG_SEARCH_INPUT_LIMITS.maxContinuationTokenLength ||
    !CONTINUATION_TOKEN.test(token)
  ) {
    throw new CatalogContractError();
  }
  return { values: payload.value, continuationToken: token };
}

export interface CatalogSearchFailure {
  code: CatalogSearchFailureCode;
  retryable: boolean;
}

/** Maps a transport or contract failure to the fixed, credential-free code set. */
export function catalogSearchFailure(error: unknown): CatalogSearchFailure {
  const fail = (code: CatalogSearchFailureCode, retryable = false) => ({ code, retryable });
  if (error instanceof CatalogContractError) return fail("malformed-response");
  if (!(error instanceof FabricRestError)) return fail("unavailable");
  switch (error.code) {
    case "cancelled":
      return fail("cancelled");
    case "deadline-exhausted":
    case "request-timeout":
      return fail("timeout", true);
    case "upstream-unreachable":
    case "request-budget-exhausted":
      return fail("unavailable", true);
    case "response-size-exceeded":
      return fail("response-too-large");
    case "invalid-response":
    case "pagination-invalid":
      return fail("malformed-response");
    case "retry-after-deferred":
    case "upstream-http-error": {
      const status = error.status ?? 0;
      if (status === 401 || status === 403) return fail("permission-denied");
      if (status === 429) return fail("throttled", true);
      if (status === 400 || status === 409 || status === 422) {
        return fail("rejected-request");
      }
      return fail("unavailable", status === 408 || status >= 500);
    }
    default:
      // Redirects and unexpected client errors do not improve on retry.
      return fail("unavailable");
  }
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function emptyCoverage(): CatalogSearchCoverage {
  return {
    pagesFetched: 0,
    entriesReceived: 0,
    entriesReturned: 0,
    entriesSkipped: 0,
    duplicatesDropped: 0,
    descriptionsTruncated: 0,
    moreAvailable: false,
  };
}

export function failedCatalogSearch(
  code: CatalogSearchFailureCode,
  searchedAt: string,
  scope?: CatalogSearchScope,
): CatalogSearchEnvelope {
  return {
    contractVersion: 1,
    source: CATALOG_SEARCH_SOURCE,
    apiVersion: CATALOG_SEARCH_API_VERSION,
    authoritative: false,
    identity: "fabric-application",
    status: "failed",
    failureCode: code,
    retryable: false,
    searchedAt,
    ...(scope ? { scope } : {}),
    entries: [],
    coverage: { ...emptyCoverage(), stopReason: "failure" },
    continuationToken: null,
  };
}

function scopeFor(request: CatalogSearchRequest): CatalogSearchScope {
  return {
    search: request.search,
    itemTypes: [...request.itemTypes],
    workspaceIds: [...request.workspaceIds],
    pageSize: request.pageSize,
    continued: request.continuationToken !== null,
  };
}

/** Runs one bounded Catalog Search invocation over at most `maxPages` pages. */
export async function runCatalogSearch(
  token: string,
  request: CatalogSearchRequest,
  dependencies: CatalogSearchDependencies = {},
): Promise<CatalogSearchEnvelope> {
  const limits: CatalogSearchLimits = {
    ...CATALOG_SEARCH_LIMITS,
    ...dependencies.limits,
  };
  const wallClock = dependencies.wallClock ?? Date.now;
  const searchedAt = new Date(wallClock()).toISOString();
  const scope = scopeFor(request);
  if (typeof token !== "string" || !token || /\s/.test(token)) {
    return failedCatalogSearch("token-unavailable", searchedAt, scope);
  }
  const deadline = new ExecutionDeadline(limits.executionBudgetMs, dependencies.now);
  const client = new FabricRestClient(token, {
    deadline,
    fetch: dependencies.fetch,
    sleep: dependencies.sleep,
    signal: dependencies.signal,
    requestTimeoutMs: limits.requestTimeoutMs,
    maxAttempts: limits.maxAttempts,
    maxRetryAfterMs: limits.maxRetryAfterMs,
    maxResponseBytes: limits.maxPageBytes,
  });
  const budget = new RequestBudget(limits.maxPages * limits.maxAttempts);
  const coverage = emptyCoverage();
  const entries = new Map<string, CatalogSearchEntry>();
  const seenTokens = new Set<string>(
    request.continuationToken ? [request.continuationToken] : [],
  );
  let body = catalogSearchRequestBody(request);
  let pendingToken = request.continuationToken;
  let failure: CatalogSearchFailure | undefined;

  for (let page = 0; ; page += 1) {
    if (page >= limits.maxPages) {
      coverage.stopReason = "page-limit";
      break;
    }
    if (dependencies.signal?.aborted) {
      failure = { code: "cancelled", retryable: false };
      break;
    }
    if (deadline.remaining() <= limits.minPageStartMs) {
      if (page === 0) failure = { code: "timeout", retryable: true };
      else coverage.stopReason = "deadline-exhausted";
      break;
    }
    let parsed: ParsedPage;
    try {
      parsed = parseCatalogSearchPage(
        await client.postJson(CATALOG_SEARCH_PATH, body, budget, limits.maxPageBytes),
        limits.maxEntriesPerPage,
      );
    } catch (error) {
      failure = catalogSearchFailure(error);
      break;
    }
    coverage.pagesFetched += 1;
    coverage.entriesReceived += parsed.values.length;
    let overflow = false;
    for (const value of parsed.values) {
      const sanitized = sanitizeCatalogEntry(value);
      if (!sanitized) {
        coverage.entriesSkipped += 1;
        continue;
      }
      if (entries.has(sanitized.entry.key)) {
        coverage.duplicatesDropped += 1;
        continue;
      }
      if (entries.size >= limits.maxResults) {
        overflow = true;
        continue;
      }
      if (sanitized.descriptionTruncated) coverage.descriptionsTruncated += 1;
      entries.set(sanitized.entry.key, sanitized.entry);
    }
    if (overflow) {
      // Resuming would skip the dropped entries, so the result ends here.
      pendingToken = null;
      coverage.stopReason = "result-limit";
      break;
    }
    if (parsed.continuationToken === null) {
      pendingToken = null;
      break;
    }
    if (seenTokens.has(parsed.continuationToken)) {
      failure = { code: "malformed-response", retryable: false };
      break;
    }
    seenTokens.add(parsed.continuationToken);
    pendingToken = parsed.continuationToken;
    body = { continuationToken: parsed.continuationToken };
  }

  if (failure) {
    coverage.stopReason = "failure";
    if (failure.code !== "malformed-response" && failure.code !== "cancelled") {
      console.warn(`[atlas] catalog search stopped (${failure.code})`);
    }
  }
  const retryable = failure?.retryable ?? false;
  // Only a retryable stop keeps the token of the page that was not read.
  const continuationToken = failure && !retryable ? null : pendingToken;
  coverage.entriesReturned = entries.size;
  coverage.moreAvailable = continuationToken !== null;

  const envelope: CatalogSearchEnvelope = {
    contractVersion: 1,
    source: CATALOG_SEARCH_SOURCE,
    apiVersion: CATALOG_SEARCH_API_VERSION,
    authoritative: false,
    identity: "fabric-application",
    status: failure ? (coverage.pagesFetched > 0 ? "partial" : "failed") : "complete",
    ...(failure ? { failureCode: failure.code } : {}),
    retryable,
    searchedAt,
    scope,
    entries: [...entries.values()],
    coverage,
    continuationToken,
  };
  if (byteLength(envelope) > limits.maxEnvelopeBytes) {
    return failedCatalogSearch("response-too-large", searchedAt, scope);
  }
  return envelope;
}

export async function searchCatalogPreview(
  ctx: RayfinContext<AtlasSchema, AudienceType.Fabric>,
  protocolVersion: unknown,
  search: unknown,
  itemTypes: unknown,
  workspaceIds: unknown,
  pageSize: unknown,
  continuationToken: unknown,
  dependencies: CatalogSearchDependencies = {},
): Promise<CatalogSearchEnvelope> {
  const searchedAt = () =>
    new Date((dependencies.wallClock ?? Date.now)()).toISOString();
  let request: CatalogSearchRequest;
  try {
    request = validateCatalogSearchInput(
      protocolVersion,
      search,
      itemTypes,
      workspaceIds,
      pageSize,
      continuationToken,
    );
  } catch {
    return failedCatalogSearch("invalid-input", searchedAt());
  }
  try {
    await requireAtlasSynchronizer(
      ctx.getDataClient(),
      "catalog search",
      AUTHORIZATION_MESSAGE,
    );
  } catch {
    return failedCatalogSearch("not-authorized", searchedAt(), scopeFor(request));
  }
  let token: string;
  try {
    token = ctx.Tokens.Fabric;
  } catch {
    return failedCatalogSearch("token-unavailable", searchedAt(), scopeFor(request));
  }
  return runCatalogSearch(token, request, dependencies);
}
