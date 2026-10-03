import { ATLAS_CONFIG } from "./config";
import type { AtlasData } from "./model";
import {
  incidentKey,
  observedIncidents,
  type IncidentRecordFields,
} from "./observability";

export const OPERATIONAL_INCIDENT_ENTITY = "OperationalIncident";
export const OPERATIONAL_INCIDENT_CONTRACT_VERSION = 1;
/** Upper bound of incident rows written for one snapshot. */
export const MAX_INCIDENTS_PER_SNAPSHOT = 500;

const MAX_DELETES_PER_SYNC = 200;
const WRITE_BATCH_SIZE = 8;
const PAGE_SIZE = 200;
const MAX_PAGES = 50;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ITEM_ID = /^[A-Za-z0-9-]{1,100}$/;
// Job types are Fabric identifiers such as RunNotebook or Pipeline; anything
// outside this character set is skipped rather than stored.
const JOB_TYPE = /^[A-Za-z0-9][A-Za-z0-9 ._:/-]{0,59}$/;
const ITEM_TYPE = /^[A-Za-z][A-Za-z0-9]{0,59}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]+/g;

const FIELDS = [
  "id",
  "workspace_id",
  "snapshotId",
  "writerEmail",
  "incidentKey",
  "itemFabricId",
  "itemName",
  "itemType",
  "jobType",
  "runId",
  "occurredAt",
  "durationSec",
  "observedAt",
  "firstObservedAt",
  "firstObservedSnapshotId",
  "source",
  "contractVersion",
] as const;

type Row = Record<string, unknown>;

interface IncidentQuery {
  where(filter: Row): IncidentQuery;
  first(count: number): IncidentQuery;
  after(cursor: string): IncidentQuery;
  executePaginated(): Promise<{
    items: Row[];
    endCursor?: string;
    hasNextPage: boolean;
  }>;
}

export interface OperationalIncidentApi {
  select(fields: readonly string[]): IncidentQuery;
  create(row: Row): Promise<unknown>;
  delete(filter: Row): Promise<unknown>;
}

export interface OperationalIncidentRecord extends IncidentRecordFields {
  id: string;
  workspaceId: string;
  snapshotId: string;
  writerEmail: string;
  itemId: string;
  itemName: string;
  itemType?: string;
  jobType: string;
  runId?: string;
  durationSec?: number;
  firstObservedSnapshotId?: string;
  source: "fabric-job-history";
  contractVersion: number;
}

function sameText(left: unknown, right: unknown): boolean {
  return (
    typeof left === "string" &&
    typeof right === "string" &&
    left.toLowerCase() === right.toLowerCase()
  );
}

function trustedWriterEmails(): string[] {
  return [
    ...new Set(
      [ATLAS_CONFIG.syncAdminEmail, ...ATLAS_CONFIG.previousSyncWriters]
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

function isoTime(value: unknown): string | undefined {
  const parsed =
    value instanceof Date
      ? value.getTime()
      : typeof value === "string"
        ? Date.parse(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function boundedName(value: string): string {
  return value.replace(CONTROL_CHARACTERS, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Deterministic RFC 9562 version 8 UUID, so a retried write targets the same row. */
async function stableUuid(value: string): Promise<string> {
  const hex = (await sha256(value)).slice(0, 32).split("");
  hex[12] = "8";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const text = hex.join("");
  return [
    text.slice(0, 8),
    text.slice(8, 12),
    text.slice(12, 16),
    text.slice(16, 20),
    text.slice(20, 32),
  ].join("-");
}

/** Parses a stored row, returning undefined for anything outside the contract. */
export function parseOperationalIncident(
  row: Row,
  workspaceId: string,
): OperationalIncidentRecord | undefined {
  const id = typeof row.id === "string" && UUID.test(row.id) ? row.id.toLowerCase() : undefined;
  const snapshotId =
    typeof row.snapshotId === "string" && UUID.test(row.snapshotId)
      ? row.snapshotId.toLowerCase()
      : undefined;
  const itemId =
    typeof row.itemFabricId === "string" && ITEM_ID.test(row.itemFabricId)
      ? row.itemFabricId
      : undefined;
  const jobType =
    typeof row.jobType === "string" && JOB_TYPE.test(row.jobType)
      ? row.jobType
      : undefined;
  const occurredAt = isoTime(row.occurredAt);
  const observedAt = isoTime(row.observedAt);
  const firstObservedAt = isoTime(row.firstObservedAt);
  if (
    !id ||
    !snapshotId ||
    !itemId ||
    !jobType ||
    !occurredAt ||
    !observedAt ||
    !firstObservedAt ||
    !sameText(row.workspace_id, workspaceId) ||
    row.source !== "fabric-job-history" ||
    row.contractVersion !== OPERATIONAL_INCIDENT_CONTRACT_VERSION ||
    typeof row.writerEmail !== "string" ||
    typeof row.itemName !== "string"
  ) {
    return undefined;
  }
  const key = incidentKey(workspaceId, itemId, jobType);
  if (row.incidentKey !== key) return undefined;
  const runId =
    typeof row.runId === "string" && UUID.test(row.runId)
      ? row.runId.toLowerCase()
      : undefined;
  const durationSec =
    typeof row.durationSec === "number" &&
    Number.isInteger(row.durationSec) &&
    row.durationSec >= 0
      ? row.durationSec
      : undefined;
  const firstObservedSnapshotId =
    typeof row.firstObservedSnapshotId === "string" &&
    UUID.test(row.firstObservedSnapshotId)
      ? row.firstObservedSnapshotId.toLowerCase()
      : undefined;
  return {
    id,
    workspaceId: workspaceId.toLowerCase(),
    snapshotId,
    writerEmail: row.writerEmail.toLowerCase(),
    key,
    itemId,
    itemName: boundedName(row.itemName) || itemId,
    ...(typeof row.itemType === "string" && ITEM_TYPE.test(row.itemType)
      ? { itemType: row.itemType }
      : {}),
    jobType,
    ...(runId ? { runId } : {}),
    occurredAt,
    ...(durationSec != null ? { durationSec } : {}),
    observedAt,
    firstObservedAt,
    ...(firstObservedSnapshotId ? { firstObservedSnapshotId } : {}),
    source: "fabric-job-history",
    contractVersion: OPERATIONAL_INCIDENT_CONTRACT_VERSION,
  };
}

export interface OperationalIncidentRowsInput {
  workspaceId: string;
  snapshotId: string;
  writerEmail: string;
  observedAt: string;
  data: Pick<AtlasData, "workspace" | "items" | "jobs">;
  /** Records of the immediately preceding published snapshot. */
  previous?: readonly OperationalIncidentRecord[];
}

/**
 * Builds allowlisted rows from the snapshot's job history. Messages and any
 * other free text from Fabric are dropped; identifiers that do not match their
 * expected shape are skipped and counted instead of being stored.
 */
export async function operationalIncidentRows(
  input: OperationalIncidentRowsInput,
): Promise<{ rows: Row[]; skipped: number; truncated: boolean }> {
  const workspaceId = input.workspaceId.toLowerCase();
  const snapshotId = input.snapshotId.toLowerCase();
  if (!UUID.test(workspaceId) || !UUID.test(snapshotId)) {
    throw new Error("Operational incidents need valid workspace and snapshot IDs.");
  }
  const observedAt = isoTime(input.observedAt);
  if (!observedAt) throw new Error("Operational incidents need an observation time.");
  const previousByKey = new Map(
    (input.previous ?? []).map((record) => [record.key, record]),
  );
  const incidents = observedIncidents({
    ...input.data,
    workspace: { ...input.data.workspace, fabricId: workspaceId },
  });
  const rows: Row[] = [];
  let skipped = 0;
  for (const incident of incidents) {
    const occurredAt = isoTime(incident.occurredAt);
    if (
      !ITEM_ID.test(incident.itemId) ||
      !JOB_TYPE.test(incident.jobType) ||
      !occurredAt ||
      Date.parse(occurredAt) <= 0
    ) {
      skipped += 1;
      continue;
    }
    if (rows.length >= MAX_INCIDENTS_PER_SNAPSHOT) {
      return { rows, skipped, truncated: true };
    }
    const previous = previousByKey.get(incident.key);
    rows.push({
      id: await stableUuid(
        ["operational-incident", "v1", snapshotId, incident.key].join("|"),
      ),
      workspace_id: workspaceId,
      snapshotId,
      writerEmail: input.writerEmail.trim().toLowerCase(),
      incidentKey: incident.key,
      itemFabricId: incident.itemId,
      itemName: boundedName(incident.itemName) || incident.itemId,
      ...(incident.itemType && ITEM_TYPE.test(incident.itemType)
        ? { itemType: incident.itemType }
        : {}),
      jobType: incident.jobType,
      ...(incident.runId && UUID.test(incident.runId)
        ? { runId: incident.runId.toLowerCase() }
        : {}),
      occurredAt: new Date(occurredAt),
      ...(Number.isInteger(incident.durationSec) && incident.durationSec >= 0
        ? { durationSec: incident.durationSec }
        : {}),
      observedAt: new Date(observedAt),
      firstObservedAt: new Date(previous?.firstObservedAt ?? observedAt),
      firstObservedSnapshotId:
        previous?.firstObservedSnapshotId ?? previous?.snapshotId ?? snapshotId,
      source: "fabric-job-history",
      contractVersion: OPERATIONAL_INCIDENT_CONTRACT_VERSION,
    });
  }
  return { rows, skipped, truncated: false };
}

async function readRows(
  api: OperationalIncidentApi,
  filter: Row,
  signal?: AbortSignal,
): Promise<Row[]> {
  const rows: Row[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    let query = api.select(FIELDS).where(filter).first(PAGE_SIZE);
    if (cursor) query = query.after(cursor);
    const result = await query.executePaginated();
    rows.push(...result.items);
    if (!result.hasNextPage) return rows;
    if (!result.endCursor || cursors.has(result.endCursor)) {
      throw new Error("Operational incident pagination did not advance.");
    }
    cursors.add(result.endCursor);
    cursor = result.endCursor;
  }
  throw new Error("Operational incidents exceeded the page limit.");
}

async function readTrustedRows(
  api: OperationalIncidentApi,
  workspaceId: string,
  snapshotId?: string,
  signal?: AbortSignal,
): Promise<Row[]> {
  const groups = await Promise.all(
    trustedWriterEmails().map((writerEmail) =>
      readRows(
        api,
        {
          workspace_id: { eq: workspaceId },
          ...(snapshotId ? { snapshotId: { eq: snapshotId } } : {}),
          writerEmail: { eq: writerEmail },
        },
        signal,
      ),
    ),
  );
  return groups.flat();
}

async function incidentApi(): Promise<OperationalIncidentApi> {
  const { getRayfinClient } = await import("@/lib/rayfin-client");
  const api = (
    getRayfinClient().data as unknown as Record<
      string,
      OperationalIncidentApi | undefined
    >
  )[OPERATIONAL_INCIDENT_ENTITY];
  if (!api?.select) {
    throw new OperationalIncidentsUnavailableError();
  }
  return api;
}

export class OperationalIncidentsUnavailableError extends Error {
  constructor() {
    super("The OperationalIncident entity is not deployed.");
    this.name = "OperationalIncidentsUnavailableError";
  }
}

/** Reads validated incident records for one published snapshot. */
export async function readOperationalIncidents(
  workspaceId: string,
  snapshotId: string,
  api?: OperationalIncidentApi,
  signal?: AbortSignal,
): Promise<OperationalIncidentRecord[]> {
  const workspace = workspaceId.toLowerCase();
  const snapshot = snapshotId.toLowerCase();
  if (!UUID.test(workspace) || !UUID.test(snapshot)) return [];
  const source = api ?? (await incidentApi());
  const rows = await readTrustedRows(source, workspace, snapshot, signal);
  const byId = new Map<string, OperationalIncidentRecord>();
  for (const row of rows) {
    const record = parseOperationalIncident(row, workspace);
    if (record && record.snapshotId === snapshot) byId.set(record.id, record);
  }
  return [...byId.values()].sort(
    (left, right) =>
      Date.parse(right.occurredAt) - Date.parse(left.occurredAt) ||
      left.key.localeCompare(right.key),
  );
}

async function createRow(api: OperationalIncidentApi, row: Row): Promise<void> {
  try {
    await api.create(row);
  } catch (error) {
    // A timed-out create may still have committed; retry only when absent.
    const existing = await readRows(api, { id: { eq: row.id } }).catch(() => []);
    if (existing.some((candidate) => sameText(candidate.id, row.id))) return;
    try {
      await api.create(row);
    } catch {
      throw error;
    }
  }
}

export type OperationalIncidentPersistResult = {
  status: "persisted";
  written: number;
  skipped: number;
  truncated: boolean;
  pruned: number;
  retentionWarning?: boolean;
};

export interface OperationalIncidentPersistInput
  extends Omit<OperationalIncidentRowsInput, "previous"> {
  /** The published snapshot before this one, used to carry first observation. */
  previousSnapshotId?: string;
  /** Number of snapshots whose incident rows are retained. */
  retainedSnapshots?: number;
}

/**
 * Writes the incident rows of a published snapshot and prunes rows of the
 * oldest snapshots. Writes are idempotent per snapshot and incident key.
 */
export async function persistOperationalIncidents(
  input: OperationalIncidentPersistInput,
  api: OperationalIncidentApi,
): Promise<OperationalIncidentPersistResult> {
  const workspaceId = input.workspaceId.toLowerCase();
  const snapshotId = input.snapshotId.toLowerCase();
  const previous =
    input.previousSnapshotId && UUID.test(input.previousSnapshotId)
      ? await readOperationalIncidents(workspaceId, input.previousSnapshotId, api)
      : [];
  const { rows, skipped, truncated } = await operationalIncidentRows({
    ...input,
    previous,
  });
  const existing = new Set(
    (await readTrustedRows(api, workspaceId, snapshotId)).map((row) =>
      String(row.id).toLowerCase(),
    ),
  );
  const pending = rows.filter((row) => !existing.has(String(row.id)));
  for (let offset = 0; offset < pending.length; offset += WRITE_BATCH_SIZE) {
    await Promise.all(
      pending.slice(offset, offset + WRITE_BATCH_SIZE).map((row) => createRow(api, row)),
    );
  }

  let pruned = 0;
  let retentionWarning = false;
  try {
    const all = await readTrustedRows(api, workspaceId);
    const newestBySnapshot = new Map<string, number>();
    for (const row of all) {
      const snapshot = String(row.snapshotId ?? "").toLowerCase();
      const observed = Date.parse(isoTime(row.observedAt) ?? "") || 0;
      newestBySnapshot.set(
        snapshot,
        Math.max(newestBySnapshot.get(snapshot) ?? 0, observed),
      );
    }
    const retained = new Set(
      [...newestBySnapshot.entries()]
        .sort((left, right) => right[1] - left[1] || right[0].localeCompare(left[0]))
        .slice(0, Math.max(1, input.retainedSnapshots ?? ATLAS_CONFIG.snapshotRetentionCount))
        .map(([snapshot]) => snapshot),
    );
    retained.add(snapshotId);
    for (const row of all) {
      if (pruned >= MAX_DELETES_PER_SYNC) break;
      const snapshot = String(row.snapshotId ?? "").toLowerCase();
      if (
        retained.has(snapshot) ||
        !sameText(row.workspace_id, workspaceId) ||
        typeof row.id !== "string"
      ) {
        continue;
      }
      await api.delete({ id: row.id });
      pruned += 1;
    }
  } catch {
    retentionWarning = true;
  }
  return {
    status: "persisted",
    written: pending.length,
    skipped,
    truncated,
    pruned,
    ...(retentionWarning ? { retentionWarning } : {}),
  };
}
