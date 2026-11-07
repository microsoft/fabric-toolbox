import { AudienceType, type RayfinContext } from "@microsoft/fabric-user-data-functions";
import type { AtlasSchema } from "../../data/schema.js";
import {
  ExecutionDeadline, FABRIC_REST_DEFAULTS, FabricRestClient, FabricRestError,
  RequestBudget, fabricSafeErrorCode, type FabricSafeErrorCode,
} from "./fabric-rest.js";
import {
  PowerBiProjectionError, metadataRecord, metadataText, projectReport, projectSemanticModel,
  type ModelProjection, type ModelTable, type PowerBiProjectionCode, type ReportProjection,
} from "./powerbi-projections.js";
import { requireAtlasSynchronizer } from "./synchronizer-gate.js";
import { strictUuid } from "./sync/protocol.js";

export type PowerBiItemInput = { id: string; type: "Report" | "SemanticModel" };
export type PowerBiItemsInput = PowerBiItemInput[];
// Named input aliases let strict validators inspect raw values without primitive coercion.
export type PowerBiAdminEvidenceInput = boolean;
export type PowerBiCode =
  | FabricSafeErrorCode | PowerBiProjectionCode
  | "not-attempted" | "not-applicable" | "admin-evidence-not-requested"
  | "tenant-admin-api-permission-required" | "read-write-permission-required"
  | "owner-not-exposed" | "pbir-legacy-pages-unsupported" | "report-reference-unavailable"
  | "tags-not-exposed"
  | "literal-content-omitted" | "static-dependency-subset" | "partial-unsupported"
  | "powerbi-audience-unavailable" | "metadata-only-policy" | "preview-api";
export type PowerBiStatus = { status: "complete" | "unsupported" | "failed"; code?: PowerBiCode };
export type PowerBiPrincipal = {
  principalId: string;
  displayName?: string;
  email?: string;
  principalType: "User" | "Group" | "ServicePrincipal" | "ServicePrincipalProfile" | "EntireTenant";
};
export type PowerBiAccessEvidence = {
  itemId: string;
  principal: PowerBiPrincipal;
  permissions: string[];
  additionalPermissions: string[];
  source: "fabric-admin-item-access-preview";
};
export type PowerBiOwnerEvidence = PowerBiPrincipal & { source: "fabric-admin-creatorPrincipal-preview" };
export type PowerBiItemEvidence = PowerBiItemInput & {
  identity: PowerBiStatus;
  definition: PowerBiStatus;
  schema: PowerBiStatus;
  expressions: PowerBiStatus;
  dependencies: PowerBiStatus;
  pages: PowerBiStatus;
  modelReference: PowerBiStatus;
  ownership: PowerBiStatus;
  access: PowerBiStatus;
  tags: PowerBiStatus;
};
export type PowerBiBlocker = {
  capability: string;
  code: string;
  observedOn: "2026-10-02";
  rayfinVersion: "1.36.2";
  requiredCapability: string;
};

export const POWERBI_BLOCKERS: readonly PowerBiBlocker[] = [
  {
    capability: "scannerParity", code: "powerbi-audience-unavailable",
    observedOn: "2026-10-02", rayfinVersion: "1.36.2",
    requiredCapability: "Enable the optional approved Secret Store service-principal scanner adapter, or provide a documented Power BI REST application binding. Tenant read-only admin API approval and detailed metadata/DAX scanning settings remain required. Fabric tokens must not be retargeted to api.powerbi.com.",
  },
  {
    capability: "engineDependencies", code: "application-semantic-model-connector-unavailable",
    observedOn: "2026-10-02", rayfinVersion: "1.36.2",
    requiredCapability: "A documented application-authenticated XMLA/metadata connector with model permissions and INFO dependency support. The installed fabric-semanticmodel connector is delegated-only; Power BI executeQueries explicitly excludes INFO/DMV.",
  },
  {
    capability: "mashupAndCalculatedTableExpressions", code: "metadata-only-policy",
    observedOn: "2026-10-02", rayfinVersion: "1.36.2",
    requiredCapability: "A reviewed metadata-only projection for M/partition sources and calculated table expressions; raw sources can embed credentials or business rows and are not returned.",
  },
  {
    capability: "legacyReportPages", code: "pbir-legacy-pages-unsupported",
    observedOn: "2026-10-02", rayfinVersion: "1.36.2",
    requiredCapability: "PBIR page parts, or a documented deployed Power BI REST audience for Reports Get Pages. Undocumented PBIR-Legacy section internals are not parsed.",
  },
];

export const COLLECT_POWERBI_LIMITS = {
  ...FABRIC_REST_DEFAULTS,
  executionBudgetMs: 150_000,
  maxItems: 8,
  maxRequests: 120,
  maxResponseBytes: 1024 * 1024,
  maxDefinitionResponseBytes: 16 * 1024 * 1024,
  maxLroPolls: 12,
  minPollDelayMs: 1_000,
  maxPollDelayMs: 5_000,
  minItemStartMs: 5_000,
  maxAccessRecords: 2_000,
  maxEnvelopeBytes: 20 * 1024 * 1024,
} as const;
export type PowerBiLimits = { [Key in keyof typeof COLLECT_POWERBI_LIMITS]: number };
export type PowerBiDependencies = {
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  signal?: AbortSignal;
  limits?: Partial<PowerBiLimits>;
};
export type PowerBiRequest = {
  workspaceId: string;
  items: PowerBiItemInput[];
  includeAdminEvidence: boolean;
  correlationId: string | null;
};
export interface PowerBiStageEnvelope {
  contractVersion: 1;
  stage: "powerbi-metadata";
  authoritative: false;
  workspaceId: string;
  correlationId?: string;
  coverage: {
    modelSchema: "tmsl-structural-projection";
    daxExpressions: "sanitized-measures-and-calculated-columns";
    dependencies: "static-resolved-subset";
    pages: "pbir-only";
    ownershipAccess: "opt-in-fabric-admin-preview";
    itemLineage: "verified-same-workspace-model-to-report-subset";
  };
  items: PowerBiItemEvidence[];
  catalogItems: { id: string; type: "Report" | "SemanticModel"; displayName?: string; workspaceId: string }[];
  /** RawSync-compatible structural subset, without rows or descriptions. */
  schema: Record<string, ModelTable[]>;
  models: Record<string, ModelProjection>;
  reports: Record<string, ReportProjection>;
  ownerEvidence: Record<string, PowerBiOwnerEvidence>;
  /** Selected public Fabric admin metadata, never scanner or default-identity inference. */
  itemMetadata: Record<string, {
    scannerMatched: false;
    ownerAvailable: boolean;
    owner?: { principalId: string; displayName?: string; email?: string; source: "fabric-admin-creatorPrincipal-preview" };
    modifiedDateTime?: string;
    tags?: { id: string; displayName: string }[];
  }>;
  accessEvidence: PowerBiAccessEvidence[];
  /** Only same-workspace endpoints independently verified through Fabric Items. */
  lineage: { source: string; target: string; relation: "report semantic model"; sourceWorkspaceId: string; targetWorkspaceId: string }[];
  sections: {
    scanner: PowerBiStatus;
    lineage: PowerBiStatus;
    schema: PowerBiStatus;
    access: PowerBiStatus;
  };
  capabilities: {
    modelSchema: PowerBiStatus;
    daxExpressions: PowerBiStatus;
    mashupExpressions: PowerBiStatus;
    calculatedTableExpressions: PowerBiStatus;
    engineDependencies: PowerBiStatus;
    reportPages: PowerBiStatus;
    ownership: PowerBiStatus;
    accessDetails: PowerBiStatus;
    endorsement: PowerBiStatus;
    sensitivity: PowerBiStatus;
    tags: PowerBiStatus;
    scannerParity: PowerBiStatus;
  };
  blockers: PowerBiBlocker[];
  errors: string[];
  syncedAt: string;
}

const INPUT_ERROR = "Use protocolVersion 1, a strict workspace UUID, 1-8 unique Report/SemanticModel {id, type} items, a boolean includeAdminEvidence and a strict correlation UUID or null.";
const AUTH_ERROR = "Power BI metadata collection requires the configured Atlas administrator.";
const TOKEN_ERROR = "The Fabric application token was unavailable.";
const complete = (): PowerBiStatus => ({ status: "complete" });
const unsupported = (code: PowerBiCode): PowerBiStatus => ({ status: "unsupported", code });
const STOP_CODES = new Set<PowerBiCode>([
  "deadline-exhausted", "request-timeout", "retry-after-deferred", "rate-limited",
  "request-budget-exhausted", "cancelled",
]);

export function validatePowerBiInput(
  protocolVersion: unknown, workspaceId: unknown, items: unknown,
  includeAdminEvidence: unknown, correlationId: unknown,
): PowerBiRequest {
  try {
    if (protocolVersion !== 1 || typeof includeAdminEvidence !== "boolean" ||
      !Array.isArray(items) || items.length < 1 || items.length > COLLECT_POWERBI_LIMITS.maxItems) throw new Error();
    const seen = new Set<string>();
    const batch = items.map((value: unknown): PowerBiItemInput => {
      const item = metadataRecord(value);
      if (Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) throw new Error();
      if (Object.keys(item).sort().join(",") !== "id,type") throw new Error();
      const id = strictUuid(item.id);
      if (seen.has(id) || (item.type !== "SemanticModel" && item.type !== "Report")) throw new Error();
      seen.add(id);
      return { id, type: item.type };
    });
    return {
      workspaceId: strictUuid(workspaceId), items: batch, includeAdminEvidence,
      correlationId: correlationId == null ? null : strictUuid(correlationId),
    };
  } catch { throw new Error(INPUT_ERROR); }
}

type PermissionScope = "item-read" | "definition" | "admin";
function failure(error: unknown, permission: PermissionScope): PowerBiStatus {
  if (error instanceof PowerBiProjectionError) {
    return { status: error.code === "format-unsupported" ? "unsupported" : "failed", code: error.code };
  }
  if (error instanceof FabricRestError && error.code === "upstream-http-error" &&
    (error.status === 401 || error.status === 403)) {
    return unsupported(permission === "admin" ? "tenant-admin-api-permission-required" :
      permission === "definition" ? "read-write-permission-required" : "authorization-failed");
  }
  const code = fabricSafeErrorCode(error, true);
  return {
    status: code === "endpoint-unsupported" || code === "encrypted-label-blocked" ? "unsupported" : "failed",
    code,
  };
}

function summary(values: PowerBiStatus[]): PowerBiStatus {
  if (!values.length) return unsupported("not-applicable");
  const failed = values.find((value) => value.status === "failed");
  if (failed) return { ...failed };
  if (values.every((value) => value.status === "complete")) return complete();
  return unsupported(values.some((value) => value.status === "complete") ? "partial-unsupported" : values[0].code ?? "not-applicable");
}

function uuid(value: unknown): string {
  try { return strictUuid(value); } catch { throw new PowerBiProjectionError("invalid-definition"); }
}

function principal(value: unknown): PowerBiPrincipal {
  const raw = metadataRecord(value);
  if (!["User", "Group", "ServicePrincipal", "ServicePrincipalProfile", "EntireTenant"].includes(String(raw.type))) {
    throw new PowerBiProjectionError("invalid-definition");
  }
  const details = raw.userDetails === undefined ? undefined : metadataRecord(raw.userDetails);
  return {
    principalId: uuid(raw.id),
    principalType: raw.type as PowerBiPrincipal["principalType"],
    ...(raw.displayName === undefined ? {} : { displayName: metadataText(raw.displayName) }),
    ...(details?.userPrincipalName === undefined ? {} : { email: metadataText(details.userPrincipalName) }),
  };
}

function permissionList(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 64) throw new PowerBiProjectionError("invalid-definition");
  return [...new Set(value.map((permission) => {
    const text = metadataText(permission);
    if (!/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(text)) throw new PowerBiProjectionError("invalid-definition");
    return text;
  }))];
}

export async function collectWorkspacePowerBi(
  token: string, input: PowerBiRequest, dependencies: PowerBiDependencies = {},
): Promise<PowerBiStageEnvelope> {
  // Revalidate even the testable lower-level entry point; no unchecked path interpolation.
  const request = validatePowerBiInput(1, input.workspaceId, input.items, input.includeAdminEvidence, input.correlationId);
  if (typeof token !== "string" || !token || /\s/.test(token)) throw new Error(TOKEN_ERROR);
  const limits = { ...COLLECT_POWERBI_LIMITS, ...dependencies.limits };
  const deadline = new ExecutionDeadline(limits.executionBudgetMs, dependencies.now);
  const budget = new RequestBudget(limits.maxRequests);
  const client = new FabricRestClient(token, { ...limits, deadline, ...dependencies });
  const envelope: PowerBiStageEnvelope = {
    contractVersion: 1, stage: "powerbi-metadata", authoritative: false,
    workspaceId: request.workspaceId,
    ...(request.correlationId ? { correlationId: request.correlationId } : {}),
    coverage: {
      modelSchema: "tmsl-structural-projection",
      daxExpressions: "sanitized-measures-and-calculated-columns",
      dependencies: "static-resolved-subset",
      pages: "pbir-only",
      ownershipAccess: "opt-in-fabric-admin-preview",
      itemLineage: "verified-same-workspace-model-to-report-subset",
    },
    items: [], catalogItems: [], schema: {}, models: {}, reports: {}, itemMetadata: {},
    ownerEvidence: {}, accessEvidence: [], lineage: [],
    sections: {
      scanner: unsupported("powerbi-audience-unavailable"), lineage: unsupported("powerbi-audience-unavailable"),
      schema: unsupported("not-applicable"), access: unsupported("not-applicable"),
    },
    capabilities: {
      modelSchema: unsupported("not-applicable"), daxExpressions: unsupported("not-applicable"),
      mashupExpressions: unsupported("metadata-only-policy"), calculatedTableExpressions: unsupported("metadata-only-policy"),
      engineDependencies: unsupported("static-dependency-subset"), reportPages: unsupported("not-applicable"),
      ownership: unsupported("not-applicable"), accessDetails: unsupported("not-applicable"),
      endorsement: unsupported("powerbi-audience-unavailable"), sensitivity: unsupported("powerbi-audience-unavailable"),
      tags: unsupported("not-applicable"),
      scannerParity: unsupported("powerbi-audience-unavailable"),
    },
    blockers: POWERBI_BLOCKERS.map((blocker) => ({ ...blocker })), errors: [], syncedAt: new Date().toISOString(),
  };
  let stopCode: PowerBiCode | undefined;
  const attempt = async (action: () => Promise<PowerBiStatus>, permission: PermissionScope = "definition"): Promise<PowerBiStatus> => {
    if (dependencies.signal?.aborted) stopCode = "cancelled";
    else if (deadline.remaining() <= limits.minItemStartMs) stopCode = "deadline-exhausted";
    else if (budget.remaining === 0) stopCode = "request-budget-exhausted";
    if (stopCode) return { status: "failed", code: stopCode };
    try { return await action(); } catch (error) {
      const status = failure(error, permission);
      if (status.code && STOP_CODES.has(status.code)) stopCode = status.code;
      return status;
    }
  };
  for (const item of request.items) {
    const evidence: PowerBiItemEvidence = {
      ...item, identity: { status: "failed", code: "not-attempted" },
      definition: { status: "failed", code: "not-attempted" },
      schema: unsupported("not-applicable"), expressions: unsupported("not-applicable"),
      dependencies: unsupported("static-dependency-subset"), pages: unsupported("not-applicable"),
      modelReference: unsupported("not-applicable"),
      ownership: unsupported("admin-evidence-not-requested"), access: unsupported("admin-evidence-not-requested"),
      tags: unsupported("admin-evidence-not-requested"),
    };
    envelope.items.push(evidence);
    evidence.identity = await attempt(async () => {
      const raw = await client.getObject(`/v1/workspaces/${request.workspaceId}/items/${item.id}`, budget);
      if (uuid(raw.id) !== item.id || raw.type !== item.type ||
        (raw.workspaceId !== undefined && uuid(raw.workspaceId) !== request.workspaceId)) {
        throw new PowerBiProjectionError("invalid-definition");
      }
      envelope.catalogItems.push({
        ...item, workspaceId: request.workspaceId,
        ...(raw.displayName === undefined ? {} : { displayName: metadataText(raw.displayName) }),
      });
      envelope.itemMetadata[item.id] = { scannerMatched: false, ownerAvailable: false };
      return complete();
    }, "item-read");
    if (evidence.identity.status !== "complete") {
      evidence.definition = { ...evidence.identity };
      if (item.type === "SemanticModel") {
        evidence.schema = { ...evidence.identity };
        evidence.expressions = { ...evidence.identity };
      } else {
        evidence.pages = { ...evidence.identity };
        evidence.modelReference = { ...evidence.identity };
      }
      evidence.ownership = { ...evidence.identity };
      evidence.access = { ...evidence.identity };
      evidence.tags = { ...evidence.identity };
    } else {
      evidence.definition = await attempt(async () => {
        const route = item.type === "SemanticModel" ? "semanticModels" : "reports";
        const response = await client.postLongRunning(
          `/v1/workspaces/${request.workspaceId}/${route}/${item.id}/getDefinition`,
          { ...limits, maxPolls: limits.maxLroPolls, maxResponseBytes: limits.maxDefinitionResponseBytes },
          budget, item.type === "SemanticModel" ? { format: "TMSL" } : undefined,
        );
        if (item.type === "SemanticModel") {
          const model = projectSemanticModel(response);
          envelope.models[item.id] = model;
          envelope.schema[item.id] = model.tables;
          evidence.schema = complete();
          evidence.expressions = model.expressionsOmitted ? unsupported("literal-content-omitted") : complete();
        } else {
          const report = projectReport(response);
          envelope.reports[item.id] = report;
          evidence.pages = report.pagesSupported ? complete() : unsupported("pbir-legacy-pages-unsupported");
          evidence.modelReference = report.semanticModelId ? complete() : unsupported("report-reference-unavailable");
        }
        return complete();
      });
      if (evidence.definition.status !== "complete") {
        if (item.type === "SemanticModel") {
          evidence.schema = { ...evidence.definition };
          evidence.expressions = { ...evidence.definition };
        } else {
          evidence.pages = { ...evidence.definition };
          evidence.modelReference = { ...evidence.definition };
        }
      }
      if (request.includeAdminEvidence) {
        const path = `/v1/admin/workspaces/${request.workspaceId}/items/${item.id}`;
        evidence.ownership = await attempt(async () => {
          const raw = await client.getObject(path, budget, { type: item.type });
          if (uuid(raw.id) !== item.id || raw.type !== item.type || uuid(raw.workspaceId) !== request.workspaceId) {
            throw new PowerBiProjectionError("invalid-definition");
          }
          const owner = raw.creatorPrincipal === undefined ? undefined : {
            ...principal(raw.creatorPrincipal), source: "fabric-admin-creatorPrincipal-preview" as const,
          };
          let modifiedDateTime: string | undefined;
          if (raw.lastUpdatedDate !== undefined) {
            const timestamp = metadataText(raw.lastUpdatedDate);
            if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})?$/.test(timestamp)) {
              throw new PowerBiProjectionError("invalid-definition");
            }
            const date = new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) ? timestamp : `${timestamp}Z`);
            if (Number.isNaN(date.valueOf())) throw new PowerBiProjectionError("invalid-definition");
            modifiedDateTime = date.toISOString();
          }
          let tags: { id: string; displayName: string }[] | undefined;
          if (raw.tags !== undefined) {
            if (!Array.isArray(raw.tags) || raw.tags.length > 256) throw new PowerBiProjectionError("invalid-definition");
            tags = raw.tags.map((value: unknown) => {
              const tag = metadataRecord(value);
              return { id: uuid(tag.id), displayName: metadataText(tag.displayName) };
            });
          }
          // Commit the selected projection only after every selected field validates.
          if (owner) envelope.ownerEvidence[item.id] = owner;
          envelope.itemMetadata[item.id] = {
            scannerMatched: false, ownerAvailable: !!owner,
            ...(owner ? { owner: {
              principalId: owner.principalId, displayName: owner.displayName, email: owner.email, source: owner.source,
            } } : {}),
            ...(modifiedDateTime ? { modifiedDateTime } : {}),
            ...(tags ? { tags } : {}),
          };
          evidence.tags = tags ? { status: "complete", code: "preview-api" } : unsupported("tags-not-exposed");
          return owner ? { status: "complete", code: "preview-api" } : unsupported("owner-not-exposed");
        }, "admin");
        if (evidence.tags.code === "admin-evidence-not-requested") evidence.tags = { ...evidence.ownership };
        evidence.access = await attempt(async () => {
          const raw = await client.getObject(`${path}/users`, budget, { type: item.type });
          if (!Array.isArray(raw.accessDetails)) throw new PowerBiProjectionError("invalid-definition");
          if (raw.accessDetails.length > limits.maxAccessRecords) {
            throw new PowerBiProjectionError("projection-limit-exceeded");
          }
          const access = raw.accessDetails.map((value: unknown): PowerBiAccessEvidence => {
            const record = metadataRecord(value);
            const details = metadataRecord(record.itemAccessDetails);
            if (details.type !== item.type) throw new PowerBiProjectionError("invalid-definition");
            return {
              itemId: item.id, principal: principal(record.principal),
              permissions: permissionList(details.permissions),
              additionalPermissions: permissionList(details.additionalPermissions),
              source: "fabric-admin-item-access-preview",
            };
          });
          // This endpoint does not document pagination. Do not silently call a partial list complete.
          if (raw.continuationToken != null || raw.continuationUri != null) {
            throw new PowerBiProjectionError("invalid-definition");
          }
          envelope.accessEvidence.push(...access);
          return { status: "complete", code: "preview-api" };
        }, "admin");
      }
    }
    for (const [section, status] of Object.entries(evidence)) {
      if (typeof status === "object" && status.status === "failed" && envelope.errors.length < 64) {
        envelope.errors.push(`powerbi:${item.id}:${section}: ${status.code ?? "upstream-failure"}`);
      }
    }
    guardEnvelope(envelope, token, limits.maxEnvelopeBytes);
  }
  const verifiedModels = new Set(envelope.catalogItems.filter((item) => item.type === "SemanticModel").map((item) => item.id));
  for (const [reportId, report] of Object.entries(envelope.reports)) {
    if (report.semanticModelId && verifiedModels.has(report.semanticModelId)) {
      envelope.lineage.push({
        source: report.semanticModelId, target: reportId, relation: "report semantic model",
        sourceWorkspaceId: request.workspaceId, targetWorkspaceId: request.workspaceId,
      });
    }
  }
  const models = envelope.items.filter((item) => item.type === "SemanticModel");
  const reports = envelope.items.filter((item) => item.type === "Report");
  envelope.capabilities.modelSchema = envelope.sections.schema = summary(models.map((item) => item.schema));
  envelope.capabilities.daxExpressions = summary(models.map((item) => item.expressions));
  envelope.capabilities.reportPages = summary(reports.map((item) => item.pages));
  envelope.capabilities.ownership = summary(envelope.items.map((item) => item.ownership));
  envelope.capabilities.tags = summary(envelope.items.map((item) => item.tags));
  envelope.capabilities.accessDetails = envelope.sections.access = summary(envelope.items.map((item) => item.access));
  guardEnvelope(envelope, token, limits.maxEnvelopeBytes);
  return envelope;
}

function guardEnvelope(envelope: PowerBiStageEnvelope, token: string, maxBytes: number): void {
  const json = JSON.stringify(envelope);
  if (json.includes(token)) throw new Error("Power BI metadata contained unsafe content.");
  if (new TextEncoder().encode(json).byteLength > maxBytes) {
    throw new Error("Power BI metadata exceeded the safe response size.");
  }
}

export async function workspaceCollectPowerBi(
  ctx: RayfinContext<AtlasSchema, AudienceType.Fabric>,
  protocolVersion: unknown, workspaceId: unknown, items: unknown,
  includeAdminEvidence: unknown, correlationId: unknown,
  dependencies?: PowerBiDependencies,
): Promise<PowerBiStageEnvelope> {
  const request = validatePowerBiInput(protocolVersion, workspaceId, items, includeAdminEvidence, correlationId);
  await requireAtlasSynchronizer(ctx.getDataClient(), "Power BI metadata collection", AUTH_ERROR);
  let token: string;
  try { token = ctx.Tokens.Fabric; } catch { throw new Error(TOKEN_ERROR); }
  return collectWorkspacePowerBi(token, request, dependencies);
}
