/*
 * Optional, read-only governance evidence collected by the
 * `workspaceCollectGovernance` Function (v2.6). Every section carries its own
 * status: a section that is missing, unsupported or failed must surface as
 * Unknown in the UI, never as a healthy state.
 */

export type GovernanceEvidenceStatus = "complete" | "unsupported" | "failed";

export interface GovernanceSectionState {
  status: GovernanceEvidenceStatus;
  code?: string;
}

export interface FabricDomainInfo {
  id: string;
  displayName: string;
  parentDomainId?: string;
  description?: string;
  defaultSensitivityLabelId?: string;
  /** Workspaces assigned to the domain tenant-wide; undefined when unknown. */
  workspaceCount?: number;
}

export interface FabricTagInfo {
  id: string;
  displayName: string;
  scope: "tenant" | "domain";
  domainId?: string;
}

export interface TenantSettingInfo {
  settingName: string;
  title: string;
  enabled: boolean;
  group?: string;
}

export interface NetworkPolicyInfo {
  inboundPublicAccess?: "Allow" | "Deny";
  outboundPublicAccess?: "Allow" | "Deny";
  /** Workspace IP firewall rules are configured. */
  ipFirewall?: boolean;
  /** Trusted workspace access via workspace identity, with its shortcut count. */
  trustedWorkspaceAccess?: { enabled: boolean; shortcuts?: number };
  /** Customer-managed key encryption is on. */
  customerManagedKey?: boolean;
}

export interface ExternalShareInfo {
  itemId: string;
  shareId: string;
  status: string;
  recipient?: string;
  recipientTenantId?: string;
  createdBy?: string;
  expiresAt?: string;
  createdAt?: string;
  paths: string[];
}

export interface OneLakeRoleInfo {
  itemId: string;
  roleName: string;
  permissions: string[];
  paths: string[];
  memberIds: string[];
  itemMemberCount: number;
  rowSecurity: boolean;
  columnSecurity: boolean;
  /** Row-level security predicates (`constraints.rows`). */
  rowFilters?: { tablePath: string; predicate: string }[];
  /** Column-level security rules (`constraints.columns`). */
  columnRules?: { tablePath: string; effect: string; columns: string[] }[];
}

export interface GovernanceEvidence {
  collectedAt: string;
  domains: { status: GovernanceSectionState; entries: FabricDomainInfo[] };
  tags: { status: GovernanceSectionState; entries: FabricTagInfo[] };
  tenantSettings: { status: GovernanceSectionState; entries: TenantSettingInfo[] };
  network: { status: GovernanceSectionState; policy?: NetworkPolicyInfo };
  externalShares: { status: GovernanceSectionState; entries: ExternalShareInfo[] };
  oneLakeRoles: { status: GovernanceSectionState; entries: OneLakeRoleInfo[] };
}

const LIMIT = 5_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown, max = 512): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

function strings(value: unknown, max = 500): string[] {
  return Array.isArray(value) ? value.flatMap((entry) => str(entry, 400) ?? []).slice(0, max) : [];
}

function sectionState(value: unknown): GovernanceSectionState {
  if (!isRecord(value)) return { status: "failed", code: "invalid-response" };
  const status = value.status;
  if (status !== "complete" && status !== "unsupported" && status !== "failed") return { status: "failed", code: "invalid-response" };
  const code = str(value.code, 80);
  return { status, ...(code ? { code } : {}) };
}

function entries<T>(section: unknown, parse: (value: Record<string, unknown>) => T | undefined): { status: GovernanceSectionState; entries: T[] } {
  if (!isRecord(section)) return { status: { status: "failed", code: "invalid-response" }, entries: [] };
  const values = Array.isArray(section.entries) ? section.entries.slice(0, LIMIT) : [];
  return {
    status: sectionState(section.status),
    entries: values.flatMap((value) => (isRecord(value) ? parse(value) : undefined) ?? []),
  };
}

function access(value: unknown): "Allow" | "Deny" | undefined {
  return value === "Allow" || value === "Deny" ? value : undefined;
}

/** Strictly parses an untrusted envelope (Function output or persisted JSON). */
export function parseGovernanceEvidence(value: unknown): GovernanceEvidence | undefined {
  if (!isRecord(value)) return undefined;
  const collectedAt = str(value.collectedAt, 64);
  if (!collectedAt) return undefined;
  const network = isRecord(value.network) ? value.network : undefined;
  const policy = network && isRecord(network.policy) ? network.policy : undefined;
  const inbound = access(policy?.inboundPublicAccess);
  const outbound = access(policy?.outboundPublicAccess);
  const ipFirewall = typeof policy?.ipFirewall === "boolean" ? policy.ipFirewall : undefined;
  const cmk = typeof policy?.customerManagedKey === "boolean" ? policy.customerManagedKey : undefined;
  const trustedRaw = policy && isRecord(policy.trustedWorkspaceAccess) ? policy.trustedWorkspaceAccess : undefined;
  const trusted =
    trustedRaw && typeof trustedRaw.enabled === "boolean"
      ? {
          enabled: trustedRaw.enabled,
          ...(typeof trustedRaw.shortcuts === "number" && Number.isFinite(trustedRaw.shortcuts)
            ? { shortcuts: Math.max(0, Math.floor(trustedRaw.shortcuts)) }
            : {}),
        }
      : undefined;
  return {
    collectedAt,
    domains: entries(value.domains, (v) => {
      const id = str(v.id, 128);
      const displayName = str(v.displayName, 256);
      if (!id || !displayName) return undefined;
      const parentDomainId = str(v.parentDomainId, 128);
      const description = str(v.description);
      const label = str(v.defaultSensitivityLabelId, 128);
      const workspaceCount = typeof v.workspaceCount === "number" && Number.isSafeInteger(v.workspaceCount) && v.workspaceCount >= 0 ? v.workspaceCount : undefined;
      return {
        id: id.toLowerCase(), displayName,
        ...(workspaceCount != null ? { workspaceCount } : {}),
        ...(parentDomainId ? { parentDomainId: parentDomainId.toLowerCase() } : {}),
        ...(description ? { description } : {}),
        ...(label ? { defaultSensitivityLabelId: label.toLowerCase() } : {}),
      };
    }),
    tags: entries(value.tags, (v) => {
      const id = str(v.id, 128);
      const displayName = str(v.displayName, 256);
      if (!id || !displayName) return undefined;
      const domainId = str(v.domainId, 128);
      return { id: id.toLowerCase(), displayName, scope: v.scope === "domain" ? "domain" as const : "tenant" as const, ...(domainId ? { domainId: domainId.toLowerCase() } : {}) };
    }),
    tenantSettings: entries(value.tenantSettings, (v) => {
      const settingName = str(v.settingName, 200);
      if (!settingName || typeof v.enabled !== "boolean") return undefined;
      const group = str(v.group, 200);
      return { settingName, title: str(v.title, 300) ?? settingName, enabled: v.enabled, ...(group ? { group } : {}) };
    }),
    network: {
      status: network ? sectionState(network.status) : { status: "failed", code: "invalid-response" },
      ...(policy ? { policy: { ...(inbound ? { inboundPublicAccess: inbound } : {}), ...(outbound ? { outboundPublicAccess: outbound } : {}), ...(ipFirewall != null ? { ipFirewall } : {}), ...(trusted ? { trustedWorkspaceAccess: trusted } : {}), ...(cmk != null ? { customerManagedKey: cmk } : {}) } } : {}),
    },
    externalShares: entries(value.externalShares, (v) => {
      const itemId = str(v.itemId, 128);
      const shareId = str(v.shareId, 128);
      if (!itemId || !shareId) return undefined;
      const recipient = str(v.recipient, 320);
      const recipientTenantId = str(v.recipientTenantId, 128);
      const createdBy = str(v.createdBy, 320);
      const expiresAt = str(v.expiresAt, 64);
      const createdAt = str(v.createdAt, 64);
      return {
        itemId: itemId.toLowerCase(), shareId, status: str(v.status, 64) ?? "Unknown",
        ...(recipient ? { recipient } : {}),
        ...(recipientTenantId ? { recipientTenantId } : {}),
        ...(createdBy ? { createdBy } : {}),
        ...(expiresAt ? { expiresAt } : {}),
        ...(createdAt ? { createdAt } : {}),
        paths: strings(v.paths, 20),
      };
    }),
    oneLakeRoles: entries(value.oneLakeRoles, (v) => {
      const itemId = str(v.itemId, 128);
      const roleName = str(v.roleName, 256);
      if (!itemId || !roleName) return undefined;
      return {
        itemId: itemId.toLowerCase(), roleName,
        permissions: strings(v.permissions, 20), paths: strings(v.paths, 50), memberIds: strings(v.memberIds),
        itemMemberCount: typeof v.itemMemberCount === "number" && v.itemMemberCount >= 0 ? Math.floor(v.itemMemberCount) : 0,
        rowSecurity: v.rowSecurity === true, columnSecurity: v.columnSecurity === true,
        ...roleConstraints(v),
      };
    }),
  };
}

/**
 * Adds domain names observed in other synchronized workspaces when the active
 * snapshot could not name them (for example a snapshot taken before the admin
 * delegated token). The section status is kept, so completeness is not faked.
 */
export function withDomainDirectory(
  evidence: GovernanceEvidence | undefined,
  directory: readonly FabricDomainInfo[],
): GovernanceEvidence | undefined {
  if (!evidence || !directory.length) return evidence;
  const known = new Set(evidence.domains.entries.map((domain) => domain.id.toLowerCase()));
  const missing = directory.filter((domain) => {
    const id = domain.id.toLowerCase();
    if (known.has(id)) return false;
    known.add(id);
    return true;
  });
  if (!missing.length) return evidence;
  return { ...evidence, domains: { ...evidence.domains, entries: [...evidence.domains.entries, ...missing] } };
}

/** Domain lookup over every named domain of the evidence. */
export function domainIndex(evidence: GovernanceEvidence | undefined): Map<string, FabricDomainInfo> {
  const map = new Map<string, FabricDomainInfo>();
  if (!evidence) return map;
  for (const domain of evidence.domains.entries) map.set(domain.id.toLowerCase(), domain);
  return map;
}

/**
 * Human domain path (`Domain › Subdomain`). When the id is known but the name
 * was not collected, returns undefined so callers can show the GUID with
 * "Unknown name".
 */
export function domainPath(evidence: GovernanceEvidence | undefined, domainId: string | undefined): string | undefined {
  if (!domainId || domainId === "unassigned") return undefined;
  const index = domainIndex(evidence);
  const domain = index.get(domainId.toLowerCase());
  if (!domain) return undefined;
  const parent = domain.parentDomainId ? index.get(domain.parentDomainId.toLowerCase()) : undefined;
  return parent ? `${parent.displayName} › ${domain.displayName}` : domain.displayName;
}

export type DomainLabel =
  | { kind: "named"; id: string; label: string }
  | { kind: "unnamed"; id: string; label: string }
  | { kind: "unassigned"; label: string }
  | { kind: "unknown"; label: string };

/** Machine-readable domain reference for MCP outputs and exports. */
export interface DomainReference {
  status: "named" | "unknown-name" | "unassigned" | "not-collected";
  domainId: string | null;
  name: string | null;
  path: string | null;
  parentDomainId: string | null;
  parentName: string | null;
}

export function domainReference(evidence: GovernanceEvidence | undefined, domainId: string | undefined): DomainReference {
  const empty = { domainId: null, name: null, path: null, parentDomainId: null, parentName: null };
  if (domainId === "unassigned") return { status: "unassigned", ...empty };
  if (!domainId) return { status: "not-collected", ...empty };
  const index = domainIndex(evidence);
  const domain = index.get(domainId.toLowerCase());
  if (!domain) return { status: "unknown-name", ...empty, domainId };
  const parent = domain.parentDomainId ? index.get(domain.parentDomainId.toLowerCase()) : undefined;
  return {
    status: "named",
    domainId,
    name: domain.displayName,
    path: domainPath(evidence, domainId) ?? domain.displayName,
    parentDomainId: domain.parentDomainId ?? null,
    parentName: parent?.displayName ?? null,
  };
}

export function domainLabel(evidence: GovernanceEvidence | undefined, domainId: string | undefined): DomainLabel {
  if (domainId === "unassigned") return { kind: "unassigned", label: "No domain" };
  if (!domainId) return { kind: "unknown", label: "Unknown" };
  const path = domainPath(evidence, domainId);
  return path ? { kind: "named", id: domainId, label: path } : { kind: "unnamed", id: domainId, label: `Unknown name (${domainId.slice(0, 8)}…)` };
}

export interface ItemOneLakeRoles {
  known: boolean;
  roles: OneLakeRoleInfo[];
}

/** OneLake data access roles of one item; `known` is false when the section was not collected. */
export function itemOneLakeRoles(evidence: GovernanceEvidence | undefined, itemId: string): ItemOneLakeRoles {
  const section = evidence?.oneLakeRoles;
  if (section?.status.status !== "complete") return { known: false, roles: [] };
  return { known: true, roles: section.entries.filter((role) => role.itemId === itemId) };
}

function roleConstraints(v: Record<string, unknown>): Pick<OneLakeRoleInfo, "rowFilters" | "columnRules"> {
  const records = (value: unknown) =>
    (Array.isArray(value) ? value : []).filter((x): x is Record<string, unknown> => !!x && typeof x === "object").slice(0, 20);
  const rowFilters = records(v.rowFilters).flatMap((r) => {
    const tablePath = str(r.tablePath, 400);
    const predicate = str(r.predicate, 1000);
    return tablePath && predicate ? [{ tablePath, predicate }] : [];
  });
  const columnRules = records(v.columnRules).flatMap((r) => {
    const tablePath = str(r.tablePath, 400);
    return tablePath ? [{ tablePath, effect: str(r.effect, 32) ?? "Permit", columns: strings(r.columns, 50) }] : [];
  });
  return { ...(rowFilters.length ? { rowFilters } : {}), ...(columnRules.length ? { columnRules } : {}) };
}
