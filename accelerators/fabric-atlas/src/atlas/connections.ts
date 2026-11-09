import type { ConfigKV, Principal } from "./model";

/*
 * Tenant connection inventory (v2.8): parsing of the `tenantCollectConnections`
 * envelope, ownership and credential flags, the link from connections to the
 * synchronized items that use them (source provenance), the data connection
 * policy readiness simulation and the comparison of two inventories.
 */

export type ConnectionInventoryStatus = "complete" | "unsupported" | "failed";
export type ConnectionRolesStatus = "complete" | "skipped" | "failed" | "personal";

export interface ConnectionRole {
  principalId: string;
  principalType: string;
  role: string;
  displayName?: string;
}

export interface FabricConnectionRecord {
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
  rolesStatus: ConnectionRolesStatus;
  roles: ConnectionRole[];
}

export interface ConnectionInventoryView {
  /** Stored inventory ID; absent before persistence. */
  id?: string;
  collectedAt: string;
  status: ConnectionInventoryStatus;
  code?: string;
  truncated: boolean;
  roleLookups: { done: number; skipped: number; failed: number };
  connections: FabricConnectionRecord[];
}

export const CONNECTION_CONTRACT_VERSION = 1;
/** Credentials not used for this long are worth a review before deletion. */
export const STALE_CREDENTIAL_DAYS = 90;
const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENUM_TOKEN = /^[A-Za-z][A-Za-z0-9]{0,39}$/;
const STATUS_CODE = /^[a-z0-9-]{1,80}$/;
const MAX_CONNECTIONS = 5_000;
const MAX_ROLES = 100;

export const CLOUD_CONNECTIVITY = new Set(["ShareableCloud", "PersonalCloud", "Automatic"]);
export const GATEWAY_CONNECTIVITY = new Set([
  "OnPremisesGateway",
  "OnPremisesGatewayPersonal",
  "VirtualNetworkGateway",
  "StreamingVirtualNetworkGateway",
]);

const CONNECTIVITY_LABEL: Record<string, string> = {
  ShareableCloud: "Cloud",
  PersonalCloud: "Personal cloud",
  OnPremisesGateway: "On-premises gateway",
  OnPremisesGatewayPersonal: "Personal gateway",
  VirtualNetworkGateway: "VNet gateway",
  StreamingVirtualNetworkGateway: "Streaming VNet gateway",
  Automatic: "Automatic (SSO)",
  None: "Not bound",
};

const CREDENTIAL_LABEL: Record<string, string> = {
  Anonymous: "Anonymous",
  Basic: "Basic",
  Key: "Key",
  KeyPair: "Key pair",
  OAuth2: "OAuth 2.0",
  ServicePrincipal: "Service principal",
  SharedAccessSignature: "SAS",
  Windows: "Windows",
  WindowsWithoutImpersonation: "Windows without impersonation",
  WorkspaceIdentity: "Workspace identity",
};

const SSO_LABEL: Record<string, string> = {
  Kerberos: "Kerberos SSO",
  MicrosoftEntraID: "Entra ID SSO",
  SAML: "SAML SSO",
  KerberosDirectQueryAndRefresh: "Kerberos SSO (DirectQuery and refresh)",
};

export function connectivityLabel(value: string): string {
  return CONNECTIVITY_LABEL[value] ?? value;
}

export function authenticationLabel(connection: Pick<FabricConnectionRecord, "credentialType" | "singleSignOnType">): string {
  const credential = connection.credentialType
    ? (CREDENTIAL_LABEL[connection.credentialType] ?? connection.credentialType)
    : "Not reported";
  const sso = connection.singleSignOnType && connection.singleSignOnType !== "None"
    ? (SSO_LABEL[connection.singleSignOnType] ?? connection.singleSignOnType)
    : undefined;
  return sso ? `${credential} · ${sso}` : credential;
}

export function isGatewayConnection(connection: Pick<FabricConnectionRecord, "connectivityType">): boolean {
  return GATEWAY_CONNECTIVITY.has(connection.connectivityType);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

function token(value: unknown): string | undefined {
  return typeof value === "string" && ENUM_TOKEN.test(value) ? value : undefined;
}

function uuid(value: unknown): string | undefined {
  return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : undefined;
}

function iso(value: unknown): string | undefined {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : undefined;
  if (typeof value !== "string") return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

export function parseConnectionRole(value: unknown): ConnectionRole | undefined {
  if (!isRecord(value)) return undefined;
  const principalId = uuid(value.principalId);
  const principalType = token(value.principalType);
  const role = token(value.role);
  if (!principalId || !principalType || !role) return undefined;
  const displayName = text(value.displayName, 200);
  return { principalId, principalType, role, ...(displayName ? { displayName } : {}) };
}

const ROLES_STATUS = new Set<ConnectionRolesStatus>(["complete", "skipped", "failed", "personal"]);

export function parseConnectionRecord(value: unknown): FabricConnectionRecord | undefined {
  if (!isRecord(value)) return undefined;
  const id = uuid(value.id);
  const connectivityType = token(value.connectivityType);
  if (!id || !connectivityType) return undefined;
  const connector = text(value.connectorType, 120);
  const displayName = text(value.displayName, 200)
    ?? (connector ? `Unnamed connection (${connector})` : "Unnamed connection");
  const rolesStatus = ROLES_STATUS.has(value.rolesStatus as ConnectionRolesStatus)
    ? (value.rolesStatus as ConnectionRolesStatus)
    : "skipped";
  const roles = (Array.isArray(value.roles) ? value.roles : [])
    .slice(0, MAX_ROLES)
    .flatMap((role) => parseConnectionRole(role) ?? []);
  const record: FabricConnectionRecord = { id, displayName, connectivityType, rolesStatus, roles };
  const optionalText: Array<[keyof FabricConnectionRecord, number]> = [["connectorType", 120], ["path", 1_000]];
  for (const [key, max] of optionalText) {
    const parsed = text(value[key], max);
    if (parsed) (record as unknown as Record<string, unknown>)[key] = parsed;
  }
  for (const key of ["privacyLevel", "credentialType", "singleSignOnType", "connectionEncryption"] as const) {
    const parsed = token(value[key]);
    if (parsed) record[key] = parsed;
  }
  const gatewayId = uuid(value.gatewayId);
  if (gatewayId) record.gatewayId = gatewayId;
  if (typeof value.skipTestConnection === "boolean") record.skipTestConnection = value.skipTestConnection;
  for (const key of ["createdAt", "lastBoundAt", "lastCredentialUsedAt"] as const) {
    const parsed = iso(value[key]);
    if (parsed) record[key] = parsed;
  }
  return record;
}

/** Strictly parses the untrusted `tenantCollectConnections` output. */
export function parseConnectionEnvelope(value: unknown): ConnectionInventoryView | undefined {
  if (!isRecord(value) || value.protocolVersion !== 1 || value.authoritative !== false) return undefined;
  const collectedAt = iso(value.collectedAt);
  const status = isRecord(value.status) ? value.status : undefined;
  if (!collectedAt || !status) return undefined;
  if (status.status !== "complete" && status.status !== "unsupported" && status.status !== "failed") return undefined;
  if (status.code !== undefined && (typeof status.code !== "string" || !STATUS_CODE.test(status.code))) return undefined;
  if (!Array.isArray(value.connections) || value.connections.length > MAX_CONNECTIONS) return undefined;
  const lookups = isRecord(value.roleLookups) ? value.roleLookups : {};
  const seen = new Set<string>();
  const connections: FabricConnectionRecord[] = [];
  for (const entry of value.connections) {
    const record = parseConnectionRecord(entry);
    if (!record || seen.has(record.id)) continue;
    seen.add(record.id);
    connections.push(record);
  }
  return {
    collectedAt,
    status: status.status,
    ...(typeof status.code === "string" ? { code: status.code } : {}),
    truncated: value.truncated === true,
    roleLookups: { done: count(lookups.done), skipped: count(lookups.skipped), failed: count(lookups.failed) },
    connections,
  };
}

/* ----------------------------- ownership ----------------------------- */

/** Principals Atlas can name: workspace members, synchronizers and the signed-in user. */
export type PrincipalDirectory = ReadonlyArray<Pick<Principal, "principalId" | "displayName">>;

export type ConnectionFlag =
  | "single-owner"
  | "pending-owner"
  | "no-owner"
  | "user-owners-only"
  | "owners-unknown"
  | "credentials-unused"
  | "not-bound"
  | "not-encrypted";

export const CONNECTION_FLAG_LABEL: Record<ConnectionFlag, string> = {
  "single-owner": "Single owner",
  "pending-owner": "Pending owner only",
  "no-owner": "No owner",
  "user-owners-only": "Users only as owners",
  "owners-unknown": "Owners unknown",
  "credentials-unused": `Credentials unused ${STALE_CREDENTIAL_DAYS}+ days`,
  "not-bound": "Not bound",
  "not-encrypted": "Not encrypted",
};

export const OWNERSHIP_FLAGS: readonly ConnectionFlag[] = [
  "no-owner",
  "pending-owner",
  "single-owner",
  "user-owners-only",
  "owners-unknown",
];

export function owners(connection: FabricConnectionRecord): ConnectionRole[] {
  return connection.roles.filter((role) => role.role === "Owner");
}

export function pendingOwners(connection: FabricConnectionRecord): ConnectionRole[] {
  return connection.roles.filter((role) => role.role === "PendingOwner");
}

export function daysSince(value: string | undefined, now: number): number | undefined {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? Math.floor((now - time) / DAY_MS) : undefined;
}

/** Deterministic flags; absent evidence never raises a flag except "owners unknown". */
export function connectionFlags(connection: FabricConnectionRecord, now = Date.now()): ConnectionFlag[] {
  const flags: ConnectionFlag[] = [];
  if (connection.rolesStatus === "complete") {
    const owned = owners(connection);
    const pending = pendingOwners(connection);
    if (owned.length === 0 && pending.length > 0) flags.push("pending-owner");
    else if (owned.length === 0) flags.push("no-owner");
    // A group or a service principal as the only owner is the recommended setup, not a handover risk.
    else if (owned.length === 1 && owned[0].principalType === "User") flags.push("single-owner");
    else if (owned.length > 1 && owned.every((role) => role.principalType === "User")) flags.push("user-owners-only");
  } else if (connection.rolesStatus !== "personal") {
    flags.push("owners-unknown");
  }
  const unused = daysSince(connection.lastCredentialUsedAt, now);
  if (unused !== undefined && unused >= STALE_CREDENTIAL_DAYS) flags.push("credentials-unused");
  if (connection.connectivityType === "None") flags.push("not-bound");
  // The setting only governs gateway connections; Fabric reports NotEncrypted for most cloud connections.
  if (
    isGatewayConnection(connection) &&
    connection.connectionEncryption === "NotEncrypted" &&
    !/^https:\/\//i.test(connection.path ?? "")
  ) {
    flags.push("not-encrypted");
  }
  return flags;
}

/** Display name of a principal: Fabric name, a known Atlas principal, or type and short ID. */
export function principalLabel(role: ConnectionRole, principals: PrincipalDirectory = []): string {
  if (role.displayName) return role.displayName;
  const id = role.principalId.toLowerCase();
  const known = principals.find((principal) => principal.principalId.toLowerCase() === id);
  if (known) return known.displayName;
  return `${role.principalType} ${role.principalId.slice(0, 8)}`;
}

export function ownerSummary(connection: FabricConnectionRecord, principals: PrincipalDirectory = []): string {
  if (connection.rolesStatus === "personal") return "Creator only (personal)";
  if (connection.rolesStatus !== "complete") return "Unknown";
  const owned = owners(connection);
  const pending = pendingOwners(connection);
  if (!owned.length && !pending.length) return "None";
  const names = owned.map((role) => principalLabel(role, principals));
  const pendingNames = pending.map((role) => `${principalLabel(role, principals)} (pending)`);
  const all = [...names, ...pendingNames];
  return all.length > 2 ? `${all.slice(0, 2).join(", ")} +${all.length - 2}` : all.join(", ");
}

/* ----------------------------- usage ----------------------------- */

export interface ConnectionUsage {
  connectionId: string;
  itemId: string;
  relation: string;
  provider?: string;
  field?: string;
  location?: string;
  /** Workspace and item names, when the usage comes from a stored snapshot. */
  workspaceId?: string;
  workspaceName?: string;
  itemName?: string;
  itemType?: string;
}

const PROVENANCE_SECTION = "Source provenance";
const CONNECTION_REFERENCE = /(?:^|;\s*)connection=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

function provenancePart(value: string, key: string): string | undefined {
  const match = new RegExp(`(?:^|;\\s*)${key}=([^;]+)`).exec(value);
  return match?.[1]?.trim() || undefined;
}

/** Connections used by synchronized items, from the source provenance rows Atlas already writes. */
export function connectionUsages(config: readonly ConfigKV[]): ConnectionUsage[] {
  const usages = new Map<string, ConnectionUsage>();
  for (const entry of config) {
    if (entry.section !== PROVENANCE_SECTION) continue;
    const match = CONNECTION_REFERENCE.exec(entry.value);
    if (!match) continue;
    const connectionId = match[1].toLowerCase();
    const itemId = provenancePart(entry.value, "consumer") ?? entry.itemFabricId;
    const usage: ConnectionUsage = {
      connectionId,
      itemId,
      relation: entry.label,
      ...(provenancePart(entry.value, "provider") ? { provider: provenancePart(entry.value, "provider") } : {}),
      ...(provenancePart(entry.value, "field") ? { field: provenancePart(entry.value, "field") } : {}),
      ...(provenancePart(entry.value, "location") ? { location: provenancePart(entry.value, "location") } : {}),
    };
    usages.set([connectionId, itemId, usage.relation, usage.location ?? ""].join("|"), usage);
  }
  return [...usages.values()];
}

export function usagesByConnection(usages: readonly ConnectionUsage[]): Map<string, ConnectionUsage[]> {
  const grouped = new Map<string, ConnectionUsage[]>();
  for (const usage of usages) grouped.set(usage.connectionId, [...(grouped.get(usage.connectionId) ?? []), usage]);
  return grouped;
}

export interface WorkspaceProvenanceEvidence {
  workspaceId: string;
  workspaceName: string;
  config: readonly ConfigKV[];
  items: ReadonlyArray<{ fabricId: string; displayName: string; itemType: string }>;
  /** Workspace principals, used to name connection owners the admin API returns as bare IDs. */
  principals?: PrincipalDirectory;
}

/** One directory entry per principal ID; the first name found wins. */
export function mergePrincipalDirectories(...directories: PrincipalDirectory[]): PrincipalDirectory {
  const merged = new Map<string, Pick<Principal, "principalId" | "displayName">>();
  for (const directory of directories) {
    for (const principal of directory) {
      const key = principal.principalId.toLowerCase();
      if (!merged.has(key) && principal.displayName.trim()) merged.set(key, principal);
    }
  }
  return [...merged.values()];
}

/** Usages of every synchronized workspace, named with their workspace and consuming item. */
export function workspaceConnectionUsages(evidence: readonly WorkspaceProvenanceEvidence[]): ConnectionUsage[] {
  return evidence.flatMap((workspace) => {
    const items = new Map(workspace.items.map((item) => [item.fabricId.toLowerCase(), item]));
    return connectionUsages(workspace.config).map((usage) => {
      const item = items.get(usage.itemId.toLowerCase());
      return {
        ...usage,
        workspaceId: workspace.workspaceId,
        workspaceName: workspace.workspaceName,
        ...(item ? { itemName: item.displayName, itemType: item.itemType } : {}),
      };
    });
  });
}

export function usedByLabel(count: number): string {
  return count ? `${count} item${count === 1 ? "" : "s"}` : "None";
}

/** Evidence source of a set of usages, as shown next to the list. */
export function usageSourceLabel(usages: readonly ConnectionUsage[]): string {
  const shortcuts = usages.some((usage) => usage.relation.endsWith("shortcut"));
  const mirroring = usages.some((usage) => usage.relation.startsWith("mirroring"));
  if (shortcuts && mirroring) return "Shortcuts and mirroring APIs";
  if (mirroring) return "Mirroring API";
  return "OneLake shortcuts API";
}

/** Item configuration value with the connection name in front of the raw GUID. */
export function describeProvenanceValue(
  value: string,
  connections: ReadonlyMap<string, FabricConnectionRecord> | undefined,
  principals: PrincipalDirectory = [],
): string {
  const match = CONNECTION_REFERENCE.exec(value);
  const connection = match && connections?.get(match[1].toLowerCase());
  if (!connection) return value;
  const parts = [connection.displayName, connection.connectorType, `owners: ${ownerSummary(connection, principals)}`]
    .filter(Boolean)
    .join(" · ");
  return `${parts} | ${value}`;
}

/* ----------------------------- policy readiness ----------------------------- */

export interface AuthenticationMethod {
  id: string;
  label: string;
}

/** Methods offered by the authentication allowlist of the Fabric admin portal. */
export const AUTHENTICATION_METHODS: readonly AuthenticationMethod[] = [
  { id: "WorkspaceIdentity", label: "Workspace identity" },
  { id: "ServicePrincipal", label: "Service principal" },
  { id: "OAuth2Entra", label: "OAuth 2.0 Entra ID" },
  { id: "OAuth2NonEntra", label: "OAuth 2.0 non-Entra ID" },
  { id: "EntraSSO", label: "Entra ID single sign-on" },
  { id: "KerberosSSO", label: "Kerberos single sign-on" },
  { id: "KerberosDirectQueryAndRefreshSSO", label: "Kerberos SSO (DirectQuery and refresh)" },
  { id: "SamlSSO", label: "SAML single sign-on" },
  { id: "KeyPair", label: "Key pair" },
  { id: "Key", label: "Key" },
  { id: "SharedAccessSignature", label: "Shared access signature (SAS)" },
  { id: "Basic", label: "Basic" },
  { id: "Anonymous", label: "Anonymous" },
  { id: "Windows", label: "Windows" },
  { id: "WindowsWithoutImpersonation", label: "Windows without impersonation" },
];

const METHOD_IDS = new Set(AUTHENTICATION_METHODS.map((method) => method.id));
const METHOD_LABEL = new Map(AUTHENTICATION_METHODS.map((method) => [method.id, method.label]));

const SSO_METHOD: Record<string, string> = {
  Kerberos: "KerberosSSO",
  MicrosoftEntraID: "EntraSSO",
  SAML: "SamlSSO",
  KerberosDirectQueryAndRefresh: "KerberosDirectQueryAndRefreshSSO",
};

export interface BlockedConnectionKind {
  kind: string;
  allowedEndpoints: string[];
}

export interface PolicyDraft {
  /** Allowed authentication methods; an empty list leaves the allowlist unevaluated. */
  methods: string[];
  blockedKinds: BlockedConnectionKind[];
}

export const DEFAULT_POLICY_DRAFT: PolicyDraft = {
  methods: ["WorkspaceIdentity", "ServicePrincipal", "OAuth2Entra", "EntraSSO"],
  blockedKinds: [],
};

export type ReadinessStatus = "pass" | "fail" | "check" | "not-applicable";

export interface ReadinessResult {
  status: ReadinessStatus;
  reasons: string[];
}

export function normalizePolicyDraft(value: unknown): PolicyDraft {
  if (!isRecord(value)) return DEFAULT_POLICY_DRAFT;
  const methods = Array.isArray(value.methods)
    ? [...new Set(value.methods.filter((method): method is string => typeof method === "string" && METHOD_IDS.has(method)))]
    : DEFAULT_POLICY_DRAFT.methods;
  const blockedKinds = (Array.isArray(value.blockedKinds) ? value.blockedKinds : [])
    .flatMap((entry): BlockedConnectionKind[] => {
      if (!isRecord(entry)) return [];
      const kind = text(entry.kind, 120);
      if (!kind) return [];
      const allowedEndpoints = (Array.isArray(entry.allowedEndpoints) ? entry.allowedEndpoints : [])
        .flatMap((endpoint) => text(endpoint, 400) ?? [])
        .slice(0, 20);
      return [{ kind, allowedEndpoints }];
    })
    .slice(0, 20);
  return { methods, blockedKinds };
}

function endpointAllowed(path: string | undefined, endpoints: readonly string[]): boolean {
  if (!path) return false;
  const normalized = path.toLowerCase();
  return endpoints.some((endpoint) => endpoint.trim() && normalized.startsWith(endpoint.trim().toLowerCase()));
}

/**
 * Simulates the data connection policies for one connection. Policies apply to
 * cloud connections only; OAuth 2.0 cannot be resolved because the API does
 * not say whether the issuer is Entra ID.
 */
export function evaluateReadiness(connection: FabricConnectionRecord, draft: PolicyDraft): ReadinessResult {
  if (!CLOUD_CONNECTIVITY.has(connection.connectivityType)) {
    return { status: "not-applicable", reasons: ["Gateway connections are outside data connection policies."] };
  }
  const failures: string[] = [];
  const checks: string[] = [];
  const blocked = draft.blockedKinds.find(
    (entry) => connection.connectorType && entry.kind.toLowerCase() === connection.connectorType.toLowerCase(),
  );
  if (blocked && !endpointAllowed(connection.path, blocked.allowedEndpoints)) {
    failures.push(`Connection kind ${blocked.kind} is blocked.`);
  }
  if (draft.methods.length) {
    const allowed = new Set(draft.methods);
    const credential = connection.credentialType;
    if (!credential) {
      checks.push("Authentication method not reported: check it in the Fabric portal.");
    } else if (credential === "OAuth2") {
      const entra = allowed.has("OAuth2Entra");
      const other = allowed.has("OAuth2NonEntra");
      if (!entra && !other) failures.push("OAuth 2.0 is not in the draft allowlist.");
      else if (entra !== other) {
        checks.push("The API does not say whether this OAuth 2.0 issuer is Entra ID: check the connection.");
      }
    } else if (!allowed.has(credential)) {
      failures.push(`${METHOD_LABEL.get(credential) ?? credential} is not in the draft allowlist.`);
    }
    const sso = connection.singleSignOnType ? SSO_METHOD[connection.singleSignOnType] : undefined;
    if (sso && !allowed.has(sso)) failures.push(`${METHOD_LABEL.get(sso) ?? sso} is not in the draft allowlist.`);
  }
  if (failures.length) return { status: "fail", reasons: [...failures, ...checks] };
  if (checks.length) return { status: "check", reasons: checks };
  return { status: "pass", reasons: [] };
}

/* ----------------------------- changes ----------------------------- */

export type ConnectionChangeKind = "added" | "removed" | "owners" | "authentication" | "endpoint" | "renamed";

export interface ConnectionChange {
  kind: ConnectionChangeKind;
  connectionId: string;
  displayName: string;
  detail: string;
}

function ownerKeys(connection: FabricConnectionRecord): string {
  return connection.roles
    .filter((role) => role.role === "Owner" || role.role === "PendingOwner")
    .map((role) => `${role.role}:${role.principalId}`)
    .sort()
    .join(",");
}

/** Differences between two inventories, newest last. Owners compare only when both lookups completed. */
export function diffConnectionInventories(
  previous: ConnectionInventoryView,
  current: ConnectionInventoryView,
): ConnectionChange[] {
  const before = new Map(previous.connections.map((connection) => [connection.id, connection]));
  const after = new Map(current.connections.map((connection) => [connection.id, connection]));
  const changes: ConnectionChange[] = [];
  for (const connection of current.connections) {
    const old = before.get(connection.id);
    if (!old) {
      changes.push({ kind: "added", connectionId: connection.id, displayName: connection.displayName, detail: `${connection.connectorType ?? "Connection"} · ${connectivityLabel(connection.connectivityType)}` });
      continue;
    }
    if (old.displayName !== connection.displayName) {
      changes.push({ kind: "renamed", connectionId: connection.id, displayName: connection.displayName, detail: `Was ${old.displayName}` });
    }
    if (old.rolesStatus === "complete" && connection.rolesStatus === "complete" && ownerKeys(old) !== ownerKeys(connection)) {
      changes.push({ kind: "owners", connectionId: connection.id, displayName: connection.displayName, detail: `${owners(old).length} → ${owners(connection).length} owners, ${pendingOwners(old).length} → ${pendingOwners(connection).length} pending` });
    }
    if (old.credentialType !== connection.credentialType || old.singleSignOnType !== connection.singleSignOnType) {
      changes.push({ kind: "authentication", connectionId: connection.id, displayName: connection.displayName, detail: `${authenticationLabel(old)} → ${authenticationLabel(connection)}` });
    }
    if ((old.path ?? "") !== (connection.path ?? "")) {
      changes.push({ kind: "endpoint", connectionId: connection.id, displayName: connection.displayName, detail: `${old.path ?? "none"} → ${connection.path ?? "none"}` });
    }
  }
  for (const connection of previous.connections) {
    if (!after.has(connection.id)) {
      changes.push({ kind: "removed", connectionId: connection.id, displayName: connection.displayName, detail: `${connection.connectorType ?? "Connection"} · ${connectivityLabel(connection.connectivityType)}` });
    }
  }
  return changes;
}

/* ----------------------------- exports ----------------------------- */

function csvCell(value: string | number | undefined): string {
  const textValue = value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(textValue) ? `'${textValue}` : textValue;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function connectionsCsv(
  connections: readonly FabricConnectionRecord[],
  options: { usages?: ReadonlyMap<string, ConnectionUsage[]>; draft?: PolicyDraft; principals?: PrincipalDirectory; now?: number } = {},
): string {
  const header = [
    "Name", "Connection ID", "Connector", "Connectivity", "Endpoint", "Authentication", "Privacy level",
    "Encryption", "Owners", "Created", "Last bound", "Credentials last used", "Used by synchronized items",
    "Flags", "Draft policy",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const connection of connections) {
    const readiness = options.draft ? evaluateReadiness(connection, options.draft).status : "";
    lines.push([
      connection.displayName,
      connection.id,
      connection.connectorType,
      connectivityLabel(connection.connectivityType),
      connection.path,
      authenticationLabel(connection),
      connection.privacyLevel,
      connection.connectionEncryption,
      ownerSummary(connection, options.principals),
      connection.createdAt,
      connection.lastBoundAt,
      connection.lastCredentialUsedAt,
      options.usages?.get(connection.id)?.length ?? 0,
      connectionFlags(connection, options.now).map((flag) => CONNECTION_FLAG_LABEL[flag]).join("; "),
      readiness,
    ].map(csvCell).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

/** Admin API request an administrator can run to add an owner. Atlas never sends it. */
export function ownerAssignmentRequest(connectionId: string): string {
  return [
    `POST https://api.fabric.microsoft.com/v1/admin/connections/${connectionId}/roleAssignments`,
    "Content-Type: application/json",
    "",
    "{",
    '  "principal": { "id": "<new owner object ID>", "type": "Group" },',
    '  "role": "Owner"',
    "}",
  ].join("\n");
}

/* ----------------------------- summary ----------------------------- */

export interface ConnectionKpis {
  total: number;
  cloud: number;
  gateway: number;
  singleOwner: number;
  /** Single-owner connections used by at least one synchronized item. */
  singleOwnerUsed: number;
  pendingOwner: number;
  credentialsUnused: number;
  failDraft: number;
  checkDraft: number;
  usedHere: number;
}

export function connectionKpis(
  connections: readonly FabricConnectionRecord[],
  draft: PolicyDraft,
  usages: ReadonlyMap<string, ConnectionUsage[]>,
  now = Date.now(),
): ConnectionKpis {
  const kpis: ConnectionKpis = {
    total: connections.length, cloud: 0, gateway: 0, singleOwner: 0, singleOwnerUsed: 0, pendingOwner: 0,
    credentialsUnused: 0, failDraft: 0, checkDraft: 0, usedHere: 0,
  };
  for (const connection of connections) {
    if (CLOUD_CONNECTIVITY.has(connection.connectivityType)) kpis.cloud += 1;
    if (isGatewayConnection(connection)) kpis.gateway += 1;
    const flags = connectionFlags(connection, now);
    if (flags.includes("single-owner")) {
      kpis.singleOwner += 1;
      if (usages.has(connection.id)) kpis.singleOwnerUsed += 1;
    }
    if (flags.includes("pending-owner")) kpis.pendingOwner += 1;
    if (flags.includes("credentials-unused")) kpis.credentialsUnused += 1;
    const readiness = evaluateReadiness(connection, draft).status;
    if (readiness === "fail") kpis.failDraft += 1;
    if (readiness === "check") kpis.checkDraft += 1;
    if (usages.has(connection.id)) kpis.usedHere += 1;
  }
  return kpis;
}

/* ----------------------------- presentation ----------------------------- */

const CONNECTOR_GLYPH: Record<string, string> = {
  azuredatalakestorage: "ADLS",
  adlsgen2: "ADLS",
  azureblobs: "BLOB",
  azureblobstorage: "BLOB",
  azuretables: "TBL",
  amazons3: "S3",
  amazons3compatible: "S3",
  googlecloudstorage: "GCS",
  googlebigquery: "BQ",
  oracle: "ORA",
  web: "WEB",
  webforpipeline: "WEB",
  restservice: "REST",
  odata: "ODATA",
  odbc: "ODBC",
  saphana: "HANA",
  sapbw: "BW",
  salesforce: "SF",
  sharepoint: "SPO",
  sharepointonline: "SPO",
  sharepointlist: "SPO",
  sql: "SQL",
  sqlserver: "SQL",
  fabricsql: "FSQL",
  azuresqldatabase: "SQL",
  azuresqlmanagedinstance: "SQLMI",
  snowflake: "SNOW",
  postgresql: "PG",
  azurepostgresql: "PG",
  mysql: "MY",
  azuremysql: "MY",
  databricks: "DBX",
  azuredatabricks: "DBX",
  azuredataexplorer: "ADX",
  kusto: "ADX",
  cosmosdb: "COS",
  azurecosmosdb: "COS",
  dataverse: "DV",
  commondataservice: "DV",
  analysisservices: "AS",
  powerbi: "PBI",
  powerbidatasets: "PBI",
  eventhub: "EH",
  file: "FILE",
  folder: "FILE",
  teradata: "TD",
  db2: "DB2",
  azuresynapseanalytics: "SYN",
  azureeventhubs: "EH",
  azureservicebus: "SB",
  azurekeyvault: "KV",
  dynamics365: "D365",
  exchange: "EXO",
};

/** Short connector abbreviation drawn in the connection glyph. */
export function connectorGlyph(connectorType: string | undefined): string {
  if (!connectorType) return "?";
  const known = CONNECTOR_GLYPH[connectorType.replace(/[^a-z0-9]/gi, "").toLowerCase()];
  if (known) return known;
  const capitals = connectorType.replace(/^Azure(?=[A-Z])/, "").match(/[A-Z0-9]/g)?.join("") ?? "";
  if (capitals.length >= 2) return capitals.slice(0, 4);
  return connectorType.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase() || "?";
}

/**
 * Endpoint as shown in the table: no URL scheme, and the values of a JSON path
 * (Event Hubs, for example) instead of its braces. The detail panel keeps the raw value.
 */
export function endpointLabel(path: string | undefined): string | undefined {
  const value = path?.trim();
  if (!value) return undefined;
  if (value.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (isRecord(parsed)) {
        const parts = Object.values(parsed).filter((part): part is string => typeof part === "string" && !!part.trim());
        if (parts.length) return parts.join(" · ");
      }
    } catch {
      // Not JSON after all: show it as written.
    }
  }
  return value.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/\/$/, "") || undefined;
}

export interface OwnerCell {
  text: string;
  /** Short qualifier: pending, group, app, personal. */
  suffix?: string;
  tone?: "muted" | "danger";
}

const PRINCIPAL_SUFFIX: Record<string, string> = {
  Group: "group",
  ServicePrincipal: "app",
  ServicePrincipalProfile: "app",
};

/** Compact owner cell: one name with a qualifier, or a count when several principals own it. */
export function ownerCell(connection: FabricConnectionRecord, principals: PrincipalDirectory = []): OwnerCell {
  if (connection.rolesStatus === "personal") return { text: "Creator only", suffix: "personal", tone: "muted" };
  if (connection.rolesStatus !== "complete") return { text: "Unknown", tone: "muted" };
  const owned = owners(connection);
  const pending = pendingOwners(connection);
  if (owned.length === 1) {
    const [owner] = owned;
    const suffix = PRINCIPAL_SUFFIX[owner.principalType];
    return { text: principalLabel(owner, principals), ...(suffix ? { suffix } : {}) };
  }
  if (owned.length > 1) {
    const users = owned.every((role) => role.principalType === "User");
    return { text: `${owned.length} ${users ? "users" : "owners"}` };
  }
  if (pending.length === 1) return { text: principalLabel(pending[0], principals), suffix: "pending" };
  if (pending.length > 1) return { text: `${pending.length} owners`, suffix: "pending" };
  return { text: "None", tone: "danger" };
}

export type BadgeTone = "warning" | "danger" | "info" | "muted" | "success";

export interface ConnectionBadge {
  id: string;
  label: string;
  tone: BadgeTone;
}

const FLAG_BADGE: Record<ConnectionFlag, { label: string; tone: BadgeTone }> = {
  "no-owner": { label: "No owner", tone: "danger" },
  "pending-owner": { label: "Pending owner", tone: "warning" },
  "single-owner": { label: "Single owner", tone: "warning" },
  "user-owners-only": { label: "Users only", tone: "info" },
  "owners-unknown": { label: "Owners unknown", tone: "muted" },
  "credentials-unused": { label: "Credentials unused", tone: "muted" },
  "not-bound": { label: "Not bound", tone: "muted" },
  "not-encrypted": { label: "Not encrypted", tone: "danger" },
};

const BADGE_WEIGHT: Record<string, number> = {
  "no-owner": 60,
  "pending-owner": 50,
  "not-encrypted": 40,
  "single-owner": 30,
  "readiness-fail": 20,
  "credentials-unused": 12,
  "user-owners-only": 8,
  "owners-unknown": 6,
  "readiness-check": 4,
  "not-bound": 2,
};

/** Table badges: ownership and credential flags, then the draft policy result. */
export function connectionBadges(
  connection: FabricConnectionRecord,
  flags: readonly ConnectionFlag[],
  readiness: ReadinessResult,
  now = Date.now(),
): ConnectionBadge[] {
  const badges: ConnectionBadge[] = flags.map((flag) => {
    if (flag === "credentials-unused") {
      const days = daysSince(connection.lastCredentialUsedAt, now);
      return { id: flag, label: days === undefined ? FLAG_BADGE[flag].label : `Unused ${days} d`, tone: "muted" };
    }
    return { id: flag, ...FLAG_BADGE[flag] };
  });
  if (readiness.status === "fail") {
    const blocked = readiness.reasons.some((reason) => reason.startsWith("Connection kind"));
    badges.push({ id: "readiness-fail", label: blocked ? "Blocked kind" : "Fails allowlist", tone: "danger" });
  } else if (readiness.status === "check") {
    const oauth = readiness.reasons.some((reason) => reason.includes("OAuth"));
    badges.push({ id: "readiness-check", label: oauth ? "Check OAuth issuer" : "Check authentication", tone: "info" });
  }
  return badges.sort((left, right) => (BADGE_WEIGHT[right.id] ?? 0) - (BADGE_WEIGHT[left.id] ?? 0));
}

/** Detail panel badges: one per draft policy reason, so the admin sees why it fails. */
export function readinessBadges(readiness: ReadinessResult): ConnectionBadge[] {
  if (readiness.status === "not-applicable") {
    return [{ id: "readiness-na", label: "Gateway: outside connection policies", tone: "muted" }];
  }
  if (readiness.status === "pass") return [{ id: "readiness-pass", label: "Passes the draft allowlist", tone: "success" }];
  return readiness.reasons.map((reason, index) => {
    if (reason.startsWith("The API does not say")) {
      return { id: `readiness-${index}`, label: "Check the OAuth 2.0 issuer", tone: "info" as const };
    }
    if (reason.startsWith("Authentication method not reported")) {
      return { id: `readiness-${index}`, label: "Authentication not reported", tone: "info" as const };
    }
    return { id: `readiness-${index}`, label: reason.replace(/\.$/, ""), tone: "danger" as const };
  });
}

/** Sort key for "sorted by flags": the most urgent connections first. */
export function connectionRiskScore(badges: readonly ConnectionBadge[]): number {
  return badges.reduce((total, badge) => total + (BADGE_WEIGHT[badge.id] ?? 0), 0);
}

/** Authentication with its single sign-on mode, as written in the detail panel. */
export function authenticationDetail(connection: Pick<FabricConnectionRecord, "credentialType" | "singleSignOnType">): string {
  const credential = authenticationLabel({ credentialType: connection.credentialType });
  const sso = connection.singleSignOnType && connection.singleSignOnType !== "None"
    ? (SSO_LABEL[connection.singleSignOnType] ?? connection.singleSignOnType)
    : undefined;
  return sso ? `${credential}, ${sso}` : `${credential}, no single sign-on`;
}

const ROLE_LABEL: Record<string, string> = {
  Owner: "Owner",
  PendingOwner: "Pending owner",
  User: "User",
  UserWithReshare: "User with reshare",
};

export function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role;
}

const PRINCIPAL_TYPE_LABEL: Record<string, string> = {
  User: "User",
  Group: "Group",
  ServicePrincipal: "Service principal",
  ServicePrincipalProfile: "Service principal profile",
};

export function principalTypeLabel(type: string): string {
  return PRINCIPAL_TYPE_LABEL[type] ?? type;
}

const CONNECTIVITY_DETAIL: Record<string, string> = {
  ShareableCloud: "Shareable cloud connection",
  PersonalCloud: "Personal cloud connection",
  OnPremisesGateway: "Connection through an on-premises gateway",
  OnPremisesGatewayPersonal: "Connection through a personal gateway",
  VirtualNetworkGateway: "Connection through a virtual network gateway",
  StreamingVirtualNetworkGateway: "Connection through a streaming virtual network gateway",
  Automatic: "Automatic connection (single sign-on)",
  None: "Connection not bound",
};

export function connectivityDetail(value: string): string {
  return CONNECTIVITY_DETAIL[value] ?? connectivityLabel(value);
}
