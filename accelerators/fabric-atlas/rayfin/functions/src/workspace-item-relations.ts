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
} from "./fabric-rest.js";
import { requireAtlasSynchronizer } from "./synchronizer-gate.js";
import { strictUuid } from "./sync/protocol.js";

/*
 * Read-only collector for the Fabric Item Relations API (Beta). It returns
 * raw dependency evidence in the schema-version 1 contract of
 * `src/atlas/item-relations-evidence.ts`; graph orientation, prior-evidence
 * merging and comparison stay in that pure module. It never writes Rayfin
 * rows, never creates LineageEdge values and is marked non-authoritative.
 */

export const ITEM_RELATIONS_EVIDENCE_SOURCE = "fabric-item-relations-api-beta";
export const ITEM_RELATIONS_API_VERSION = "v1-beta";
export const ITEM_RELATIONS_DIRECTIONS = ["upstream", "downstream"] as const;

export const COLLECT_ITEM_RELATIONS_LIMITS = {
  ...FABRIC_REST_DEFAULTS,
  // Leaves headroom below the 200-240 second Fabric Functions execution limit.
  executionBudgetMs: 150_000,
  maxRootItems: 16,
  maxRequests: 64,
  maxPagesPerQuery: 5,
  // Same per-collection bound as the pure evidence contract.
  maxRecordsPerCollection: 50_000,
  maxPageBytes: 8 * 1024 * 1024,
  minQueryStartMs: 5_000,
  // Serialized responses across the batch.
  maxEvidenceBytes: 16 * 1024 * 1024,
  // Hard final guard below the 30 MiB Functions response limit.
  maxEnvelopeBytes: 24 * 1024 * 1024,
} as const;

export type CollectItemRelationsLimits = {
  [Name in keyof typeof COLLECT_ITEM_RELATIONS_LIMITS]: number;
};

export interface CollectItemRelationsDependencies {
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  wallClock?: () => number;
  signal?: AbortSignal;
  limits?: Partial<CollectItemRelationsLimits>;
}

// A named alias keeps the SDK from coercing or echoing the raw input; the strict validator owns it.
export type ItemRelationsRootItemIdsInput = string[];

export interface CollectItemRelationsRequest {
  workspaceId: string;
  correlationId: string | null;
  itemIds: string[];
}

export type ItemRelationsDirection = (typeof ITEM_RELATIONS_DIRECTIONS)[number];

export type ItemRelationsFailureCode =
  | "unauthorized"
  | "insufficient-privileges"
  | "item-not-found"
  | "throttled"
  | "transient"
  | "malformed-response"
  | "failed"
  | "not-attempted";

export type ItemRelationsItem = {
  id: string;
  workspaceId: string;
  /** Verbatim Fabric item type; future types are preserved. */
  type: string;
  displayName: string;
};

export type ItemRelationsWorkspace = { id: string; displayName: string };

/** Raw API edge: `itemId` depends on `dependentOnItemId`. */
export type ItemRelationsRelation = {
  itemId: string;
  dependentOnItemId: string;
  /** Verbatim Fabric relation type; future types are preserved. */
  relationType: string;
};

export type ItemRelationsResponse = {
  items: ItemRelationsItem[];
  relations: ItemRelationsRelation[];
  workspaces: ItemRelationsWorkspace[];
};

export type ItemRelationsQueryEvidence = {
  itemId: string;
  direction: ItemRelationsDirection;
  status: "complete" | "failed";
  attemptedAt: string;
  failureCode?: ItemRelationsFailureCode;
  observedAt?: string;
  response?: ItemRelationsResponse;
};

export type ItemRelationsStopReason =
  | "deadline-exhausted"
  | "request-budget-exhausted"
  | "cancelled"
  | "throttled"
  | "evidence-budget-exhausted";

export interface ItemRelationsEvidenceEnvelope {
  schemaVersion: 1;
  source: typeof ITEM_RELATIONS_EVIDENCE_SOURCE;
  apiVersion: typeof ITEM_RELATIONS_API_VERSION;
  workspaceId: string;
  collectedAt: string;
  queries: ItemRelationsQueryEvidence[];
  /** Preview evidence can never become authoritative lineage. */
  authoritative: false;
  /** Present only when the caller supplied a correlation UUID. */
  correlationId?: string;
  /** Why remaining queries are `not-attempted`, when the batch stopped early. */
  stopReason?: ItemRelationsStopReason;
}

const INVALID_INPUT_MESSAGE =
  "Use protocolVersion 1, a strict workspace UUID, 1-16 unique root item UUIDs and a strict correlation UUID or null.";
const AUTHORIZATION_MESSAGE =
  "Item Relations collection requires the configured Atlas administrator.";
const TOKEN_UNAVAILABLE_MESSAGE = "The Fabric application token was unavailable.";
const RESPONSE_TOO_LARGE_MESSAGE =
  "Item Relations collection exceeded the safe response size.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ITEM_TYPE_LENGTH = 100;
const MAX_RELATION_TYPE_LENGTH = 100;
const MAX_DISPLAY_NAME_LENGTH = 300;

class RelationsContractError extends Error {
  constructor() {
    super("Item Relations response violated the evidence contract.");
    this.name = "RelationsContractError";
  }
}

function malformed(): never {
  throw new RelationsContractError();
}

export function validateCollectItemRelationsInput(
  protocolVersion: unknown,
  workspaceId: unknown,
  itemIds: unknown,
  correlationId: unknown,
): CollectItemRelationsRequest {
  try {
    if (
      protocolVersion !== 1 ||
      !Array.isArray(itemIds) ||
      itemIds.length < 1 ||
      itemIds.length > COLLECT_ITEM_RELATIONS_LIMITS.maxRootItems
    ) {
      throw new Error();
    }
    const ids = itemIds.map((itemId: unknown) => strictUuid(itemId));
    if (new Set(ids).size !== ids.length) throw new Error();
    return {
      workspaceId: strictUuid(workspaceId),
      correlationId: correlationId == null ? null : strictUuid(correlationId),
      itemIds: ids,
    };
  } catch {
    throw new Error(INVALID_INPUT_MESSAGE);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function uuid(value: unknown): string {
  return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : malformed();
}

/** Same rule as the pure contract: a non-blank bounded string, kept verbatim. */
function text(value: unknown, maxLength: number): string {
  return typeof value === "string" && value.trim() && value.length <= maxLength
    ? value
    : malformed();
}

/**
 * Merges continuation pages and applies the pure `parseItemRelationsResponse`
 * allowlist: only documented fields, lowercase UUIDs, first-wins duplicates.
 * Unknown types, cross-workspace endpoints, self relations and cycles are kept.
 */
export function parseRelationsPages(
  pages: readonly unknown[],
  maxRecords: number = COLLECT_ITEM_RELATIONS_LIMITS.maxRecordsPerCollection,
): ItemRelationsResponse {
  const collections = { items: [] as unknown[], relations: [] as unknown[], workspaces: [] as unknown[] };
  for (const page of pages) {
    if (!isRecord(page)) malformed();
    for (const name of ["items", "relations", "workspaces"] as const) {
      const values = page[name];
      if (!Array.isArray(values)) malformed();
      if (collections[name].length + values.length > maxRecords) malformed();
      for (const value of values) collections[name].push(value);
    }
  }

  const items = new Map<string, ItemRelationsItem>();
  for (const value of collections.items) {
    if (!isRecord(value)) malformed();
    const item: ItemRelationsItem = {
      id: uuid(value.id),
      workspaceId: uuid(value.workspaceId),
      type: text(value.type, MAX_ITEM_TYPE_LENGTH),
      displayName: text(value.displayName, MAX_DISPLAY_NAME_LENGTH),
    };
    const key = `${item.workspaceId}:${item.id}`;
    if (!items.has(key)) items.set(key, item);
  }

  const relations = new Map<string, ItemRelationsRelation>();
  for (const value of collections.relations) {
    if (!isRecord(value)) malformed();
    const relation: ItemRelationsRelation = {
      itemId: uuid(value.itemId),
      dependentOnItemId: uuid(value.dependentOnItemId),
      relationType: text(value.relationType, MAX_RELATION_TYPE_LENGTH),
    };
    const key = [relation.dependentOnItemId, relation.itemId, relation.relationType.toLowerCase()].join("|");
    if (!relations.has(key)) relations.set(key, relation);
  }

  const workspaces = new Map<string, ItemRelationsWorkspace>();
  for (const value of collections.workspaces) {
    if (!isRecord(value)) malformed();
    const workspace: ItemRelationsWorkspace = {
      id: uuid(value.id),
      displayName: text(value.displayName, MAX_DISPLAY_NAME_LENGTH),
    };
    if (!workspaces.has(workspace.id)) workspaces.set(workspace.id, workspace);
  }

  return {
    items: [...items.values()],
    relations: [...relations.values()],
    workspaces: [...workspaces.values()],
  };
}

/** Pure `classifyItemRelationsFailure` by HTTP status; error bodies are never read. */
function statusFailure(status: number | undefined): ItemRelationsFailureCode {
  switch (status) {
    case 401:
      return "unauthorized";
    case 403:
      return "insufficient-privileges";
    case 404:
      return "item-not-found";
    case 429:
      return "throttled";
    case 408:
    case 500:
    case 502:
    case 503:
    case 504:
      return "transient";
    default:
      return "failed";
  }
}

export function itemRelationsFailureCode(error: unknown): ItemRelationsFailureCode {
  if (error instanceof RelationsContractError) return "malformed-response";
  if (!(error instanceof FabricRestError)) return "failed";
  switch (error.code) {
    case "deadline-exhausted":
    case "request-budget-exhausted":
    case "cancelled":
      return "not-attempted";
    case "request-timeout":
    case "upstream-unreachable":
      return "transient";
    case "invalid-response":
    case "pagination-invalid":
      return "malformed-response";
    case "upstream-http-error":
    case "retry-after-deferred":
      return statusFailure(error.status);
    default:
      return "failed";
  }
}

function stopReasonFor(error: unknown, code: ItemRelationsFailureCode): ItemRelationsStopReason | undefined {
  if (code === "throttled") return "throttled";
  if (!(error instanceof FabricRestError)) return undefined;
  if (error.code === "deadline-exhausted") return "deadline-exhausted";
  if (error.code === "request-budget-exhausted") return "request-budget-exhausted";
  if (error.code === "cancelled") return "cancelled";
  return undefined;
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/** Collects raw upstream and downstream Beta evidence for each root item. */
export async function collectWorkspaceItemRelations(
  token: string,
  request: CollectItemRelationsRequest,
  dependencies: CollectItemRelationsDependencies = {},
): Promise<ItemRelationsEvidenceEnvelope> {
  if (typeof token !== "string" || !token || /\s/.test(token)) {
    throw new Error(TOKEN_UNAVAILABLE_MESSAGE);
  }
  const limits: CollectItemRelationsLimits = { ...COLLECT_ITEM_RELATIONS_LIMITS, ...dependencies.limits };
  const wallClock = dependencies.wallClock ?? Date.now;
  const timestamp = () => new Date(wallClock()).toISOString();
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
  const queries: ItemRelationsQueryEvidence[] = [];
  let usedBytes = 0;
  let stopReason: ItemRelationsStopReason | undefined;

  for (const itemId of request.itemIds) {
    for (const direction of ITEM_RELATIONS_DIRECTIONS) {
      if (!stopReason) {
        if (dependencies.signal?.aborted) stopReason = "cancelled";
        else if (deadline.remaining() <= limits.minQueryStartMs) stopReason = "deadline-exhausted";
        else if (budget.remaining === 0) stopReason = "request-budget-exhausted";
      }
      const attemptedAt = timestamp();
      if (stopReason) {
        queries.push({ itemId, direction, status: "failed", attemptedAt, failureCode: "not-attempted" });
        continue;
      }
      try {
        const pages = await client.getPaged(
          `/v1/workspaces/${request.workspaceId}/items/${itemId}/relations/${direction}`,
          { query: { beta: true }, maxPages: limits.maxPagesPerQuery, maxResponseBytes: limits.maxPageBytes },
          budget,
        );
        const response = parseRelationsPages(pages, limits.maxRecordsPerCollection);
        const size = byteLength(response);
        if (usedBytes + size > limits.maxEvidenceBytes) {
          queries.push({ itemId, direction, status: "failed", attemptedAt, failureCode: "failed" });
          stopReason = "evidence-budget-exhausted";
          continue;
        }
        usedBytes += size;
        queries.push({ itemId, direction, status: "complete", attemptedAt, observedAt: attemptedAt, response });
      } catch (error) {
        const failureCode = itemRelationsFailureCode(error);
        queries.push({ itemId, direction, status: "failed", attemptedAt, failureCode });
        stopReason = stopReasonFor(error, failureCode);
      }
    }
  }

  const envelope: ItemRelationsEvidenceEnvelope = {
    schemaVersion: 1,
    source: ITEM_RELATIONS_EVIDENCE_SOURCE,
    apiVersion: ITEM_RELATIONS_API_VERSION,
    workspaceId: request.workspaceId,
    collectedAt: timestamp(),
    queries,
    authoritative: false,
    ...(request.correlationId ? { correlationId: request.correlationId } : {}),
    ...(stopReason ? { stopReason } : {}),
  };
  if (byteLength(envelope) > limits.maxEnvelopeBytes) {
    throw new Error(RESPONSE_TOO_LARGE_MESSAGE);
  }
  return envelope;
}

export async function workspaceCollectItemRelations(
  ctx: RayfinContext<AtlasSchema, AudienceType.Fabric>,
  protocolVersion: unknown,
  workspaceId: unknown,
  itemIds: unknown,
  correlationId: unknown,
  dependencies?: CollectItemRelationsDependencies,
): Promise<ItemRelationsEvidenceEnvelope> {
  const request = validateCollectItemRelationsInput(protocolVersion, workspaceId, itemIds, correlationId);
  await requireAtlasSynchronizer(ctx.getDataClient(), "item relations collection", AUTHORIZATION_MESSAGE);
  let token: string;
  try {
    token = ctx.Tokens.Fabric;
  } catch {
    throw new Error(TOKEN_UNAVAILABLE_MESSAGE);
  }
  return collectWorkspaceItemRelations(token, request, dependencies);
}
