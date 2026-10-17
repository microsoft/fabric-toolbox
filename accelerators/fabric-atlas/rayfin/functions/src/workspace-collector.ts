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
 * First Python-UDF-to-Rayfin-Functions collector tranche: a read-only
 * dual-run stage, not a replacement snapshot. It ports the Fabric Core
 * sanitization of the Python `sync_all` collector for the workspace, items,
 * role assignments and recent item jobs, and returns a v2 "base" envelope for
 * stage validation and parity comparison. Scanner, schema, lineage, access,
 * configuration and definition coverage are reported as unsupported with
 * `collector-not-migrated`, and no `enrichmentItemIds` plan is returned, so the
 * production snapshot validator and browser Sync flow reject this envelope.
 */

export const COLLECT_CORE_LIMITS = {
  ...FABRIC_REST_DEFAULTS,
  // Leaves headroom below the 200-240 second Fabric Functions execution limit.
  executionBudgetMs: 150_000,
  maxItemPages: 100,
  maxItems: 5_000,
  maxRoleAssignmentPages: 50,
  maxRoleAssignments: 2_000,
  maxJobItems: 100,
  maxJobRequests: 150,
  maxJobPagesPerItem: 3,
  maxJobRecordsPerItem: 1_000,
  // Same recent-run bound as the Python collector.
  recentJobsPerItem: 3,
  minJobRequestMs: 5_000,
  maxErrors: 50,
  maxEnvelopeBytes: 8 * 1024 * 1024,
} as const;

export type CollectCoreLimits = {
  [Name in keyof typeof COLLECT_CORE_LIMITS]: number;
};

export interface CollectCoreDependencies {
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  limits?: Partial<CollectCoreLimits>;
}

export interface CollectCoreRequest {
  workspaceId: string;
  correlationId: string | null;
}

export type CollectorStatusCode =
  | FabricSafeErrorCode
  | "job-budget-exhausted"
  | "collector-not-migrated"
  | "not-applicable"
  | "partial-unsupported";

export interface CollectorStatus {
  status: "complete" | "unsupported" | "failed";
  code?: CollectorStatusCode;
}

export type CollectorSectionName =
  | "workspace"
  | "items"
  | "roleAssignments"
  | "jobs"
  | "scanner"
  | "schema"
  | "lineage"
  | "access"
  | "config"
  | "definitions"
  | "kqlSchema"
  | "sqlSchema";

export type CollectorCapabilityName =
  | "endorsement"
  | "sensitivity"
  | "tags"
  | "ownership"
  | "definitionEnrichment"
  | "kqlSchema"
  | "sqlSchema"
  | "objectLineage";

export type CollectedWorkspace = {
  id: string;
  displayName?: string;
  type?: string;
  capacityId?: string;
  capacityRegion?: string;
};

export type CollectedItem = {
  id: string;
  type: string;
  displayName?: string;
  workspaceId?: string;
  folderId?: string;
};

export type CollectedPrincipal = {
  id: string;
  displayName?: string;
  type?: string;
  userType?: string;
  userDetails?: {
    userPrincipalName?: string;
    userType?: string;
  };
};

export type CollectedRoleAssignment = {
  role: string;
  principal: CollectedPrincipal;
};

export type CollectedJob = {
  itemId: string;
  itemDisplayName?: string;
  itemType: string;
  jobType: string;
  status: string;
  id?: string;
  invokeType?: string;
  startTimeUtc?: string;
  endTimeUtc?: string;
  createdTimeUtc?: string;
  lastUpdatedTimeUtc?: string;
};

/** Scanner metadata is not collected by this tranche. */
export interface CollectedItemMetadata {
  scannerMatched: false;
  ownerAvailable: false;
}

export interface WorkspaceCoreEnvelope {
  schemaVersion: 2;
  syncMode: "base";
  /** Present only when the caller supplied a correlation UUID. */
  correlationId?: string;
  /** Omitted when the workspace section failed, as `RawSync.workspace` is non-null. */
  workspace?: CollectedWorkspace;
  items: CollectedItem[];
  roleAssignments: CollectedRoleAssignment[];
  jobs: CollectedJob[];
  access: never[];
  lineage: never[];
  objectEdges: never[];
  config: never[];
  schema: Record<string, never>;
  itemMetadata: Record<string, CollectedItemMetadata>;
  artifactMetadata: Record<string, never>;
  capabilities: Record<CollectorCapabilityName, CollectorStatus>;
  sections: Record<CollectorSectionName, CollectorStatus>;
  errors: string[];
  syncedAt: string;
}

const INVALID_INPUT_MESSAGE =
  "Use protocolVersion 1, a strict workspace UUID and a strict correlation UUID or null.";
const AUTHORIZATION_MESSAGE =
  "Workspace collection requires the configured Atlas administrator.";
const TOKEN_UNAVAILABLE_MESSAGE =
  "The Fabric application token was unavailable.";
const RESPONSE_TOO_LARGE_MESSAGE =
  "Workspace collection exceeded the safe response size.";

const MAX_ID_LENGTH = 128;
const MAX_NAME_LENGTH = 512;
const MAX_TYPE_LENGTH = 128;
const MAX_UPN_LENGTH = 320;
const MAX_TIMESTAMP_LENGTH = 64;
const LOOSE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?$/i;
const JOB_TIMESTAMP_FIELDS = [
  "startTimeUtc",
  "endTimeUtc",
  "createdTimeUtc",
  "lastUpdatedTimeUtc",
] as const;
const JOB_STOP_CODES = new Set<CollectorStatusCode>([
  "deadline-exhausted",
  "retry-after-deferred",
  "rate-limited",
]);

function invalid(): never {
  throw new FabricRestError("invalid-response");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Python `_strict_text`: trimmed non-empty strings only, with a hard bound. */
function strictText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text) return undefined;
  if (text.length > max) invalid();
  return text;
}

/** Python `_normalized_id`: lowercase canonical UUIDs, other IDs verbatim. */
function normalizedId(value: unknown, max = MAX_ID_LENGTH): string | undefined {
  const text = strictText(value, max);
  return text && LOOSE_UUID.test(text) ? text.toLowerCase() : text;
}

function normalizedTimestamp(value: unknown): string | undefined {
  const text = strictText(value, MAX_TIMESTAMP_LENGTH);
  if (!text) return undefined;
  if (!ISO_TIMESTAMP.test(text)) invalid();
  const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text}Z`);
  if (Number.isNaN(date.valueOf())) invalid();
  return date.toISOString();
}

export function sanitizeWorkspace(
  value: unknown,
  workspaceId: string,
): CollectedWorkspace {
  if (!isRecord(value) || normalizedId(value.id) !== workspaceId) invalid();
  const workspace: CollectedWorkspace = { id: workspaceId };
  const displayName = strictText(value.displayName, MAX_NAME_LENGTH);
  const type = strictText(value.type, MAX_TYPE_LENGTH);
  const capacityId = normalizedId(value.capacityId);
  const capacityRegion = strictText(value.capacityRegion, MAX_TYPE_LENGTH);
  if (displayName) workspace.displayName = displayName;
  if (type) workspace.type = type;
  if (capacityId) workspace.capacityId = capacityId;
  if (capacityRegion) workspace.capacityRegion = capacityRegion;
  return workspace;
}

export function sanitizeItem(
  value: unknown,
  workspaceId: string,
): CollectedItem {
  if (!isRecord(value)) invalid();
  const id = normalizedId(value.id) ?? normalizedId(value.objectId);
  // Unknown but real Fabric item types are preserved verbatim.
  const type = strictText(value.type, MAX_TYPE_LENGTH);
  // Item IDs are interpolated into fixed job URLs, so only UUIDs are accepted.
  if (!id || !LOOSE_UUID.test(id) || !type) invalid();
  const item: CollectedItem = { id, type };
  const displayName = strictText(value.displayName, MAX_NAME_LENGTH);
  const itemWorkspaceId = normalizedId(value.workspaceId);
  const folderId = normalizedId(value.folderId);
  if (itemWorkspaceId && itemWorkspaceId !== workspaceId) invalid();
  if (displayName) item.displayName = displayName;
  if (itemWorkspaceId) item.workspaceId = itemWorkspaceId;
  if (folderId) item.folderId = folderId;
  return item;
}

function sanitizeItems(values: unknown[], workspaceId: string): CollectedItem[] {
  const items = values.map((value) => sanitizeItem(value, workspaceId));
  if (new Set(items.map((item) => item.id)).size !== items.length) invalid();
  return items;
}

export function sanitizeRoleAssignment(value: unknown): CollectedRoleAssignment {
  if (!isRecord(value)) invalid();
  const role = strictText(value.role, MAX_TYPE_LENGTH);
  const principal = value.principal;
  if (!role || !isRecord(principal)) invalid();
  const id = normalizedId(principal.id, MAX_UPN_LENGTH);
  const displayName = strictText(principal.displayName, MAX_NAME_LENGTH);
  const type = strictText(principal.type, MAX_TYPE_LENGTH);
  const userType = strictText(principal.userType, MAX_TYPE_LENGTH);
  let userDetails: CollectedPrincipal["userDetails"];
  if (isRecord(principal.userDetails)) {
    const userPrincipalName = strictText(
      principal.userDetails.userPrincipalName,
      MAX_UPN_LENGTH,
    );
    const detailUserType = strictText(
      principal.userDetails.userType,
      MAX_TYPE_LENGTH,
    );
    if (userPrincipalName || detailUserType) {
      userDetails = {};
      if (userPrincipalName) userDetails.userPrincipalName = userPrincipalName;
      if (detailUserType) userDetails.userType = detailUserType;
    }
  }
  const principalId = id ?? userDetails?.userPrincipalName ?? displayName;
  if (!principalId) invalid();
  const safePrincipal: CollectedPrincipal = { id: principalId };
  if (displayName) safePrincipal.displayName = displayName;
  if (type) safePrincipal.type = type;
  if (userType) safePrincipal.userType = userType;
  if (userDetails) safePrincipal.userDetails = userDetails;
  return { role, principal: safePrincipal };
}

export function sanitizeJob(value: unknown, item: CollectedItem): CollectedJob {
  if (!isRecord(value)) invalid();
  const jobType =
    strictText(value.jobType, MAX_TYPE_LENGTH) ??
    strictText(value.invokeType, MAX_TYPE_LENGTH);
  const status = strictText(value.status, MAX_TYPE_LENGTH);
  if (!jobType || !status) invalid();
  const job: CollectedJob = { itemId: item.id, itemType: item.type, jobType, status };
  if (item.displayName) job.itemDisplayName = item.displayName;
  const id = strictText(value.id, MAX_ID_LENGTH);
  const invokeType = strictText(value.invokeType, MAX_TYPE_LENGTH);
  if (id) job.id = id;
  if (invokeType) job.invokeType = invokeType;
  for (const field of JOB_TIMESTAMP_FIELDS) {
    const timestamp = normalizedTimestamp(value[field]);
    if (timestamp) job[field] = timestamp;
  }
  return job;
}

export function validateCollectCoreInput(
  protocolVersion: unknown,
  workspaceId: unknown,
  correlationId: unknown,
): CollectCoreRequest {
  try {
    if (protocolVersion !== 1) throw new Error();
    return {
      workspaceId: strictUuid(workspaceId),
      correlationId: correlationId == null ? null : strictUuid(correlationId),
    };
  } catch {
    throw new Error(INVALID_INPUT_MESSAGE);
  }
}

class SafeErrors {
  readonly values: string[] = [];

  constructor(private readonly limit: number) {}

  add(section: CollectorSectionName, code: CollectorStatusCode): void {
    const entry = `${section}: ${code}`;
    if (this.values.length < this.limit && !this.values.includes(entry)) {
      this.values.push(entry);
    }
  }
}

interface OptionalTracker {
  success: number;
  unsupported: number;
  failed: number;
  codes: CollectorStatusCode[];
}

function track(
  tracker: OptionalTracker,
  result: "success" | "unsupported" | "failed",
  code?: CollectorStatusCode,
): void {
  tracker[result] += 1;
  if (code && !tracker.codes.includes(code)) tracker.codes.push(code);
}

/** Python `_finish_optional_section`. */
function finishOptionalSection(tracker: OptionalTracker): CollectorStatus {
  if (tracker.failed) {
    return { status: "failed", code: tracker.codes[0] ?? "upstream-failure" };
  }
  if (tracker.success) {
    const code = tracker.unsupported ? "partial-unsupported" : tracker.codes[0];
    return code ? { status: "complete", code } : { status: "complete" };
  }
  if (tracker.unsupported) {
    return { status: "unsupported", code: tracker.codes[0] ?? "endpoint-unsupported" };
  }
  return { status: "unsupported", code: "not-applicable" };
}

function sectionFailure(
  section: CollectorSectionName,
  error: unknown,
  errors: SafeErrors,
): CollectorStatus {
  const code = fabricSafeErrorCode(error);
  errors.add(section, code);
  return { status: "failed", code };
}

/** Coverage owned by the Python collector until its port is reviewed. */
function notMigrated(): CollectorStatus {
  return { status: "unsupported", code: "collector-not-migrated" };
}

async function collectRecentJobs(
  client: FabricRestClient,
  workspaceId: string,
  items: CollectedItem[],
  deadline: ExecutionDeadline,
  limits: CollectCoreLimits,
  errors: SafeErrors,
): Promise<{ jobs: CollectedJob[]; status: CollectorStatus }> {
  const tracker: OptionalTracker = { success: 0, unsupported: 0, failed: 0, codes: [] };
  const jobs: CollectedJob[] = [];
  const budget = new RequestBudget(limits.maxJobRequests);
  let stopCode: CollectorStatusCode | undefined;
  for (const [index, item] of items.entries()) {
    if (index >= limits.maxJobItems || budget.remaining === 0) {
      stopCode = "job-budget-exhausted";
      break;
    }
    if (deadline.remaining() <= limits.minJobRequestMs) {
      stopCode = "deadline-exhausted";
      break;
    }
    try {
      const values = await client.list(
        `/v1/workspaces/${workspaceId}/items/${item.id}/jobs/instances`,
        {
          maxPages: limits.maxJobPagesPerItem,
          maxRecords: limits.maxJobRecordsPerItem,
        },
        budget,
      );
      const itemJobs = values
        .slice(0, limits.recentJobsPerItem)
        .map((value) => sanitizeJob(value, item));
      const jobIds = itemJobs.flatMap((job) => (job.id ? [normalizedId(job.id)] : []));
      // A repeated explicit job ID means inconsistent pagination; fail this item closed.
      if (new Set(jobIds).size !== jobIds.length) invalid();
      jobs.push(...itemJobs);
      track(tracker, "success");
    } catch (error) {
      const code = fabricSafeErrorCode(error, true);
      if (code === "request-budget-exhausted") {
        stopCode = "job-budget-exhausted";
        break;
      }
      if (code === "endpoint-unsupported") {
        track(tracker, "unsupported", code);
        continue;
      }
      track(tracker, "failed", code);
      errors.add("jobs", code);
      if (JOB_STOP_CODES.has(code)) break;
    }
  }
  if (stopCode) {
    track(tracker, "failed", stopCode);
    errors.add("jobs", stopCode);
  }
  return { jobs, status: finishOptionalSection(tracker) };
}

/** Collects the Fabric Core base envelope with an application-identity token. */
export async function collectWorkspaceCore(
  token: string,
  request: CollectCoreRequest,
  dependencies: CollectCoreDependencies = {},
): Promise<WorkspaceCoreEnvelope> {
  if (typeof token !== "string" || !token || /\s/.test(token)) {
    throw new Error(TOKEN_UNAVAILABLE_MESSAGE);
  }
  const limits: CollectCoreLimits = { ...COLLECT_CORE_LIMITS, ...dependencies.limits };
  const deadline = new ExecutionDeadline(limits.executionBudgetMs, dependencies.now);
  const client = new FabricRestClient(token, {
    deadline,
    fetch: dependencies.fetch,
    sleep: dependencies.sleep,
    requestTimeoutMs: limits.requestTimeoutMs,
    maxAttempts: limits.maxAttempts,
    maxRetryAfterMs: limits.maxRetryAfterMs,
    maxResponseBytes: limits.maxResponseBytes,
  });
  const errors = new SafeErrors(limits.maxErrors);
  const workspacePath = `/v1/workspaces/${request.workspaceId}`;

  let workspace: CollectedWorkspace | undefined;
  let workspaceStatus: CollectorStatus;
  try {
    workspace = sanitizeWorkspace(
      await client.getObject(workspacePath),
      request.workspaceId,
    );
    workspaceStatus = { status: "complete" };
  } catch (error) {
    workspaceStatus = sectionFailure("workspace", error, errors);
  }

  let items: CollectedItem[] = [];
  let itemsStatus: CollectorStatus;
  try {
    items = sanitizeItems(
      await client.list(`${workspacePath}/items`, {
        maxPages: limits.maxItemPages,
        maxRecords: limits.maxItems,
      }),
      request.workspaceId,
    );
    itemsStatus = { status: "complete" };
  } catch (error) {
    itemsStatus = sectionFailure("items", error, errors);
  }

  let roleAssignments: CollectedRoleAssignment[] = [];
  let roleAssignmentsStatus: CollectorStatus;
  try {
    roleAssignments = (
      await client.list(`${workspacePath}/roleAssignments`, {
        maxPages: limits.maxRoleAssignmentPages,
        maxRecords: limits.maxRoleAssignments,
      })
    ).map(sanitizeRoleAssignment);
    roleAssignmentsStatus = { status: "complete" };
  } catch (error) {
    roleAssignmentsStatus = sectionFailure("roleAssignments", error, errors);
  }

  let jobs: CollectedJob[] = [];
  let jobsStatus: CollectorStatus;
  if (itemsStatus.status === "complete") {
    ({ jobs, status: jobsStatus } = await collectRecentJobs(
      client,
      request.workspaceId,
      items,
      deadline,
      limits,
      errors,
    ));
  } else {
    // Like the Python scanner dependents, jobs inherit the failed items code.
    const code = itemsStatus.code ?? "upstream-failure";
    jobsStatus = { status: "failed", code };
    errors.add("jobs", code);
  }

  const envelope: WorkspaceCoreEnvelope = {
    schemaVersion: 2,
    syncMode: "base",
    ...(request.correlationId ? { correlationId: request.correlationId } : {}),
    ...(workspace ? { workspace } : {}),
    items,
    roleAssignments,
    jobs,
    access: [],
    lineage: [],
    objectEdges: [],
    config: [],
    schema: {},
    itemMetadata: Object.fromEntries(
      items.map((item) => [item.id, { scannerMatched: false, ownerAvailable: false }]),
    ),
    artifactMetadata: {},
    capabilities: {
      endorsement: notMigrated(),
      sensitivity: notMigrated(),
      tags: notMigrated(),
      ownership: notMigrated(),
      definitionEnrichment: notMigrated(),
      kqlSchema: notMigrated(),
      sqlSchema: notMigrated(),
      objectLineage: notMigrated(),
    },
    sections: {
      workspace: workspaceStatus,
      items: itemsStatus,
      roleAssignments: roleAssignmentsStatus,
      jobs: jobsStatus,
      scanner: notMigrated(),
      schema: notMigrated(),
      lineage: notMigrated(),
      access: notMigrated(),
      config: notMigrated(),
      definitions: notMigrated(),
      kqlSchema: notMigrated(),
      sqlSchema: notMigrated(),
    },
    errors: errors.values,
    syncedAt: new Date().toISOString(),
  };
  if (
    new TextEncoder().encode(JSON.stringify(envelope)).byteLength >
    limits.maxEnvelopeBytes
  ) {
    throw new Error(RESPONSE_TOO_LARGE_MESSAGE);
  }
  return envelope;
}

export async function workspaceCollectCore(
  ctx: RayfinContext<AtlasSchema, AudienceType.Fabric>,
  protocolVersion: unknown,
  workspaceId: unknown,
  correlationId: unknown,
  dependencies?: CollectCoreDependencies,
): Promise<WorkspaceCoreEnvelope> {
  const request = validateCollectCoreInput(protocolVersion, workspaceId, correlationId);
  await requireAtlasSynchronizer(
    ctx.getDataClient(),
    "workspace collection",
    AUTHORIZATION_MESSAGE,
  );
  let token: string;
  try {
    token = ctx.Tokens.Fabric;
  } catch {
    throw new Error(TOKEN_UNAVAILABLE_MESSAGE);
  }
  return collectWorkspaceCore(token, request, dependencies);
}
