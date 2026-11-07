import { getRayfinClient } from "@/lib/rayfin-client";
import type {
  CatalogSearchEntry,
  CatalogSearchEnvelope,
  CatalogSearchFailureCode,
} from "../../rayfin/functions/src/catalog-search";
import type { AppFunctionsSchema } from "../../rayfin/functions/src/types";
import { itemFamilyLabel } from "./item-families";
import type { PreviewFeatureId } from "./preview-api";
import type { SearchIndexEntry, SearchResult } from "./search";

export type { CatalogSearchEntry, CatalogSearchEnvelope, CatalogSearchFailureCode };

/*
 * Optional OneLake Catalog Search (Preview) discovery for the global search
 * palette. Results stay in component state, are never persisted and never
 * replace, reorder or delete local snapshot search results.
 */

export const CATALOG_SEARCH_FEATURE_ID: PreviewFeatureId = "catalog-search";
export const CATALOG_SEARCH_SOURCE_LABEL = "OneLake catalog";
export const CATALOG_SEARCH_PAGE_SIZE = 25;
/** Upper bound on entries accumulated across "Load more" in one palette session. */
export const CATALOG_SEARCH_MAX_ENTRIES = 200;
export const CATALOG_SEARCH_TIMEOUT_MS = 60_000;
const MAX_QUERY_LENGTH = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UNSAFE_TEXT = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/u;
const SEARCHABLE = /[\p{L}\p{N}]/u;
const STATUSES = new Set(["complete", "partial", "failed"]);
const FAILURE_CODES = new Set<CatalogSearchFailureCode>([
  "invalid-input",
  "not-authorized",
  "token-unavailable",
  "permission-denied",
  "rejected-request",
  "throttled",
  "timeout",
  "unavailable",
  "malformed-response",
  "response-too-large",
  "cancelled",
]);

export type CatalogSearchAvailability =
  | "disabled"
  | "preview-data"
  | "not-authorized"
  | "available";

/** Feature flag first, then deployment mode, then the synchronizer-only gate. */
export function catalogSearchAvailability({
  enabled,
  isPreview,
  canSync,
}: {
  enabled: boolean;
  isPreview: boolean;
  canSync: boolean;
}): CatalogSearchAvailability {
  if (!enabled) return "disabled";
  if (isPreview) return "preview-data";
  if (!canSync) return "not-authorized";
  return "available";
}

export function normalizeCatalogQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Mirrors the Function's strict search-text rule before any invocation. */
export function isCatalogSearchQuery(value: string): boolean {
  const text = normalizeCatalogQuery(value);
  return (
    text.length > 0 &&
    text.length <= MAX_QUERY_LENGTH &&
    !UNSAFE_TEXT.test(value) &&
    SEARCHABLE.test(text)
  );
}

export type CatalogSearchRequest =
  | { kind: "search"; search: string }
  | { kind: "continue"; continuationToken: string };

type CatalogSearchInput = AppFunctionsSchema["searchCatalogPreview"]["input"];

export interface CatalogSearchInvoker {
  functions: {
    searchCatalogPreview: {
      invoke: (
        input: CatalogSearchInput,
        options?: { timeoutMs?: number },
      ) => Promise<unknown>;
    };
  };
}

export function catalogSearchInput(request: CatalogSearchRequest): CatalogSearchInput {
  return request.kind === "search"
    ? {
        protocolVersion: 1,
        search: normalizeCatalogQuery(request.search),
        itemTypes: [],
        workspaceIds: [],
        pageSize: CATALOG_SEARCH_PAGE_SIZE,
        continuationToken: null,
      }
    : {
        protocolVersion: 1,
        search: null,
        itemTypes: [],
        workspaceIds: [],
        pageSize: null,
        continuationToken: request.continuationToken,
      };
}

export function failedCatalogSearchEnvelope(
  code: CatalogSearchFailureCode,
  searchedAt: string,
): CatalogSearchEnvelope {
  return {
    contractVersion: 1,
    source: "onelake-catalog-search",
    apiVersion: "v1-preview",
    authoritative: false,
    identity: "fabric-application",
    status: "failed",
    failureCode: code,
    retryable: code === "throttled" || code === "timeout" || code === "unavailable",
    searchedAt,
    entries: [],
    coverage: {
      pagesFetched: 0,
      entriesReceived: 0,
      entriesReturned: 0,
      entriesSkipped: 0,
      duplicatesDropped: 0,
      descriptionsTruncated: 0,
      moreAvailable: false,
      stopReason: "failure",
    },
    continuationToken: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function count(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function parseEntry(value: unknown): CatalogSearchEntry | undefined {
  if (!isRecord(value)) return undefined;
  const { key, id, catalogEntryType, type, displayName } = value;
  if (
    !boundedString(key, 120) ||
    typeof id !== "string" ||
    !UUID.test(id) ||
    !boundedString(catalogEntryType, 50) ||
    !boundedString(type, 100) ||
    !boundedString(displayName, 300) ||
    (value.description !== undefined && !boundedString(value.description, 500)) ||
    (value.workspaceId !== undefined &&
      (typeof value.workspaceId !== "string" || !UUID.test(value.workspaceId))) ||
    (value.workspaceDisplayName !== undefined &&
      !boundedString(value.workspaceDisplayName, 300))
  ) {
    return undefined;
  }
  return {
    key,
    id,
    catalogEntryType,
    type,
    displayName,
    ...(value.description !== undefined ? { description: value.description as string } : {}),
    ...(value.workspaceId !== undefined ? { workspaceId: value.workspaceId as string } : {}),
    ...(value.workspaceDisplayName !== undefined
      ? { workspaceDisplayName: value.workspaceDisplayName as string }
      : {}),
  };
}

/**
 * Re-validates the Function envelope in the browser. A contract violation is
 * reported as `malformed-response` instead of rendering untrusted values.
 */
export function parseCatalogSearchEnvelope(
  value: unknown,
  searchedAt: string,
): CatalogSearchEnvelope {
  const malformed = () => failedCatalogSearchEnvelope("malformed-response", searchedAt);
  if (
    !isRecord(value) ||
    value.contractVersion !== 1 ||
    value.source !== "onelake-catalog-search" ||
    value.apiVersion !== "v1-preview" ||
    value.authoritative !== false ||
    value.identity !== "fabric-application" ||
    typeof value.status !== "string" ||
    !STATUSES.has(value.status) ||
    typeof value.retryable !== "boolean" ||
    typeof value.searchedAt !== "string" ||
    !Array.isArray(value.entries) ||
    value.entries.length > CATALOG_SEARCH_MAX_ENTRIES ||
    !isRecord(value.coverage) ||
    (value.continuationToken !== null && !boundedString(value.continuationToken, 4_096)) ||
    (value.failureCode !== undefined &&
      !FAILURE_CODES.has(value.failureCode as CatalogSearchFailureCode))
  ) {
    return malformed();
  }
  const coverage = value.coverage;
  if (
    !count(coverage.pagesFetched) ||
    !count(coverage.entriesReceived) ||
    !count(coverage.entriesReturned) ||
    !count(coverage.entriesSkipped) ||
    !count(coverage.duplicatesDropped) ||
    !count(coverage.descriptionsTruncated) ||
    typeof coverage.moreAvailable !== "boolean"
  ) {
    return malformed();
  }
  const entries: CatalogSearchEntry[] = [];
  for (const raw of value.entries) {
    const entry = parseEntry(raw);
    if (!entry) return malformed();
    entries.push(entry);
  }
  const stopReason = coverage.stopReason;
  return {
    contractVersion: 1,
    source: "onelake-catalog-search",
    apiVersion: "v1-preview",
    authoritative: false,
    identity: "fabric-application",
    status: value.status as CatalogSearchEnvelope["status"],
    ...(value.failureCode !== undefined
      ? { failureCode: value.failureCode as CatalogSearchFailureCode }
      : {}),
    retryable: value.retryable,
    searchedAt: value.searchedAt,
    entries,
    coverage: {
      pagesFetched: coverage.pagesFetched,
      entriesReceived: coverage.entriesReceived,
      entriesReturned: coverage.entriesReturned,
      entriesSkipped: coverage.entriesSkipped,
      duplicatesDropped: coverage.duplicatesDropped,
      descriptionsTruncated: coverage.descriptionsTruncated,
      moreAvailable: coverage.moreAvailable,
      ...(stopReason === "page-limit" ||
      stopReason === "deadline-exhausted" ||
      stopReason === "result-limit" ||
      stopReason === "failure"
        ? { stopReason }
        : {}),
    },
    continuationToken: value.continuationToken as string | null,
  };
}

/** Invokes the Function; transport failures become an honest `unavailable` state. */
export async function searchOneLakeCatalog(
  request: CatalogSearchRequest,
  dependencies: { client?: CatalogSearchInvoker; now?: () => number } = {},
): Promise<CatalogSearchEnvelope> {
  const searchedAt = () => new Date((dependencies.now ?? Date.now)()).toISOString();
  if (request.kind === "search" && !isCatalogSearchQuery(request.search)) {
    return failedCatalogSearchEnvelope("invalid-input", searchedAt());
  }
  try {
    const client =
      dependencies.client ?? (getRayfinClient() as unknown as CatalogSearchInvoker);
    const raw = await client.functions.searchCatalogPreview.invoke(
      catalogSearchInput(request),
      { timeoutMs: CATALOG_SEARCH_TIMEOUT_MS },
    );
    return parseCatalogSearchEnvelope(raw, searchedAt());
  } catch {
    return failedCatalogSearchEnvelope("unavailable", searchedAt());
  }
}

export interface CatalogSearchView {
  /** Normalized query the entries belong to. */
  query: string;
  phase: "idle" | "loading" | "ready";
  entries: CatalogSearchEntry[];
  continuationToken: string | null;
  failureCode?: CatalogSearchFailureCode;
  retryable: boolean;
  pagesFetched: number;
  entriesSkipped: number;
  duplicatesDropped: number;
  /** Entries were discarded because the palette reached its accumulation bound. */
  capped: boolean;
  searchedAt?: string;
}

export function idleCatalogSearchView(query = ""): CatalogSearchView {
  return {
    query,
    phase: "idle",
    entries: [],
    continuationToken: null,
    retryable: false,
    pagesFetched: 0,
    entriesSkipped: 0,
    duplicatesDropped: 0,
    capped: false,
  };
}

/**
 * Applies one envelope. Appended pages keep first-seen entries and their
 * order; an empty or failed page never removes entries already shown.
 */
export function applyCatalogSearchEnvelope(
  view: CatalogSearchView,
  envelope: CatalogSearchEnvelope,
  append: boolean,
  maxEntries: number = CATALOG_SEARCH_MAX_ENTRIES,
): CatalogSearchView {
  const base = append ? view : idleCatalogSearchView(view.query);
  const entries = [...base.entries];
  const keys = new Set(entries.map((entry) => entry.key));
  let duplicates = base.duplicatesDropped + envelope.coverage.duplicatesDropped;
  let capped = base.capped;
  for (const entry of envelope.entries) {
    if (keys.has(entry.key)) {
      duplicates += 1;
      continue;
    }
    if (entries.length >= maxEntries) {
      capped = true;
      continue;
    }
    keys.add(entry.key);
    entries.push(entry);
  }
  const keepToken =
    !capped && entries.length < maxEntries ? envelope.continuationToken : null;
  return {
    query: view.query,
    phase: "ready",
    entries,
    // A failed continuation without a resumable token keeps the earlier entries only.
    continuationToken: keepToken,
    ...(envelope.failureCode ? { failureCode: envelope.failureCode } : {}),
    retryable: envelope.retryable,
    pagesFetched: base.pagesFetched + envelope.coverage.pagesFetched,
    entriesSkipped: base.entriesSkipped + envelope.coverage.entriesSkipped,
    duplicatesDropped: duplicates,
    capped,
    searchedAt: envelope.searchedAt,
  };
}

export interface CatalogSnapshotLookup {
  items: Map<string, SearchIndexEntry>;
  workspaces: Map<string, SearchIndexEntry>;
}

export function catalogSnapshotLookup(
  index: readonly SearchIndexEntry[],
): CatalogSnapshotLookup {
  const items = new Map<string, SearchIndexEntry>();
  const workspaces = new Map<string, SearchIndexEntry>();
  for (const entry of index) {
    if (entry.kind === "item" && entry.target.itemId) {
      items.set(entry.target.itemId.toLowerCase(), entry);
    } else if (entry.kind === "workspace" && entry.target.workspaceId) {
      workspaces.set(entry.target.workspaceId.toLowerCase(), entry);
    }
  }
  return { items, workspaces };
}

export function fabricPortalWorkspaceUrl(
  workspaceId: string | undefined,
  portalBase: string = (import.meta.env.VITE_FABRIC_PORTAL_URL as string | undefined) ??
    "https://app.fabric.microsoft.com",
): string {
  const portal = portalBase.replace(/\/+$/, "");
  return workspaceId && UUID.test(workspaceId)
    ? `${portal}/groups/${encodeURIComponent(workspaceId)}/list?experience=power-bi`
    : portal;
}

export type CatalogEntryResolution =
  | { kind: "snapshot"; result: SearchResult }
  | { kind: "external"; url: string };

/**
 * Resolves an entry by its stable ID: a synchronized item or workspace opens
 * the authoritative Atlas view, anything else opens its workspace in Fabric.
 */
export function resolveCatalogEntry(
  entry: CatalogSearchEntry,
  lookup: CatalogSnapshotLookup,
  portalBase?: string,
): CatalogEntryResolution {
  const local =
    entry.catalogEntryType === "Workspace"
      ? lookup.workspaces.get(entry.id)
      : entry.catalogEntryType === "FabricItem"
        ? lookup.items.get(entry.id)
        : undefined;
  if (local) return { kind: "snapshot", result: { ...local, score: 0 } };
  return {
    kind: "external",
    url: fabricPortalWorkspaceUrl(entry.workspaceId, portalBase),
  };
}

export function catalogEntryTypeLabel(type: string): string {
  return itemFamilyLabel(type);
}

export const CATALOG_SEARCH_AVAILABILITY_MESSAGE: Record<
  Exclude<CatalogSearchAvailability, "disabled" | "available">,
  string
> = {
  "preview-data":
    "Catalog Search needs a deployed Atlas backend. Preview data never calls Fabric.",
  "not-authorized":
    "Only the configured Atlas synchronizer can search the OneLake catalog, because results are filtered for the Atlas application identity, not your account.",
};

export const CATALOG_SEARCH_FAILURE_MESSAGE: Record<
  CatalogSearchFailureCode,
  { title: string; detail: string }
> = {
  "invalid-input": {
    title: "Search text not accepted",
    detail: "Use up to 200 characters including at least one letter or number.",
  },
  "not-authorized": {
    title: "Synchronizer only",
    detail: CATALOG_SEARCH_AVAILABILITY_MESSAGE["not-authorized"],
  },
  "token-unavailable": {
    title: "Application identity unavailable",
    detail: "The Atlas Functions host did not provide a Fabric application token.",
  },
  "permission-denied": {
    title: "Catalog Search permission denied",
    detail:
      "Fabric refused Catalog Search for the Atlas application identity. Check the tenant settings and that identity's access.",
  },
  "rejected-request": {
    title: "Fabric rejected the search",
    detail:
      "Fabric could not accept the search text or the continuation expired. Start a new search.",
  },
  throttled: {
    title: "Catalog Search is throttled",
    detail: "Fabric asked Atlas to slow down. Try again in a moment.",
  },
  timeout: {
    title: "Catalog Search timed out",
    detail: "Try again or use a more specific search.",
  },
  unavailable: {
    title: "Catalog Search unavailable",
    detail:
      "The Preview API or the Atlas Functions host did not respond. Snapshot search still works.",
  },
  "malformed-response": {
    title: "Unexpected Catalog Search response",
    detail: "Atlas discarded a response that did not match the documented contract.",
  },
  "response-too-large": {
    title: "Catalog Search response too large",
    detail: "Use a more specific search.",
  },
  cancelled: {
    title: "Catalog Search cancelled",
    detail: "Start the search again to continue.",
  },
};

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export interface CatalogSearchDescription {
  title?: string;
  detail: string;
  tone: "neutral" | "warning";
}

/** Status copy for the palette; every state names its source and boundary. */
export function describeCatalogSearch({
  availability,
  view,
  validQuery,
  inSnapshot,
}: {
  availability: Exclude<CatalogSearchAvailability, "disabled">;
  view: CatalogSearchView;
  validQuery: boolean;
  inSnapshot: number;
}): CatalogSearchDescription {
  if (availability !== "available") {
    return { detail: CATALOG_SEARCH_AVAILABILITY_MESSAGE[availability], tone: "neutral" };
  }
  if (view.phase === "idle") {
    return {
      detail: validQuery
        ? "Optional discovery beyond the synchronized snapshot, filtered for the Atlas application identity."
        : "Add at least one letter or number to search the catalog.",
      tone: "neutral",
    };
  }
  if (view.phase === "loading") {
    return { detail: "Searching the OneLake catalog…", tone: "neutral" };
  }
  if (view.failureCode) {
    const failure = CATALOG_SEARCH_FAILURE_MESSAGE[view.failureCode];
    return {
      title: failure.title,
      detail: view.entries.length
        ? `${plural(view.entries.length, "catalog entry", "catalog entries")} kept. ${failure.detail}`
        : failure.detail,
      tone: "warning",
    };
  }
  if (view.entries.length === 0) {
    return {
      detail:
        "No catalog entries returned. An empty Preview result does not prove that an asset is absent.",
      tone: "neutral",
    };
  }
  return {
    detail: [
      plural(view.entries.length, "catalog entry", "catalog entries"),
      `${inSnapshot} in snapshot`,
      view.continuationToken ? "more available" : undefined,
      view.capped ? "display limit reached" : undefined,
    ]
      .filter(Boolean)
      .join(" · "),
    tone: "neutral",
  };
}

/** Source-coverage line shown with the Preview notice. */
export function catalogSearchCoverageText(view: CatalogSearchView): string {
  return [
    `Source: OneLake Catalog Search (Preview), ${plural(view.pagesFetched, "page")}`,
    view.entriesSkipped ? `${plural(view.entriesSkipped, "malformed entry", "malformed entries")} skipped` : undefined,
    view.duplicatesDropped ? `${plural(view.duplicatesDropped, "duplicate")} merged` : undefined,
    "discovery only; snapshot evidence is unchanged",
  ]
    .filter(Boolean)
    .join(" · ");
}
