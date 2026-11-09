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
import { validateDelegatedFabricToken } from "./workspace-governance.js";

/*
 * Read-only tenant connection inventory (v2.8) from the Fabric admin
 * connections API (Preview). The API never returns secrets; only documented,
 * credential-free fields are kept and anything else is dropped. Nothing is
 * written to Fabric: ownership changes stay in the Fabric portal.
 */

export const COLLECT_CONNECTIONS_LIMITS = {
  ...FABRIC_REST_DEFAULTS,
  executionBudgetMs: 150_000,
  maxConnectionPages: 200,
  maxConnections: 5_000,
  maxRoleLookups: 2_000,
  maxRolePages: 5,
  maxRolesPerConnection: 100,
  roleLookupConcurrency: 4,
  /** Role lookups stop when less than this remains, so the envelope still returns in time. */
  roleLookupReserveMs: 15_000,
  maxEnvelopeBytes: 4 * 1024 * 1024,
} as const;

export type CollectConnectionsLimits = {
  [Name in keyof typeof COLLECT_CONNECTIONS_LIMITS]: number;
};

export interface CollectConnectionsDependencies {
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  limits?: Partial<CollectConnectionsLimits>;
}

export type TenantConnectionRolesStatus = "complete" | "skipped" | "failed" | "personal";

export interface TenantConnectionRole {
  principalId: string;
  principalType: string;
  role: string;
  /** Only when Fabric returns one (user principal name or tenant name). */
  displayName?: string;
}

export interface TenantConnection {
  id: string;
  displayName: string;
  connectivityType: string;
  connectorType?: string;
  path?: string;
  gatewayId?: string;
  privacyLevel?: string;
  credentialType?: string;
  singleSignOnType?: string;
  connectionEncryption?: string;
  skipTestConnection?: boolean;
  createdAt?: string;
  lastBoundAt?: string;
  lastCredentialUsedAt?: string;
  rolesStatus: TenantConnectionRolesStatus;
  roles: TenantConnectionRole[];
}

export interface TenantConnectionsEnvelope {
  protocolVersion: 1;
  authoritative: false;
  correlationId?: string;
  collectedAt: string;
  status: { status: "complete" | "unsupported" | "failed"; code?: string };
  truncated: boolean;
  roleLookups: { done: number; skipped: number; failed: number };
  connections: TenantConnection[];
}

const AUTHORIZATION_MESSAGE = "Connection inventory requires the configured Atlas administrator.";
const TOKEN_UNAVAILABLE_MESSAGE = "The Fabric application token was unavailable.";
const INVALID_INPUT_MESSAGE = "Use protocolVersion 1 and a strict correlation UUID or null.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENUM_TOKEN = /^[A-Za-z][A-Za-z0-9]{0,39}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]+/g;
/** Personal connections cannot be shared: their creator is the only owner. */
const PERSONAL = new Set(["PersonalCloud", "OnPremisesGatewayPersonal"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(CONTROL_CHARACTERS, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, max) : undefined;
}

function uuid(value: unknown): string | undefined {
  return typeof value === "string" && UUID.test(value.trim()) ? value.trim().toLowerCase() : undefined;
}

function enumToken(value: unknown): string | undefined {
  return typeof value === "string" && ENUM_TOKEN.test(value.trim()) ? value.trim() : undefined;
}

function isoTime(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

/**
 * Keeps an endpoint path without credentials: URL user info, query strings and
 * fragments are removed because a Web connection URL can carry an API key.
 */
export function safeConnectionPath(value: unknown): string | undefined {
  const path = text(value, 1_000);
  if (!path) return undefined;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      const pathname = url.pathname === "/" ? "" : url.pathname;
      return `${url.protocol}//${url.host}${pathname}`.slice(0, 1_000);
    } catch {
      return undefined;
    }
  }
  return path.split("?")[0].split("#")[0].trim() || undefined;
}

/** Parses one admin API connection; returns undefined outside the documented contract. */
export function sanitizeConnection(value: unknown): TenantConnection | undefined {
  if (!isRecord(value)) return undefined;
  const id = uuid(value.id);
  const connectivityType = enumToken(value.connectivityType);
  if (!id || !connectivityType) return undefined;
  const details = isRecord(value.connectionDetails) ? value.connectionDetails : {};
  const credential = isRecord(value.credentialDetails) ? value.credentialDetails : {};
  const recency = isRecord(value.connectionRecency) ? value.connectionRecency : {};
  const connectorType = text(details.type, 120);
  // Fabric returns personal connections without a name; they still belong in the inventory.
  const displayName = text(value.displayName, 200)
    ?? (connectorType ? `Unnamed connection (${connectorType})` : "Unnamed connection");
  const connection: TenantConnection = {
    id,
    displayName,
    connectivityType,
    rolesStatus: PERSONAL.has(connectivityType) ? "personal" : "skipped",
    roles: [],
  };
  if (connectorType) connection.connectorType = connectorType;
  const path = safeConnectionPath(details.path);
  if (path) connection.path = path;
  const gatewayId = uuid(value.gatewayId);
  if (gatewayId) connection.gatewayId = gatewayId;
  const privacyLevel = enumToken(value.privacyLevel);
  if (privacyLevel) connection.privacyLevel = privacyLevel;
  const credentialType = enumToken(credential.credentialType);
  if (credentialType) connection.credentialType = credentialType;
  const singleSignOnType = enumToken(credential.singleSignOnType);
  if (singleSignOnType) connection.singleSignOnType = singleSignOnType;
  const connectionEncryption = enumToken(credential.connectionEncryption);
  if (connectionEncryption) connection.connectionEncryption = connectionEncryption;
  if (typeof credential.skipTestConnection === "boolean") {
    connection.skipTestConnection = credential.skipTestConnection;
  }
  const createdAt = isoTime(recency.createdDateTime);
  if (createdAt) connection.createdAt = createdAt;
  const lastBoundAt = isoTime(recency.lastBoundDateTime);
  if (lastBoundAt) connection.lastBoundAt = lastBoundAt;
  const lastCredentialUsedAt = isoTime(recency.lastCredentialUsedDateTime);
  if (lastCredentialUsedAt) connection.lastCredentialUsedAt = lastCredentialUsedAt;
  return connection;
}

/** Parses one role assignment; principal names are kept only when Fabric returns them. */
export function sanitizeRoleAssignment(value: unknown): TenantConnectionRole | undefined {
  if (!isRecord(value) || !isRecord(value.principal)) return undefined;
  const principal = value.principal;
  const principalId = uuid(principal.id);
  const principalType = enumToken(principal.type);
  const role = enumToken(value.role);
  if (!principalId || !principalType || !role) return undefined;
  const userDetails = isRecord(principal.userDetails) ? principal.userDetails : {};
  const displayName =
    text(principal.displayName, 200) ?? text(userDetails.userPrincipalName, 200);
  return { principalId, principalType, role, ...(displayName ? { displayName } : {}) };
}

function sectionStatus(error: unknown): TenantConnectionsEnvelope["status"] {
  const code = fabricSafeErrorCode(error, true);
  return code === "authorization-failed" || code === "endpoint-unsupported"
    ? { status: "unsupported", code }
    : { status: "failed", code };
}

function envelopeBytes(envelope: TenantConnectionsEnvelope): number {
  return new TextEncoder().encode(JSON.stringify(envelope)).byteLength;
}

/**
 * Lists tenant connections and their role assignments. The delegated
 * administrator token is tried first; the application token is a fallback for
 * tenants that allow service principals on admin APIs.
 */
export async function collectTenantConnections(
  token: string,
  request: { correlationId: string | null; delegatedToken?: string },
  dependencies: CollectConnectionsDependencies = {},
): Promise<TenantConnectionsEnvelope> {
  if (typeof token !== "string" || !token || /\s/.test(token)) throw new Error(TOKEN_UNAVAILABLE_MESSAGE);
  const limits: CollectConnectionsLimits = { ...COLLECT_CONNECTIONS_LIMITS, ...dependencies.limits };
  const now = dependencies.now;
  const deadline = new ExecutionDeadline(limits.executionBudgetMs, now);
  const clientFor = (value: string) => new FabricRestClient(value, {
    deadline,
    fetch: dependencies.fetch,
    sleep: dependencies.sleep,
    requestTimeoutMs: limits.requestTimeoutMs,
    maxAttempts: limits.maxAttempts,
    maxRetryAfterMs: limits.maxRetryAfterMs,
    maxResponseBytes: limits.maxResponseBytes,
  });
  const clients = request.delegatedToken
    ? [clientFor(request.delegatedToken), clientFor(token)]
    : [clientFor(token)];
  const envelope: TenantConnectionsEnvelope = {
    protocolVersion: 1,
    authoritative: false,
    ...(request.correlationId ? { correlationId: request.correlationId } : {}),
    collectedAt: new Date().toISOString(),
    status: { status: "complete" },
    truncated: false,
    roleLookups: { done: 0, skipped: 0, failed: 0 },
    connections: [],
  };

  let client: FabricRestClient | undefined;
  let records: unknown[] = [];
  let lastError: unknown;
  for (const candidate of clients) {
    try {
      records = await candidate.list("/v1/admin/connections", {
        maxPages: limits.maxConnectionPages,
        maxRecords: limits.maxConnections,
        stopAfter: limits.maxConnections,
        tokenContinuation: true,
      });
      client = candidate;
      break;
    } catch (error) {
      lastError = error;
      if (fabricSafeErrorCode(error, true) !== "authorization-failed") break;
    }
  }
  if (!client) {
    envelope.status = sectionStatus(lastError);
    return envelope;
  }

  const seen = new Set<string>();
  for (const record of records) {
    const connection = sanitizeConnection(record);
    if (!connection || seen.has(connection.id)) continue;
    seen.add(connection.id);
    envelope.connections.push(connection);
  }
  if (records.length >= limits.maxConnections) {
    envelope.truncated = true;
    envelope.status = { status: "complete", code: "record-limit-exceeded" };
  }

  const shared = envelope.connections.filter((connection) => connection.rolesStatus !== "personal");
  const queue = shared.slice(0, limits.maxRoleLookups);
  let next = 0;
  const reader = client;
  const worker = async () => {
    while (next < queue.length) {
      if (deadline.remaining() < limits.roleLookupReserveMs) return;
      const connection = queue[next];
      next += 1;
      try {
        const values = await reader.list(`/v1/admin/connections/${connection.id}/roleAssignments`, {
          maxPages: limits.maxRolePages,
          maxRecords: limits.maxRolesPerConnection,
          stopAfter: limits.maxRolesPerConnection,
          tokenContinuation: true,
        });
        const roles = new Map<string, TenantConnectionRole>();
        for (const value of values) {
          const role = sanitizeRoleAssignment(value);
          if (!role) continue;
          const key = `${role.principalId}|${role.role}`;
          // A duplicate assignment must not drop a name Fabric returned on the first one.
          if (!roles.get(key)?.displayName) roles.set(key, { ...roles.get(key), ...role });
        }
        connection.roles = [...roles.values()];
        connection.rolesStatus = "complete";
        envelope.roleLookups.done += 1;
      } catch {
        connection.rolesStatus = "failed";
        envelope.roleLookups.failed += 1;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limits.roleLookupConcurrency, 8)) }, () => worker()),
  );
  envelope.roleLookups.skipped = shared.filter((connection) => connection.rolesStatus === "skipped").length;

  while (envelope.connections.length > 0 && envelopeBytes(envelope) > limits.maxEnvelopeBytes) {
    envelope.connections = envelope.connections.slice(0, Math.floor(envelope.connections.length * 0.9));
    envelope.truncated = true;
    envelope.status = { status: "complete", code: "response-size-exceeded" };
  }
  return envelope;
}

export async function tenantCollectConnections(
  ctx: RayfinContext<AtlasSchema, AudienceType.Fabric>,
  protocolVersion: unknown,
  correlationId: unknown,
  delegatedToken?: unknown,
  dependencies?: CollectConnectionsDependencies,
): Promise<TenantConnectionsEnvelope> {
  if (protocolVersion !== 1) throw new Error(INVALID_INPUT_MESSAGE);
  let correlation: string | null = null;
  if (correlationId != null) {
    correlation = uuid(correlationId) ?? null;
    if (!correlation) throw new Error(INVALID_INPUT_MESSAGE);
  }
  const delegated = validateDelegatedFabricToken(delegatedToken);
  await requireAtlasSynchronizer(ctx.getDataClient(), "connection inventory", AUTHORIZATION_MESSAGE);
  let token: string;
  try {
    token = ctx.Tokens.Fabric;
  } catch {
    throw new Error(TOKEN_UNAVAILABLE_MESSAGE);
  }
  return collectTenantConnections(
    token,
    { correlationId: correlation, ...(delegated ? { delegatedToken: delegated } : {}) },
    dependencies,
  );
}
