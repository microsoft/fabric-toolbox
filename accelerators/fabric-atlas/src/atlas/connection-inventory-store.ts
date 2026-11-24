import { ATLAS_CONFIG } from "./config";
import {
  CONNECTION_CONTRACT_VERSION,
  owners,
  parseConnectionRecord,
  parseConnectionRole,
  pendingOwners,
  type ConnectionInventoryStatus,
  type ConnectionInventoryView,
  type ConnectionRole,
  type FabricConnectionRecord,
} from "./connections";

/*
 * Rayfin persistence of tenant connection inventories. An inventory is
 * written once per synchronization batch: its connection and role rows first,
 * then the `ConnectionInventory` manifest, so a manifest always points to
 * complete rows. Readers trust only configured synchronizer writers.
 */

export const CONNECTION_INVENTORY_ENTITY = "ConnectionInventory";
export const CONNECTION_ENTRY_ENTITY = "ConnectionEntry";
export const CONNECTION_ROLE_ENTITY = "ConnectionRoleAssignment";

const WRITE_BATCH_SIZE = 16;
const PAGE_SIZE = 200;
const MAX_PAGES = 100;
const MAX_DELETES_PER_RUN = 3_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS = new Set<ConnectionInventoryStatus>(["complete", "unsupported", "failed"]);

const INVENTORY_FIELDS = [
  "id", "writerEmail", "collectedAt", "status", "code", "connectionCount", "roleLookupCount",
  "roleLookupSkippedCount", "roleLookupFailedCount", "truncated", "contractVersion",
] as const;
const CONNECTION_FIELDS = [
  "id", "inventoryId", "writerEmail", "connectionId", "displayName", "connectivityType", "connectorType",
  "path", "gatewayId", "privacyLevel", "credentialType", "singleSignOnType", "connectionEncryption",
  "skipTestConnection", "connectionCreatedAt", "lastBoundAt", "lastCredentialUsedAt", "rolesStatus",
  "ownerCount", "pendingOwnerCount",
] as const;
const ROLE_FIELDS = [
  "id", "inventoryId", "writerEmail", "connectionId", "principalId", "principalType", "principalName", "role",
] as const;

type Row = Record<string, unknown>;

interface EntityQuery {
  where(filter: Row): EntityQuery;
  first(count: number): EntityQuery;
  after(cursor: string): EntityQuery;
  executePaginated(): Promise<{ items: Row[]; endCursor?: string; hasNextPage: boolean }>;
}

export interface ConnectionEntityApi {
  select(fields: readonly string[]): EntityQuery;
  create(row: Row): Promise<unknown>;
  delete(filter: Row): Promise<unknown>;
}

export interface ConnectionStoreApi {
  inventory: ConnectionEntityApi;
  connections: ConnectionEntityApi;
  roles: ConnectionEntityApi;
}

export interface ConnectionInventorySummary {
  id: string;
  writerEmail: string;
  collectedAt: string;
  status: ConnectionInventoryStatus;
  code?: string;
  connectionCount: number;
  roleLookups: { done: number; skipped: number; failed: number };
  truncated: boolean;
}

export class ConnectionInventoryUnavailableError extends Error {
  constructor() {
    super("The connection inventory entities are not deployed.");
    this.name = "ConnectionInventoryUnavailableError";
  }
}

/** Resolves the three entities from a Rayfin data client, or undefined when one is missing. */
export function connectionStoreApi(data: unknown): ConnectionStoreApi | undefined {
  const source = (data ?? {}) as Record<string, ConnectionEntityApi | undefined>;
  const inventory = source[CONNECTION_INVENTORY_ENTITY];
  const connections = source[CONNECTION_ENTRY_ENTITY];
  const roles = source[CONNECTION_ROLE_ENTITY];
  const usable = (api: ConnectionEntityApi | undefined): api is ConnectionEntityApi =>
    typeof api?.select === "function" && typeof api.create === "function" && typeof api.delete === "function";
  return usable(inventory) && usable(connections) && usable(roles) ? { inventory, connections, roles } : undefined;
}

export async function defaultConnectionStoreApi(): Promise<ConnectionStoreApi> {
  const { getRayfinClient } = await import("@/lib/rayfin-client");
  const api = connectionStoreApi(getRayfinClient().data);
  if (!api) throw new ConnectionInventoryUnavailableError();
  return api;
}

function trustedWriterEmails(): string[] {
  return [
    ...new Set(
      [ATLAS_CONFIG.syncAdminEmail, ATLAS_CONFIG.breakGlassSyncAdminEmail, ...ATLAS_CONFIG.previousSyncWriters]
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

function isoTime(value: unknown): string | undefined {
  const parsed = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function count(value: unknown): number {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isInteger(number) && number >= 0 ? number : 0;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Deterministic RFC 9562 version 8 UUID, so a retried write targets the same row. */
async function stableUuid(value: string): Promise<string> {
  const hex = (await sha256(value)).slice(0, 32).split("");
  hex[12] = "8";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const text = hex.join("");
  return [text.slice(0, 8), text.slice(8, 12), text.slice(12, 16), text.slice(16, 20), text.slice(20, 32)].join("-");
}

async function readRows(
  api: ConnectionEntityApi,
  fields: readonly string[],
  filter: Row,
  signal?: AbortSignal,
): Promise<Row[]> {
  const rows: Row[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    let query = api.select(fields).where(filter).first(PAGE_SIZE);
    if (cursor) query = query.after(cursor);
    const result = await query.executePaginated();
    rows.push(...result.items);
    if (!result.hasNextPage) return rows;
    if (!result.endCursor || cursors.has(result.endCursor)) {
      throw new Error("Connection inventory pagination did not advance.");
    }
    cursors.add(result.endCursor);
    cursor = result.endCursor;
  }
  throw new Error("Connection inventory exceeded the page limit.");
}

async function readTrusted(
  api: ConnectionEntityApi,
  fields: readonly string[],
  filter: Row,
  signal?: AbortSignal,
): Promise<Row[]> {
  const groups = await Promise.all(
    trustedWriterEmails().map((writerEmail) =>
      readRows(api, fields, { ...filter, writerEmail: { eq: writerEmail } }, signal),
    ),
  );
  return groups.flat();
}

export function parseInventorySummary(row: Row): ConnectionInventorySummary | undefined {
  const id = typeof row.id === "string" && UUID.test(row.id) ? row.id.toLowerCase() : undefined;
  const collectedAt = isoTime(row.collectedAt);
  const status = row.status as ConnectionInventoryStatus;
  if (!id || !collectedAt || !STATUS.has(status) || count(row.contractVersion) !== CONNECTION_CONTRACT_VERSION) {
    return undefined;
  }
  const writerEmail = typeof row.writerEmail === "string" ? row.writerEmail.toLowerCase() : "";
  if (!trustedWriterEmails().includes(writerEmail)) return undefined;
  return {
    id,
    writerEmail,
    collectedAt,
    status,
    ...(typeof row.code === "string" && row.code ? { code: row.code } : {}),
    connectionCount: count(row.connectionCount),
    roleLookups: {
      done: count(row.roleLookupCount),
      skipped: count(row.roleLookupSkippedCount),
      failed: count(row.roleLookupFailedCount),
    },
    truncated: row.truncated === true || row.truncated === 1 || row.truncated === "true",
  };
}

/** Stored inventories of trusted writers, newest first. */
export async function listConnectionInventories(
  api: ConnectionStoreApi,
  signal?: AbortSignal,
): Promise<ConnectionInventorySummary[]> {
  const rows = await readTrusted(api.inventory, INVENTORY_FIELDS, {}, signal);
  const byId = new Map<string, ConnectionInventorySummary>();
  for (const row of rows) {
    const summary = parseInventorySummary(row);
    if (summary) byId.set(summary.id, summary);
  }
  return [...byId.values()].sort(
    (left, right) => Date.parse(right.collectedAt) - Date.parse(left.collectedAt) || right.id.localeCompare(left.id),
  );
}

function recordFromRow(row: Row, roles: ConnectionRole[]): FabricConnectionRecord | undefined {
  return parseConnectionRecord({
    id: row.connectionId,
    displayName: row.displayName,
    connectivityType: row.connectivityType,
    connectorType: row.connectorType ?? undefined,
    path: row.path ?? undefined,
    gatewayId: row.gatewayId ?? undefined,
    privacyLevel: row.privacyLevel ?? undefined,
    credentialType: row.credentialType ?? undefined,
    singleSignOnType: row.singleSignOnType ?? undefined,
    connectionEncryption: row.connectionEncryption ?? undefined,
    skipTestConnection: typeof row.skipTestConnection === "boolean" ? row.skipTestConnection : undefined,
    createdAt: row.connectionCreatedAt ?? undefined,
    lastBoundAt: row.lastBoundAt ?? undefined,
    lastCredentialUsedAt: row.lastCredentialUsedAt ?? undefined,
    rolesStatus: row.rolesStatus,
    roles,
  });
}

/**
 * Reads the rows of one inventory. A manifest whose row count does not match
 * is rejected, so a partially written inventory is never shown.
 */
export async function readConnectionInventory(
  api: ConnectionStoreApi,
  summary: ConnectionInventorySummary,
  signal?: AbortSignal,
): Promise<ConnectionInventoryView> {
  const filter = { inventoryId: { eq: summary.id } };
  const [connectionRows, roleRows] = await Promise.all([
    readRows(api.connections, CONNECTION_FIELDS, { ...filter, writerEmail: { eq: summary.writerEmail } }, signal),
    readRows(api.roles, ROLE_FIELDS, { ...filter, writerEmail: { eq: summary.writerEmail } }, signal),
  ]);
  const rolesByConnection = new Map<string, ConnectionRole[]>();
  for (const row of roleRows) {
    const connectionId = typeof row.connectionId === "string" ? row.connectionId.toLowerCase() : "";
    const role = parseConnectionRole({
      principalId: row.principalId,
      principalType: row.principalType,
      role: row.role,
      displayName: row.principalName ?? undefined,
    });
    if (!connectionId || !role) continue;
    rolesByConnection.set(connectionId, [...(rolesByConnection.get(connectionId) ?? []), role]);
  }
  const connections = new Map<string, FabricConnectionRecord>();
  for (const row of connectionRows) {
    const connectionId = typeof row.connectionId === "string" ? row.connectionId.toLowerCase() : "";
    const record = recordFromRow(row, rolesByConnection.get(connectionId) ?? []);
    if (record) connections.set(record.id, record);
  }
  if (connections.size !== summary.connectionCount) {
    throw new Error("The stored connection inventory is incomplete.");
  }
  return {
    id: summary.id,
    collectedAt: summary.collectedAt,
    status: summary.status,
    ...(summary.code ? { code: summary.code } : {}),
    truncated: summary.truncated,
    roleLookups: summary.roleLookups,
    connections: [...connections.values()].sort((left, right) => left.displayName.localeCompare(right.displayName)),
  };
}

export interface LatestConnectionInventory {
  latest?: ConnectionInventoryView;
  /** The complete inventory collected before `latest`, for the Changes tab. */
  previous?: ConnectionInventorySummary;
  /** Newest collection that stored no connection (refused or failed), when it is newer than `latest`. */
  lastAttempt?: ConnectionInventorySummary;
}

/**
 * Newest readable complete inventory; falls back to an older one when the
 * newest is incomplete. A refused or failed collection is a manifest without
 * rows: it never replaces an inventory, it only explains the latest attempt.
 */
export async function readLatestConnectionInventory(
  api: ConnectionStoreApi,
  signal?: AbortSignal,
): Promise<LatestConnectionInventory> {
  const summaries = await listConnectionInventories(api, signal);
  const complete = summaries.filter((summary) => summary.status === "complete");
  let latest: ConnectionInventoryView | undefined;
  let previous: ConnectionInventorySummary | undefined;
  for (let index = 0; index < complete.length; index += 1) {
    try {
      latest = await readConnectionInventory(api, complete[index], signal);
      previous = complete[index + 1];
      break;
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }
  const newest = summaries[0];
  const lastAttempt = newest && newest.status !== "complete" &&
    (!latest || Date.parse(newest.collectedAt) > Date.parse(latest.collectedAt))
    ? newest
    : undefined;
  return {
    ...(latest ? { latest } : {}),
    ...(previous ? { previous } : {}),
    ...(lastAttempt ? { lastAttempt } : {}),
  };
}

/**
 * Records a collection that produced no inventory (the admin API refused the
 * synchronizer, the Function failed or the rows could not be written), so the
 * page can explain why it is empty after a reload. Only the newest attempt is
 * kept. Best effort: the caller decides what to do when it fails.
 */
export async function recordConnectionAttempt(
  api: ConnectionStoreApi,
  attempt: { collectedAt: string; status: "unsupported" | "failed"; code?: string },
  writerEmail: string,
): Promise<void> {
  const writer = writerEmail.trim().toLowerCase();
  if (!writer) throw new Error("A synchronizer email is required to record a connection collection.");
  const id = crypto.randomUUID();
  const collectedAt = isoTime(attempt.collectedAt) ?? new Date().toISOString();
  const code = attempt.code?.replace(/[^a-z0-9-]/gi, "-").toLowerCase().slice(0, 80);
  await createRow(api.inventory, INVENTORY_FIELDS, {
    id,
    writerEmail: writer,
    collectedAt: new Date(collectedAt),
    status: attempt.status,
    ...optional("code", code || undefined),
    connectionCount: 0,
    roleLookupCount: 0,
    roleLookupSkippedCount: 0,
    roleLookupFailedCount: 0,
    truncated: false,
    contractVersion: CONNECTION_CONTRACT_VERSION,
  });
  try {
    for (const summary of await listConnectionInventories(api)) {
      if (summary.status !== "complete" && summary.id !== id) await api.inventory.delete({ id: summary.id });
    }
  } catch {
    // An older attempt left behind is harmless: readers only show the newest one.
  }
}

async function createRow(api: ConnectionEntityApi, fields: readonly string[], row: Row): Promise<void> {
  try {
    await api.create(row);
  } catch (error) {
    // A timed-out create may still have committed; retry only when absent.
    const existing = await readRows(api, fields, { id: { eq: row.id } }).catch(() => []);
    if (existing.some((candidate) => String(candidate.id).toLowerCase() === String(row.id).toLowerCase())) return;
    try {
      await api.create(row);
    } catch {
      throw error;
    }
  }
}

async function writeAll(
  api: ConnectionEntityApi,
  fields: readonly string[],
  rows: Row[],
  signal?: AbortSignal,
  progress?: (written: number) => void,
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += WRITE_BATCH_SIZE) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    await Promise.all(rows.slice(offset, offset + WRITE_BATCH_SIZE).map((row) => createRow(api, fields, row)));
    progress?.(Math.min(rows.length, offset + WRITE_BATCH_SIZE));
  }
}

function optional<T>(key: string, value: T | undefined): Row {
  return value === undefined ? {} : { [key]: value };
}

export async function connectionRows(
  inventoryId: string,
  writerEmail: string,
  connections: readonly FabricConnectionRecord[],
): Promise<{ connections: Row[]; roles: Row[] }> {
  const connectionRowsOut: Row[] = [];
  const roleRows: Row[] = [];
  for (const connection of connections) {
    connectionRowsOut.push({
      id: await stableUuid(["fabric-connection", "v1", inventoryId, connection.id].join("|")),
      inventoryId,
      writerEmail,
      connectionId: connection.id,
      displayName: connection.displayName,
      connectivityType: connection.connectivityType,
      ...optional("connectorType", connection.connectorType),
      ...optional("path", connection.path),
      ...optional("gatewayId", connection.gatewayId),
      ...optional("privacyLevel", connection.privacyLevel),
      ...optional("credentialType", connection.credentialType),
      ...optional("singleSignOnType", connection.singleSignOnType),
      ...optional("connectionEncryption", connection.connectionEncryption),
      ...optional("skipTestConnection", connection.skipTestConnection),
      ...optional("connectionCreatedAt", connection.createdAt ? new Date(connection.createdAt) : undefined),
      ...optional("lastBoundAt", connection.lastBoundAt ? new Date(connection.lastBoundAt) : undefined),
      ...optional("lastCredentialUsedAt", connection.lastCredentialUsedAt ? new Date(connection.lastCredentialUsedAt) : undefined),
      rolesStatus: connection.rolesStatus,
      ownerCount: owners(connection).length,
      pendingOwnerCount: pendingOwners(connection).length,
    });
    for (const role of connection.roles) {
      roleRows.push({
        id: await stableUuid(["connection-role", "v1", inventoryId, connection.id, role.principalId, role.role].join("|")),
        inventoryId,
        writerEmail,
        connectionId: connection.id,
        principalId: role.principalId,
        principalType: role.principalType,
        ...optional("principalName", role.displayName),
        role: role.role,
      });
    }
  }
  return { connections: connectionRowsOut, roles: roleRows };
}

export interface PersistConnectionInventoryResult {
  inventory: ConnectionInventoryView;
  written: number;
  pruned: number;
  retentionWarning?: boolean;
}

/**
 * Writes one inventory (rows first, manifest last) and prunes inventories
 * beyond the retention count, oldest first.
 */
export async function persistConnectionInventory(
  api: ConnectionStoreApi,
  inventory: ConnectionInventoryView,
  writerEmail: string,
  options: { retained?: number; signal?: AbortSignal; progress?: (written: number, total: number) => void } = {},
): Promise<PersistConnectionInventoryResult> {
  const writer = writerEmail.trim().toLowerCase();
  if (!writer) throw new Error("A synchronizer email is required to store the connection inventory.");
  const id = crypto.randomUUID();
  const rows = await connectionRows(id, writer, inventory.connections);
  const total = rows.connections.length + rows.roles.length + 1;
  await writeAll(api.connections, CONNECTION_FIELDS, rows.connections, options.signal, (written) =>
    options.progress?.(written, total));
  await writeAll(api.roles, ROLE_FIELDS, rows.roles, options.signal, (written) =>
    options.progress?.(rows.connections.length + written, total));
  await createRow(api.inventory, INVENTORY_FIELDS, {
    id,
    writerEmail: writer,
    collectedAt: new Date(inventory.collectedAt),
    status: inventory.status,
    ...optional("code", inventory.code),
    connectionCount: rows.connections.length,
    roleLookupCount: inventory.roleLookups.done,
    roleLookupSkippedCount: inventory.roleLookups.skipped,
    roleLookupFailedCount: inventory.roleLookups.failed,
    truncated: inventory.truncated,
    contractVersion: CONNECTION_CONTRACT_VERSION,
  });
  options.progress?.(total, total);

  let pruned = 0;
  let retentionWarning = false;
  try {
    const summaries = await listConnectionInventories(api, options.signal);
    const retained = Math.max(1, options.retained ?? ATLAS_CONFIG.snapshotRetentionCount);
    // Failed attempts are older than this inventory, so they no longer explain anything.
    const attempts = summaries.filter((summary) => summary.status !== "complete");
    const older = summaries.filter((summary) => summary.status === "complete" && summary.id !== id);
    const expired = [...older.slice(Math.max(0, retained - 1)), ...attempts];
    for (const summary of expired.reverse()) {
      const filter = { inventoryId: { eq: summary.id }, writerEmail: { eq: summary.writerEmail } };
      const [connectionRowsToDelete, roleRowsToDelete] = await Promise.all([
        readRows(api.connections, ["id"], filter, options.signal),
        readRows(api.roles, ["id"], filter, options.signal),
      ]);
      // An inventory is pruned whole or not at all in this run; the next sync continues.
      if (pruned + connectionRowsToDelete.length + roleRowsToDelete.length + 1 > MAX_DELETES_PER_RUN) break;
      for (const [entity, list] of [[api.roles, roleRowsToDelete], [api.connections, connectionRowsToDelete]] as const) {
        for (const row of list) {
          if (typeof row.id !== "string") continue;
          await entity.delete({ id: row.id });
          pruned += 1;
        }
      }
      await api.inventory.delete({ id: summary.id });
      pruned += 1;
    }
  } catch {
    retentionWarning = true;
  }
  return {
    inventory: { ...inventory, id, connections: inventory.connections },
    written: total,
    pruned,
    ...(retentionWarning ? { retentionWarning } : {}),
  };
}
