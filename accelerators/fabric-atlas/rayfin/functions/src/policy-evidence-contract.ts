export const POLICY_KINDS = [
  "workspace-networking",
  "inbound-share-exception",
  "fabric-policies-evaluation",
] as const;
export type PolicyKind = (typeof POLICY_KINDS)[number];
export type PolicyCoverage = "observed" | "partial" | "unavailable" | "unsupported" | "denied";
export type NetworkAction = "Allow" | "Deny";
export const POLICY_REASONS = [
  "context-only", "missing-setting", "evaluation-contract-unverified", "token-unavailable",
  "read-denied", "endpoint-unsupported", "unavailable", "malformed-response",
] as const;
export type PolicyReason = (typeof POLICY_REASONS)[number];
export const POLICY_SOURCE = "fabric-core-workspace-policy-v1";
export const POLICY_IDENTITY = "fabric-function-connection-unverified";
export const POLICY_LABELS: Record<PolicyKind, string> = {
  "workspace-networking": "Workspace public-network settings",
  "inbound-share-exception": "Inbound external-share network exception",
  "fabric-policies-evaluation": "Central Fabric Policies evaluation",
};
export const POLICY_DOCS: Record<PolicyKind, string> = {
  "workspace-networking": "https://learn.microsoft.com/en-us/rest/api/fabric/core/workspaces/get-network-communication-policy",
  "inbound-share-exception": "https://learn.microsoft.com/en-us/rest/api/fabric/core/workspaces/get-inbound-external-data-shares-policy",
  "fabric-policies-evaluation": "https://learn.microsoft.com/en-us/fabric/governance/fabric-policies-rest-api",
};
export const POLICY_LIMITATION =
  "Workspace settings are context only, not a principal/item access decision. Central policy evaluation, OneLake roles, DLP and actual data access are not evaluated.";

export interface AccessPolicyEvidence {
  id: string;
  workspace_id: string;
  snapshotId: string;
  collectionId: string;
  writerEmail: string;
  schemaVersion: 1;
  kind: PolicyKind;
  source: typeof POLICY_SOURCE;
  collectorIdentity: typeof POLICY_IDENTITY;
  coverage: PolicyCoverage;
  reason: PolicyReason;
  attemptedAt: string;
  observedAt?: string;
  inboundPublicAction?: NetworkAction;
  outboundPublicAction?: NetworkAction;
  externalSharesBypassAction?: NetworkAction;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function invalid(): never { throw new Error("Policy evidence violated its metadata-only contract."); }
function uuid(value: unknown): string {
  return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : invalid();
}
function timestamp(value: unknown): string {
  const text = value instanceof Date ? value.toISOString() : value;
  return typeof text === "string" && /^\d{4}-\d\d-\d\dT/.test(text) && Number.isFinite(Date.parse(text))
    ? new Date(text).toISOString() : invalid();
}
export function networkAction(value: unknown): NetworkAction | undefined {
  return value === "Allow" || value === "Deny" ? value : undefined;
}

export function parseAccessPolicyEvidence(
  input: unknown,
  workspaceId: string,
  snapshotId: string,
): AccessPolicyEvidence {
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
  const row = input as Record<string, unknown>;
  const kind = row.kind as PolicyKind;
  const coverage = row.coverage as PolicyCoverage;
  if (
    !POLICY_KINDS.includes(kind) || !["observed", "partial", "unavailable", "unsupported", "denied"].includes(coverage) ||
    row.schemaVersion !== 1 || row.source !== POLICY_SOURCE || row.collectorIdentity !== POLICY_IDENTITY ||
    !POLICY_REASONS.includes(row.reason as PolicyReason) ||
    typeof row.writerEmail !== "string" || row.writerEmail.length > 160 || !/^[^\s@]+@[^\s@]+$/.test(row.writerEmail)
  ) invalid();
  const record: AccessPolicyEvidence = {
    id: uuid(row.id), workspace_id: uuid(row.workspace_id), snapshotId: uuid(row.snapshotId),
    collectionId: uuid(row.collectionId), writerEmail: row.writerEmail,
    schemaVersion: 1, kind, source: POLICY_SOURCE, collectorIdentity: POLICY_IDENTITY,
    coverage, reason: row.reason as PolicyReason, attemptedAt: timestamp(row.attemptedAt),
  };
  if (record.workspace_id !== uuid(workspaceId) || record.snapshotId !== uuid(snapshotId)) invalid();
  for (const name of ["inboundPublicAction", "outboundPublicAction", "externalSharesBypassAction"] as const) {
    if (row[name] != null) {
      const action = networkAction(row[name]);
      if (!action) invalid();
      record[name] = action;
    }
  }
  const actions = [record.inboundPublicAction, record.outboundPublicAction, record.externalSharesBypassAction].filter(Boolean);
  if (row.observedAt != null) record.observedAt = timestamp(row.observedAt);
  if (kind === "fabric-policies-evaluation") {
    if (coverage !== "unsupported" || record.reason !== "evaluation-contract-unverified" ||
      actions.length || record.observedAt) invalid();
  } else if (coverage === "observed" || coverage === "partial") {
    if (record.reason !== (coverage === "observed" ? "context-only" : "missing-setting")) invalid();
    if (!record.observedAt || !actions.length || Date.parse(record.observedAt) < Date.parse(record.attemptedAt)) invalid();
    if (kind === "workspace-networking" && (record.externalSharesBypassAction ||
      (coverage === "observed" && (!record.inboundPublicAction || !record.outboundPublicAction)))) invalid();
    if (kind === "inbound-share-exception" && (!record.externalSharesBypassAction ||
      record.inboundPublicAction || record.outboundPublicAction)) invalid();
  } else {
    if (actions.length || record.observedAt) invalid();
    if (coverage === "denied" && record.reason !== "read-denied") invalid();
    if (coverage === "unsupported" && record.reason !== "endpoint-unsupported") invalid();
    if (coverage === "unavailable" && !["token-unavailable", "unavailable", "malformed-response"].includes(record.reason)) invalid();
  }
  return record;
}

export function policyEvidenceSummary(records: readonly AccessPolicyEvidence[]): string {
  return records.map((record) => [
    POLICY_LABELS[record.kind], `coverage ${record.coverage}`, `reason ${record.reason}`,
    ...(record.inboundPublicAction ? [`inbound public default ${record.inboundPublicAction}`] : []),
    ...(record.outboundPublicAction ? [`outbound public default ${record.outboundPublicAction}`] : []),
    ...(record.externalSharesBypassAction ? [`external-share network bypass default ${record.externalSharesBypassAction}`] : []),
    `source ${POLICY_DOCS[record.kind]}`, `attempted ${record.attemptedAt}`,
    `observed ${record.observedAt ?? "Not observed"}`, `identity ${record.collectorIdentity}`,
  ].join("; ")).join(" | ") || "Not collected";
}
