import {
  AudienceType,
  type RayfinContext,
} from "@microsoft/fabric-user-data-functions";
import type { AtlasSchema } from "../../data/schema.js";
import {
  ExecutionDeadline,
  FABRIC_REST_DEFAULTS,
  FabricRestClient,
  fabricSafeErrorCode,
} from "./fabric-rest.js";
import { requireAtlasSynchronizer } from "./synchronizer-gate.js";
import { validateCollectCoreInput } from "./workspace-collector.js";

/*
 * Read-only governance evidence stage (v2.6). Every section is optional: a
 * missing permission (non-admin caller, 403/404) yields `unsupported`, never a
 * failed sync and never an implied healthy state. Nothing is written to Fabric.
 */

export const COLLECT_GOVERNANCE_LIMITS = {
  ...FABRIC_REST_DEFAULTS,
  executionBudgetMs: 120_000,
  maxItemPages: 100,
  maxItems: 5_000,
  maxDomains: 1_000,
  maxDomainWorkspaceLookups: 50,
  maxTags: 2_000,
  maxTagPages: 20,
  maxTenantSettings: 1_000,
  maxShareItems: 40,
  maxSharesPerItem: 200,
  maxRoleItems: 40,
  maxRolesPerItem: 200,
  maxEnvelopeBytes: 4 * 1024 * 1024,
} as const;

export type CollectGovernanceLimits = {
  [Name in keyof typeof COLLECT_GOVERNANCE_LIMITS]: number;
};

export interface CollectGovernanceDependencies {
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  limits?: Partial<CollectGovernanceLimits>;
}

export interface GovernanceSectionStatus {
  status: "complete" | "unsupported" | "failed";
  code?: string;
}

export interface GovernanceDomain {
  id: string;
  displayName: string;
  parentDomainId?: string;
  description?: string;
  defaultSensitivityLabelId?: string;
  /** Workspaces assigned in Fabric (admin API); absent when not looked up. */
  workspaceCount?: number;
}

export interface GovernanceTag {
  id: string;
  displayName: string;
  scope: "tenant" | "domain";
  domainId?: string;
}

export interface GovernanceTenantSetting {
  settingName: string;
  title: string;
  enabled: boolean;
  group?: string;
}

export interface GovernanceNetworkPolicy {
  inboundPublicAccess?: "Allow" | "Deny";
  outboundPublicAccess?: "Allow" | "Deny";
}

export interface GovernanceExternalShare {
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

export interface GovernanceOneLakeRole {
  itemId: string;
  roleName: string;
  permissions: string[];
  paths: string[];
  memberIds: string[];
  itemMemberCount: number;
  rowSecurity: boolean;
  columnSecurity: boolean;
  rowFilters?: { tablePath: string; predicate: string }[];
  columnRules?: { tablePath: string; effect: string; columns: string[] }[];
}

export interface WorkspaceGovernanceEnvelope {
  protocolVersion: 1;
  authoritative: false;
  correlationId?: string;
  workspaceId: string;
  collectedAt: string;
  domains: { status: GovernanceSectionStatus; entries: GovernanceDomain[] };
  tags: { status: GovernanceSectionStatus; entries: GovernanceTag[] };
  tenantSettings: { status: GovernanceSectionStatus; entries: GovernanceTenantSetting[] };
  network: { status: GovernanceSectionStatus; policy?: GovernanceNetworkPolicy };
  externalShares: { status: GovernanceSectionStatus; entries: GovernanceExternalShare[] };
  oneLakeRoles: { status: GovernanceSectionStatus; entries: GovernanceOneLakeRole[] };
}

const SHARE_ITEM_TYPES = new Set(["Lakehouse", "Warehouse", "KQLDatabase", "SQLDatabase", "MirroredDatabase"]);
const ROLE_ITEM_TYPES = new Set(["Lakehouse"]);
const AUTHORIZATION_MESSAGE = "Governance collection requires the configured Atlas administrator.";
const TOKEN_UNAVAILABLE_MESSAGE = "The Fabric application token was unavailable.";
const DELEGATED_TOKEN_MESSAGE = "The delegated Fabric token is invalid.";
const JWT = /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;

/**
 * Optional delegated Fabric token from the signed-in Fabric administrator
 * (Tenant.Read.All). Admin APIs reject the app identity token, so this is the
 * only way to read domains, tags and tenant settings. Never logged or stored.
 */
export function validateDelegatedFabricToken(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > 16_384 || !JWT.test(value)) throw new Error(DELEGATED_TOKEN_MESSAGE);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, max = 512): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function id(value: unknown): string | undefined {
  const value_ = text(value, 128);
  return value_ && /^[0-9a-f-]{36}$/i.test(value_) ? value_.toLowerCase() : value_;
}

function access(value: unknown): "Allow" | "Deny" | undefined {
  return value === "Allow" || value === "Deny" ? value : undefined;
}

function failure(error: unknown): GovernanceSectionStatus {
  const code = fabricSafeErrorCode(error, true);
  return code === "endpoint-unsupported" || code === "authorization-failed"
    ? { status: "unsupported", code }
    : { status: "failed", code };
}

export function sanitizeDomains(payload: Record<string, unknown>, max: number): GovernanceDomain[] {
  const values = Array.isArray(payload.domains) ? payload.domains : Array.isArray(payload.value) ? payload.value : [];
  return values.slice(0, max).flatMap((value): GovernanceDomain[] => {
    if (!isRecord(value)) return [];
    const domainId = id(value.id);
    const displayName = text(value.displayName, 256);
    if (!domainId || !displayName) return [];
    const parentDomainId = id(value.parentDomainId);
    const description = text(value.description, 512);
    const label = id(value.defaultLabelId ?? value.defaultSensitivityLabelId);
    return [{
      id: domainId, displayName,
      ...(parentDomainId ? { parentDomainId } : {}),
      ...(description ? { description } : {}),
      ...(label ? { defaultSensitivityLabelId: label } : {}),
    }];
  });
}

export function sanitizeTags(values: unknown[], max: number): GovernanceTag[] {
  return values.slice(0, max).flatMap((value): GovernanceTag[] => {
    if (!isRecord(value)) return [];
    const tagId = id(value.id);
    const displayName = text(value.displayName, 256);
    if (!tagId || !displayName) return [];
    const scope = isRecord(value.scope) ? value.scope : {};
    const domainId = id(scope.domainId);
    return [{ id: tagId, displayName, scope: scope.type === "Domain" ? "domain" : "tenant", ...(domainId ? { domainId } : {}) }];
  });
}

export function sanitizeTenantSettings(payload: Record<string, unknown>, max: number): GovernanceTenantSetting[] {
  const values = Array.isArray(payload.tenantSettings) ? payload.tenantSettings : Array.isArray(payload.value) ? payload.value : [];
  return values.slice(0, max).flatMap((value): GovernanceTenantSetting[] => {
    if (!isRecord(value) || typeof value.enabled !== "boolean") return [];
    const settingName = text(value.settingName, 200);
    if (!settingName) return [];
    const group = text(value.tenantSettingGroup, 200);
    return [{ settingName, title: text(value.title, 300) ?? settingName, enabled: value.enabled, ...(group ? { group } : {}) }];
  });
}

export function sanitizeNetworkPolicy(payload: Record<string, unknown>): GovernanceNetworkPolicy {
  const rule = (direction: unknown) => isRecord(direction) && isRecord(direction.publicAccessRules)
    ? access(direction.publicAccessRules.defaultAction) : undefined;
  const inbound = rule(payload.inbound);
  const outbound = rule(payload.outbound);
  return { ...(inbound ? { inboundPublicAccess: inbound } : {}), ...(outbound ? { outboundPublicAccess: outbound } : {}) };
}

export function sanitizeExternalShare(value: unknown, itemId: string): GovernanceExternalShare | undefined {
  if (!isRecord(value)) return undefined;
  const shareId = id(value.id);
  if (!shareId) return undefined;
  const recipient = isRecord(value.recipient) ? value.recipient : {};
  const creator = isRecord(value.creatorPrincipal) ? value.creatorPrincipal : {};
  const upn = text(recipient.userPrincipalName, 320);
  const tenant = id(recipient.tenantId);
  const createdBy = text(creator.displayName, 256) ?? text(isRecord(creator.userDetails) ? creator.userDetails.userPrincipalName : undefined, 320);
  const expiresAt = text(value.expirationTimeUtc, 64);
  const createdAt = text(value.createdDateTimeUtc ?? value.creationTimeUtc ?? value.createdAt, 64);
  return {
    itemId, shareId, status: text(value.status, 64) ?? "Unknown",
    ...(upn ? { recipient: upn } : {}),
    ...(tenant ? { recipientTenantId: tenant } : {}),
    ...(createdBy ? { createdBy } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    ...(createdAt ? { createdAt } : {}),
    paths: (Array.isArray(value.paths) ? value.paths : []).flatMap((path) => text(path, 400) ?? []).slice(0, 20),
  };
}

export function sanitizeOneLakeRole(value: unknown, itemId: string): GovernanceOneLakeRole | undefined {
  if (!isRecord(value)) return undefined;
  const roleName = text(value.name, 256);
  if (!roleName) return undefined;
  const permissions = new Set<string>();
  const paths = new Set<string>();
  let rowSecurity = false;
  let columnSecurity = false;
  const rowFilters: { tablePath: string; predicate: string }[] = [];
  const columnRules: { tablePath: string; effect: string; columns: string[] }[] = [];
  for (const rule of Array.isArray(value.decisionRules) ? value.decisionRules : []) {
    if (!isRecord(rule)) continue;
    for (const permission of Array.isArray(rule.permission) ? rule.permission : []) {
      if (!isRecord(permission) || !Array.isArray(permission.attributeValueIncludedIn)) continue;
      for (const entry of permission.attributeValueIncludedIn) {
        const valueText = text(entry, 400);
        if (!valueText) continue;
        if (permission.attributeName === "Action") permissions.add(valueText);
        else if (permission.attributeName === "Path") paths.add(valueText);
      }
    }
    const constraints = isRecord(rule.constraints) ? rule.constraints : {};
    if (Array.isArray(constraints.rows) && constraints.rows.length) rowSecurity = true;
    if (Array.isArray(constraints.columns) && constraints.columns.length) columnSecurity = true;
    for (const row of Array.isArray(constraints.rows) ? constraints.rows : []) {
      if (!isRecord(row)) continue;
      const tablePath = text(row.tablePath, 400);
      const predicate = text(row.value, 1000);
      if (tablePath && predicate) rowFilters.push({ tablePath, predicate });
    }
    for (const column of Array.isArray(constraints.columns) ? constraints.columns : []) {
      if (!isRecord(column)) continue;
      const tablePath = text(column.tablePath, 400);
      const columns = (Array.isArray(column.columnNames) ? column.columnNames : []).flatMap((name) => text(name, 256) ?? []).slice(0, 50);
      if (tablePath) columnRules.push({ tablePath, effect: text(column.columnEffect, 32) ?? "Permit", columns });
    }
  }
  const members = isRecord(value.members) ? value.members : {};
  const memberIds = (Array.isArray(members.microsoftEntraMembers) ? members.microsoftEntraMembers : [])
    .flatMap((member) => (isRecord(member) ? id(member.objectId) : undefined) ?? []).slice(0, 500);
  const itemMemberCount = Array.isArray(members.fabricItemMembers) ? members.fabricItemMembers.length : 0;
  return {
    itemId, roleName, permissions: [...permissions].slice(0, 20), paths: [...paths].slice(0, 50),
    memberIds, itemMemberCount, rowSecurity, columnSecurity,
    ...(rowFilters.length ? { rowFilters: rowFilters.slice(0, 20) } : {}),
    ...(columnRules.length ? { columnRules: columnRules.slice(0, 20) } : {}),
  };
}

/**
 * Collects optional governance evidence. Admin sections prefer the delegated
 * administrator token; workspace sections prefer the application token. Each
 * side falls back to the other token when the first one is not authorized.
 */
export async function collectWorkspaceGovernance(
  token: string,
  request: { workspaceId: string; correlationId: string | null; delegatedToken?: string },
  dependencies: CollectGovernanceDependencies = {},
): Promise<WorkspaceGovernanceEnvelope> {
  if (typeof token !== "string" || !token || /\s/.test(token)) throw new Error(TOKEN_UNAVAILABLE_MESSAGE);
  const limits: CollectGovernanceLimits = { ...COLLECT_GOVERNANCE_LIMITS, ...dependencies.limits };
  const deadline = new ExecutionDeadline(limits.executionBudgetMs, dependencies.now);
  const clientFor = (value: string) => new FabricRestClient(value, {
    deadline,
    fetch: dependencies.fetch,
    sleep: dependencies.sleep,
    requestTimeoutMs: limits.requestTimeoutMs,
    maxAttempts: limits.maxAttempts,
    maxRetryAfterMs: limits.maxRetryAfterMs,
    maxResponseBytes: limits.maxResponseBytes,
  });
  const appClient = clientFor(token);
  const delegatedClient = request.delegatedToken ? clientFor(request.delegatedToken) : undefined;
  const adminClients = delegatedClient ? [delegatedClient, appClient] : [appClient];
  const workspaceClients = delegatedClient ? [appClient, delegatedClient] : [appClient];
  const withFallback = async <T>(clients: FabricRestClient[], read: (client: FabricRestClient) => Promise<T>): Promise<T> => {
    let lastError: unknown;
    for (const candidate of clients) {
      try {
        return await read(candidate);
      } catch (error) {
        lastError = error;
        if (failure(error).code !== "authorization-failed") throw error;
      }
    }
    throw lastError;
  };
  let adminClient = adminClients[0];
  let client = workspaceClients[0];
  const workspacePath = `/v1/workspaces/${request.workspaceId}`;
  const complete: GovernanceSectionStatus = { status: "complete" };

  const envelope: WorkspaceGovernanceEnvelope = {
    protocolVersion: 1,
    authoritative: false,
    ...(request.correlationId ? { correlationId: request.correlationId } : {}),
    workspaceId: request.workspaceId,
    collectedAt: new Date().toISOString(),
    domains: { status: complete, entries: [] },
    tags: { status: complete, entries: [] },
    tenantSettings: { status: complete, entries: [] },
    network: { status: complete },
    externalShares: { status: complete, entries: [] },
    oneLakeRoles: { status: complete, entries: [] },
  };

  try {
    envelope.domains.entries = sanitizeDomains(await withFallback(adminClients, async (candidate) => {
      const payload = await candidate.getObject("/v1/admin/domains");
      adminClient = candidate;
      return payload;
    }), limits.maxDomains);
  } catch (error) {
    envelope.domains.status = failure(error);
  }
  if (envelope.domains.status.status === "complete") {
    // Tenant-wide assignment counts let the UI tell "empty in Fabric" from
    // "not synchronized by Atlas". Lookups are bounded; skipped ones stay unknown.
    for (const domain of envelope.domains.entries.slice(0, limits.maxDomainWorkspaceLookups)) {
      try {
        const values = await adminClient.list(`/v1/admin/domains/${domain.id}/workspaces`, { maxPages: 5, maxRecords: 5_000 });
        domain.workspaceCount = values.length;
      } catch {
        break;
      }
    }
  }
  try {
    envelope.tags.entries = sanitizeTags(
      await withFallback(adminClients, (candidate) =>
        candidate.list("/v1/admin/tags", { maxPages: limits.maxTagPages, maxRecords: limits.maxTags })),
      limits.maxTags,
    );
  } catch (error) {
    envelope.tags.status = failure(error);
  }
  try {
    envelope.tenantSettings.entries = sanitizeTenantSettings(
      await withFallback(adminClients, (candidate) => candidate.getObject("/v1/admin/tenantsettings")),
      limits.maxTenantSettings,
    );
  } catch (error) {
    envelope.tenantSettings.status = failure(error);
  }
  try {
    envelope.network.policy = sanitizeNetworkPolicy(await withFallback(workspaceClients, (candidate) =>
      candidate.getObject(`${workspacePath}/networking/communicationPolicy`)));
  } catch (error) {
    envelope.network.status = failure(error);
  }

  let items: { id: string; type: string }[] = [];
  try {
    items = (await withFallback(workspaceClients, async (candidate) => {
      const values = await candidate.list(`${workspacePath}/items`, { maxPages: limits.maxItemPages, maxRecords: limits.maxItems });
      client = candidate;
      return values;
    }))
      .flatMap((value) => {
        if (!isRecord(value)) return [];
        const itemId = id(value.id);
        const type = text(value.type, 128);
        return itemId && type ? [{ id: itemId, type }] : [];
      });
  } catch (error) {
    envelope.externalShares.status = failure(error);
    envelope.oneLakeRoles.status = failure(error);
  }

  const shareItems = items.filter((item) => SHARE_ITEM_TYPES.has(item.type));
  if (envelope.externalShares.status.status === "complete") {
    if (shareItems.length > limits.maxShareItems) envelope.externalShares.status = { status: "complete", code: "partial-unsupported" };
    for (const item of shareItems.slice(0, limits.maxShareItems)) {
      try {
        const values = await client.list(`${workspacePath}/items/${item.id}/externalDataShares`,
          { maxPages: 5, maxRecords: limits.maxSharesPerItem });
        envelope.externalShares.entries.push(...values.flatMap((value) => sanitizeExternalShare(value, item.id) ?? []));
      } catch (error) {
        const status = failure(error);
        if (status.code === "endpoint-unsupported") continue;
        envelope.externalShares.status = status;
        break;
      }
    }
  }

  const roleItems = items.filter((item) => ROLE_ITEM_TYPES.has(item.type));
  if (envelope.oneLakeRoles.status.status === "complete") {
    if (roleItems.length > limits.maxRoleItems) envelope.oneLakeRoles.status = { status: "complete", code: "partial-unsupported" };
    for (const item of roleItems.slice(0, limits.maxRoleItems)) {
      try {
        const values = await client.list(`${workspacePath}/items/${item.id}/dataAccessRoles`,
          { maxPages: 5, maxRecords: limits.maxRolesPerItem });
        envelope.oneLakeRoles.entries.push(...values.flatMap((value) => sanitizeOneLakeRole(value, item.id) ?? []));
      } catch (error) {
        const status = failure(error);
        // A lakehouse without OneLake security enabled answers 404; that is not a section failure.
        if (status.code === "endpoint-unsupported") continue;
        envelope.oneLakeRoles.status = status;
        break;
      }
    }
  }

  if (new TextEncoder().encode(JSON.stringify(envelope)).byteLength > limits.maxEnvelopeBytes) {
    throw new Error("Governance collection exceeded the safe response size.");
  }
  return envelope;
}

export async function workspaceCollectGovernance(
  ctx: RayfinContext<AtlasSchema, AudienceType.Fabric>,
  protocolVersion: unknown,
  workspaceId: unknown,
  correlationId: unknown,
  delegatedToken?: unknown,
  dependencies?: CollectGovernanceDependencies,
): Promise<WorkspaceGovernanceEnvelope> {
  const request = validateCollectCoreInput(protocolVersion, workspaceId, correlationId);
  const delegated = validateDelegatedFabricToken(delegatedToken);
  await requireAtlasSynchronizer(ctx.getDataClient(), "governance collection", AUTHORIZATION_MESSAGE);
  let token: string;
  try {
    token = ctx.Tokens.Fabric;
  } catch {
    throw new Error(TOKEN_UNAVAILABLE_MESSAGE);
  }
  return collectWorkspaceGovernance(token, { ...request, ...(delegated ? { delegatedToken: delegated } : {}) }, dependencies);
}
