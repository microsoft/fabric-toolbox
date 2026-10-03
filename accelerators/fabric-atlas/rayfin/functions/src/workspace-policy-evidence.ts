import { randomUUID } from "node:crypto";
import { AudienceType, type RayfinContext } from "@microsoft/fabric-user-data-functions";
import type { AtlasSchema } from "../../data/schema.js";
import { ExecutionDeadline, FabricRestClient, FabricRestError, RequestBudget } from "./fabric-rest.js";
import { requireAtlasSynchronizer } from "./synchronizer-gate.js";
import { strictUuid } from "./sync/protocol.js";
import {
  POLICY_IDENTITY, POLICY_SOURCE, networkAction, parseAccessPolicyEvidence,
  type AccessPolicyEvidence, type PolicyKind, type PolicyReason,
} from "./policy-evidence-contract.js";

export const POLICY_COLLECT_LIMITS = {
  executionBudgetMs: 35_000, requestTimeoutMs: 6_000, maxAttempts: 2,
  maxRetryAfterMs: 2_000, maxResponseBytes: 16_384, maxRequests: 4,
} as const;
export interface PolicyCollectorDependencies {
  enabled?: boolean;
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  wallClock?: () => number;
}
export interface PolicyCollectionResult { status: "off" | "stored"; records: number; }
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function failure(error: unknown): { coverage: "denied" | "unsupported" | "unavailable"; reason: PolicyReason } {
  if (error instanceof FabricRestError && (error.status === 401 || error.status === 403)) {
    return { coverage: "denied", reason: "read-denied" };
  }
  if (error instanceof FabricRestError && (error.status === 404 || error.status === 405 || error.status === 501)) {
    return { coverage: "unsupported", reason: "endpoint-unsupported" };
  }
  return { coverage: "unavailable", reason: "unavailable" };
}

export async function collectWorkspacePolicyEvidence(
  token: string | undefined,
  workspaceId: string,
  snapshotId: string,
  writerEmail: string,
  dependencies: PolicyCollectorDependencies = {},
): Promise<AccessPolicyEvidence[]> {
  workspaceId = strictUuid(workspaceId);
  snapshotId = strictUuid(snapshotId);
  if (!/^[^\s@]+@[^\s@]+$/.test(writerEmail) || writerEmail.length > 160) {
    throw new Error("A trusted snapshot writer email is required.");
  }
  const clock = () => new Date(dependencies.wallClock?.() ?? Date.now()).toISOString();
  const collectionId = randomUUID();
  const base = (kind: PolicyKind): AccessPolicyEvidence => ({
    id: randomUUID(), workspace_id: workspaceId, snapshotId, collectionId, writerEmail,
    schemaVersion: 1, kind, source: POLICY_SOURCE, collectorIdentity: POLICY_IDENTITY,
    coverage: "unavailable", reason: "token-unavailable", attemptedAt: clock(),
  });
  const central = {
    ...base("fabric-policies-evaluation"), coverage: "unsupported" as const,
    reason: "evaluation-contract-unverified" as const,
  };
  const records: AccessPolicyEvidence[] = [];
  const deadline = new ExecutionDeadline(POLICY_COLLECT_LIMITS.executionBudgetMs);
  const budget = new RequestBudget(POLICY_COLLECT_LIMITS.maxRequests);
  const client = token ? new FabricRestClient(token, {
    deadline, fetch: dependencies.fetch, sleep: dependencies.sleep, ...POLICY_COLLECT_LIMITS,
  }) : undefined;
  for (const kind of ["workspace-networking", "inbound-share-exception"] as const) {
    const record = base(kind);
    if (client) {
      try {
        const suffix = kind === "workspace-networking" ? "" : "/inbound/externalDataShares";
        const response = await client.getObject(
          `/v1/workspaces/${workspaceId}/networking/communicationPolicy${suffix}`, budget,
        );
        if (kind === "workspace-networking") {
          record.inboundPublicAction = networkAction(object(object(response.inbound).publicAccessRules).defaultAction);
          record.outboundPublicAction = networkAction(object(object(response.outbound).publicAccessRules).defaultAction);
        } else {
          record.externalSharesBypassAction = networkAction(response.defaultAction);
        }
        const values = [record.inboundPublicAction, record.outboundPublicAction, record.externalSharesBypassAction].filter(Boolean);
        if (values.length) {
          record.coverage = kind === "workspace-networking" && values.length === 1 ? "partial" : "observed";
          record.reason = record.coverage === "partial" ? "missing-setting" : "context-only";
          record.observedAt = clock();
        } else {
          record.reason = "malformed-response";
        }
      } catch (error) {
        Object.assign(record, failure(error));
      }
    }
    records.push(parseAccessPolicyEvidence(record, workspaceId, snapshotId));
  }
  records.push(parseAccessPolicyEvidence(central, workspaceId, snapshotId));
  return records;
}

export async function workspaceCollectAccessPolicyEvidence(
  ctx: RayfinContext<AtlasSchema, AudienceType.Fabric>,
  protocolVersion: unknown,
  workspaceInput: unknown,
  snapshotInput: unknown,
  dependencies: PolicyCollectorDependencies = {},
): Promise<PolicyCollectionResult> {
  let workspaceId: string;
  let snapshotId: string;
  try {
    if (protocolVersion !== 1) throw new Error();
    workspaceId = strictUuid(workspaceInput);
    snapshotId = strictUuid(snapshotInput);
  } catch { throw new Error("Use protocolVersion 1 and strict workspace/snapshot UUIDs."); }
  const enabled = dependencies.enabled ?? process.env.RAYFIN_ATLAS_FEATURE_FABRIC_POLICIES === "true";
  if (!enabled) return { status: "off", records: 0 };
  const data = ctx.getDataClient();
  await requireAtlasSynchronizer(data, "policy context collection", "Policy collection requires the configured synchronizer.");
  const markers = await data.Workspace.select(["id", "fabricId", "snapshotId", "writerEmail"])
    .where({ fabricId: workspaceId, snapshotId }).first(1).execute();
  const marker = markers[0];
  if (!marker || marker.fabricId.toLowerCase() !== workspaceId || marker.snapshotId !== snapshotId ||
    !marker.writerEmail || !/^[^\s@]+@[^\s@]+$/.test(marker.writerEmail)) {
    throw new Error("Policy collection requires a published snapshot for the selected workspace.");
  }
  let token: string | undefined;
  try { token = ctx.Tokens.Fabric; } catch { token = undefined; }
  const evidence = await collectWorkspacePolicyEvidence(
    token, workspaceId, snapshotId, marker.writerEmail, dependencies,
  );
  try {
    for (const record of evidence) {
      const { observedAt, attemptedAt, ...fields } = record;
      await data.AccessPolicyEvidence.create({
        ...fields, attemptedAt: new Date(attemptedAt),
        ...(observedAt ? { observedAt: new Date(observedAt) } : {}),
      });
    }
  } catch {
    throw new Error("Optional policy evidence could not be persisted; the catalog was not changed.");
  }
  return { status: "stored", records: evidence.length };
}
