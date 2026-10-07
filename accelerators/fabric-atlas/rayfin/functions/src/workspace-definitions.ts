import {
  AudienceType,
  type RayfinContext,
} from "@microsoft/fabric-user-data-functions";
import type { AtlasSchema } from "../../data/schema.js";
import {
  DefinitionProjectionError,
  projectDefinition,
  type DefinitionArtifactMetadata,
  type DefinitionProjectionErrorCode,
  type DefinitionReferences,
} from "./definition-projections.js";
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
 * Read-only dual-run stage for Fabric item definitions. It never writes Rayfin
 * rows, never publishes a snapshot and is marked `authoritative: false`; the
 * Python UDF remains the authoritative definition collector.
 */

/** Documented getDefinition routes; any other item type is reported unsupported. */
export const DEFINITION_ROUTES: ReadonlyMap<string, string> = new Map([
  ["Ontology", "ontologies"],
  ["GraphModel", "graphModels"],
  ["DataAgent", "dataAgents"],
]);

export const COLLECT_DEFINITION_LIMITS = {
  ...FABRIC_REST_DEFAULTS,
  // Leaves headroom below the 200-240 second Fabric Functions execution limit.
  executionBudgetMs: 150_000,
  maxItems: 8,
  maxRequests: 120,
  maxLroPolls: 12,
  minPollDelayMs: 1_000,
  maxPollDelayMs: 5_000,
  maxDefinitionResponseBytes: 16 * 1024 * 1024,
  minItemStartMs: 20_000,
  maxErrors: 50,
  // Projected metadata plus Config rows across the batch.
  maxProjectionBytes: 16 * 1024 * 1024,
  // Hard final guard below the 30 MiB Functions response limit.
  maxEnvelopeBytes: 24 * 1024 * 1024,
} as const;

export type CollectDefinitionLimits = {
  [Name in keyof typeof COLLECT_DEFINITION_LIMITS]: number;
};

export interface CollectDefinitionDependencies {
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  signal?: AbortSignal;
  limits?: Partial<CollectDefinitionLimits>;
}

export type DefinitionItemInput = { id: string; type: string };
// A named alias keeps the SDK from coercing or echoing the raw input; the strict validator owns it.
export type DefinitionItemsInput = DefinitionItemInput[];

export interface CollectDefinitionsRequest {
  workspaceId: string;
  correlationId: string | null;
  items: DefinitionItemInput[];
}

export type DefinitionStatusCode =
  | FabricSafeErrorCode
  | DefinitionProjectionErrorCode
  | "read-write-permission-required"
  | "item-type-unsupported"
  | "not-attempted"
  | "forward-compatible-parts-skipped"
  | "artifact-metadata-truncated"
  | "projection-truncated"
  | "partial-unsupported"
  | "not-applicable";

export type DefinitionStatus = {
  status: "complete" | "unsupported" | "failed";
  code?: DefinitionStatusCode;
};

export type DefinitionItemEvidence = DefinitionStatus & {
  id: string;
  type: string;
  /** Forward-compatible parts that were recognized as unknown and skipped. */
  unknownParts?: number;
  /** Referenced Fabric item UUIDs from successful projections only. */
  references?: DefinitionReferences;
};

export type DefinitionConfigEntry = {
  itemId: string;
  section: string;
  label: string;
  value: string;
};

export interface DefinitionStageEnvelope {
  contractVersion: 1;
  stage: "definitions";
  /** This stage can never authorize snapshot publication. */
  authoritative: false;
  /** Present only when the caller supplied a correlation UUID. */
  correlationId?: string;
  workspaceId: string;
  items: DefinitionItemEvidence[];
  artifactMetadata: Record<string, DefinitionArtifactMetadata>;
  config: DefinitionConfigEntry[];
  sections: { definitions: DefinitionStatus };
  capabilities: { definitionEnrichment: DefinitionStatus };
  errors: string[];
  syncedAt: string;
}

const INVALID_INPUT_MESSAGE =
  "Use protocolVersion 1, a strict workspace UUID, 1-8 unique {id, type} items and a strict correlation UUID or null.";
const AUTHORIZATION_MESSAGE =
  "Definition collection requires the configured Atlas administrator.";
const TOKEN_UNAVAILABLE_MESSAGE = "The Fabric application token was unavailable.";
const RESPONSE_TOO_LARGE_MESSAGE =
  "Definition collection exceeded the safe response size.";
const ITEM_TYPE = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
const UNSUPPORTED_CODES = new Set<DefinitionStatusCode>([
  "endpoint-unsupported",
  "read-write-permission-required",
  "encrypted-label-blocked",
]);
// Python treats deadline/timeout/Retry-After as slice stops; throttling and cancellation also stop.
const STOP_CODES = new Set<DefinitionStatusCode>([
  "deadline-exhausted",
  "request-timeout",
  "retry-after-deferred",
  "rate-limited",
  "request-budget-exhausted",
  "cancelled",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function validateCollectDefinitionsInput(
  protocolVersion: unknown,
  workspaceId: unknown,
  items: unknown,
  correlationId: unknown,
): CollectDefinitionsRequest {
  try {
    if (
      protocolVersion !== 1 ||
      !Array.isArray(items) ||
      items.length < 1 ||
      items.length > COLLECT_DEFINITION_LIMITS.maxItems
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

/** Python `_definition_error_code`, with LRO and cancellation codes kept distinct. */
export function definitionErrorCode(error: unknown): DefinitionStatusCode {
  if (error instanceof DefinitionProjectionError) return error.code;
  if (!(error instanceof FabricRestError)) return "upstream-failure";
  if (error.code === "invalid-response") return "invalid-definition";
  if (error.code === "upstream-http-error") {
    if (error.status === 401 || error.status === 403) return "read-write-permission-required";
  }
  return fabricSafeErrorCode(error, true);
}

interface Tracker {
  success: number;
  unsupported: number;
  failed: number;
  codes: DefinitionStatusCode[];
}

function track(
  tracker: Tracker,
  result: "success" | "unsupported" | "failed",
  code?: DefinitionStatusCode,
): void {
  tracker[result] += 1;
  if (code && !tracker.codes.includes(code)) tracker.codes.push(code);
}

/** Python `_finish_optional_section`. */
function finishSection(tracker: Tracker): DefinitionStatus {
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

class SafeErrors {
  readonly values: string[] = [];

  constructor(private readonly limit: number) {}

  add(entry: string): void {
    if (this.values.length < this.limit && !this.values.includes(entry)) {
      this.values.push(entry);
    }
  }
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/** Collects bounded definition projections with an application-identity token. */
export async function collectWorkspaceDefinitions(
  token: string,
  request: CollectDefinitionsRequest,
  dependencies: CollectDefinitionDependencies = {},
): Promise<DefinitionStageEnvelope> {
  if (typeof token !== "string" || !token || /\s/.test(token)) {
    throw new Error(TOKEN_UNAVAILABLE_MESSAGE);
  }
  const limits: CollectDefinitionLimits = { ...COLLECT_DEFINITION_LIMITS, ...dependencies.limits };
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
  const errors = new SafeErrors(limits.maxErrors);
  const items: DefinitionItemEvidence[] = [];
  const artifactMetadata: Record<string, DefinitionArtifactMetadata> = {};
  const config: DefinitionConfigEntry[] = [];
  let usedBytes = 0;
  let stopCode: DefinitionStatusCode | undefined;

  const stop = (code: DefinitionStatusCode) => {
    stopCode = code;
    track(tracker, "failed", code);
    errors.add(`definitions: ${code}`);
  };
  const capability = (itemId: string, label: string, value: string) =>
    config.push({ itemId, section: "Metadata capability", label, value });

  for (const item of request.items) {
    const route = DEFINITION_ROUTES.get(item.type);
    if (!route) {
      items.push({ ...item, status: "unsupported", code: "item-type-unsupported" });
      track(tracker, "unsupported", "item-type-unsupported");
      continue;
    }
    if (!stopCode) {
      if (dependencies.signal?.aborted) stop("cancelled");
      else if (deadline.remaining() <= limits.minItemStartMs) stop("deadline-exhausted");
      else if (budget.remaining === 0) stop("request-budget-exhausted");
    }
    if (stopCode) {
      items.push({ ...item, status: "failed", code: "not-attempted" });
      track(tracker, "failed", "not-attempted");
      continue;
    }
    try {
      const response = await client.postLongRunning(
        `/v1/workspaces/${request.workspaceId}/${route}/${item.id}/getDefinition`,
        {
          maxPolls: limits.maxLroPolls,
          minPollDelayMs: limits.minPollDelayMs,
          maxPollDelayMs: limits.maxPollDelayMs,
          maxResponseBytes: limits.maxDefinitionResponseBytes,
        },
        budget,
      );
      const projection = projectDefinition(item.type, response);
      const code: DefinitionStatusCode | undefined = projection.unknownParts
        ? "forward-compatible-parts-skipped"
        : projection.metadataTruncated
          ? "artifact-metadata-truncated"
          : projection.factsTruncated
            ? "projection-truncated"
            : undefined;
      const capabilityRow = (label: string, value: string): DefinitionConfigEntry => ({
        itemId: item.id,
        section: "Metadata capability",
        label,
        value,
      });
      const rows: DefinitionConfigEntry[] = [capabilityRow("Definition enrichment", code ?? "complete")];
      if (projection.unknownParts) {
        rows.push(capabilityRow("Forward-compatible definition parts skipped", String(projection.unknownParts)));
      }
      if (projection.factsTruncated) {
        rows.push(capabilityRow("Definition projection", "Truncated at the safe metadata fact limit"));
      }
      if (projection.metadataTruncated) {
        rows.push(capabilityRow("Artifact metadata projection", "Truncated at the safe selected-element limit"));
      }
      for (const fact of projection.facts) rows.push({ itemId: item.id, ...fact });
      const projectedBytes = byteLength(projection.metadata) + byteLength(rows);
      if (usedBytes + projectedBytes > limits.maxProjectionBytes) {
        // The aggregate projection budget is spent; later items are not attempted.
        items.push({ ...item, status: "failed", code: "response-size-exceeded" });
        track(tracker, "failed", "response-size-exceeded");
        capability(item.id, "Definition enrichment", "response-size-exceeded");
        errors.add(`definitions:${item.id}: response-size-exceeded`);
        stopCode = "response-size-exceeded";
        continue;
      }
      usedBytes += projectedBytes;
      items.push({
        ...item,
        status: "complete",
        ...(code ? { code } : {}),
        ...(projection.unknownParts ? { unknownParts: projection.unknownParts } : {}),
        references: projection.references,
      });
      track(tracker, "success", code);
      artifactMetadata[item.id] = projection.metadata;
      config.push(...rows);
    } catch (error) {
      const code = definitionErrorCode(error);
      const unsupported = UNSUPPORTED_CODES.has(code);
      items.push({ ...item, status: unsupported ? "unsupported" : "failed", code });
      track(tracker, unsupported ? "unsupported" : "failed", code);
      capability(item.id, "Definition enrichment", code);
      if (!unsupported) errors.add(`definitions:${item.id}: ${code}`);
      if (STOP_CODES.has(code)) stopCode = code;
    }
  }

  const section = finishSection(tracker);
  const envelope: DefinitionStageEnvelope = {
    contractVersion: 1,
    stage: "definitions",
    authoritative: false,
    ...(request.correlationId ? { correlationId: request.correlationId } : {}),
    workspaceId: request.workspaceId,
    items,
    artifactMetadata,
    config,
    sections: { definitions: section },
    capabilities: { definitionEnrichment: { ...section } },
    errors: errors.values,
    syncedAt: new Date().toISOString(),
  };
  if (byteLength(envelope) > limits.maxEnvelopeBytes) {
    throw new Error(RESPONSE_TOO_LARGE_MESSAGE);
  }
  return envelope;
}

export async function workspaceCollectDefinitions(
  ctx: RayfinContext<AtlasSchema, AudienceType.Fabric>,
  protocolVersion: unknown,
  workspaceId: unknown,
  items: unknown,
  correlationId: unknown,
  dependencies?: CollectDefinitionDependencies,
): Promise<DefinitionStageEnvelope> {
  const request = validateCollectDefinitionsInput(protocolVersion, workspaceId, items, correlationId);
  await requireAtlasSynchronizer(ctx.getDataClient(), "definition collection", AUTHORIZATION_MESSAGE);
  let token: string;
  try {
    token = ctx.Tokens.Fabric;
  } catch {
    throw new Error(TOKEN_UNAVAILABLE_MESSAGE);
  }
  return collectWorkspaceDefinitions(token, request, dependencies);
}
