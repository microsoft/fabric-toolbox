import { ATLAS_CONFIG } from "./config";
import {
  ItemRelationsContractError,
  mergeItemRelationsEvidence,
  parseItemRelationsEvidence,
  type ItemRelationsEvidence,
} from "./item-relations-evidence";
import type {
  ItemRelationsEvidenceCoverage,
  PersistedItemRelationsEvidence,
} from "./item-relations-evidence-source";
import { buildLineageEvidence } from "./lineage-evidence";
import type { Edge, Item } from "./model";

// Persistence for non-authoritative Item Relations evidence. An envelope is
// split into ordered chunk rows and published by a manifest row written last.
// Nothing here reads or writes LineageEdge.

export const ITEM_RELATIONS_EVIDENCE_ENTITY = "ItemRelationsEvidenceSnapshot";
export const ITEM_RELATIONS_EVIDENCE_STORAGE_VERSION = 1;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHUNK_LENGTH = 3_200;
const MAX_CHUNKS = 2_000;
const MAX_STOP_REASONS_LENGTH = 200;
const RETAINED_ENVELOPES = 3;
const LOAD_CANDIDATES = 3;
const PAGE_SIZE = 100;
const MAX_PAGES = 50;
const WRITE_BATCH_SIZE = 8;

const FIELDS = [
  "id",
  "workspace_id",
  "snapshotId",
  "evidenceId",
  "correlationId",
  "writerEmail",
  "rowType",
  "chunkIndex",
  "chunkCount",
  "payload",
  "collectedAt",
  "storageVersion",
  "payloadLength",
  "payloadHash",
  "queryCount",
  "completeQueryCount",
  "preservedQueryCount",
  "failedQueryCount",
  "relationCount",
  "unresolvedCount",
  "crossWorkspaceCount",
  "conflictCount",
  "sampledItemCount",
  "workspaceItemCount",
  "stopReasons",
] as const;

type Row = Record<string, unknown>;

interface EvidenceQuery {
  where(filter: Row): EvidenceQuery;
  first(count: number): EvidenceQuery;
  after(cursor: string): EvidenceQuery;
  executePaginated(): Promise<{
    items: Row[];
    endCursor?: string;
    hasNextPage: boolean;
  }>;
}

export interface ItemRelationsEvidenceApi {
  select(fields: readonly string[]): EvidenceQuery;
  create(row: Row): Promise<unknown>;
  delete(filter: Row): Promise<unknown>;
}

export interface ItemRelationsEvidenceSummary {
  queryCount: number;
  completeQueryCount: number;
  preservedQueryCount: number;
  failedQueryCount: number;
  relationCount: number;
  unresolvedCount: number;
  crossWorkspaceCount: number;
  conflictCount: number;
}

export interface ItemRelationsEvidenceRecordInput {
  workspaceId: string;
  snapshotId: string;
  correlationId?: string;
  writerEmail: string;
  evidence: ItemRelationsEvidence;
  coverage: ItemRelationsEvidenceCoverage;
  summary: ItemRelationsEvidenceSummary;
  evidenceId?: string;
}

async function evidenceApi(): Promise<ItemRelationsEvidenceApi> {
  const { getRayfinClient } = await import("@/lib/rayfin-client");
  const api = (
    getRayfinClient().data as unknown as Record<
      string,
      ItemRelationsEvidenceApi | undefined
    >
  )[ITEM_RELATIONS_EVIDENCE_ENTITY];
  if (!api) {
    throw new Error("The Item Relations evidence entity is not deployed.");
  }
  return api;
}

function invalid(reason: string): never {
  throw new ItemRelationsContractError(`persisted ${reason}`);
}

function uuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID.test(value)) {
    invalid(`${label} is not a UUID`);
  }
  return value.toLowerCase();
}

function count(value: unknown, label: string, maximum = 1_000_000): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > maximum
  ) {
    invalid(`${label} is not a bounded count`);
  }
  return value;
}

function optionalCount(value: unknown, label: string): number | undefined {
  return value == null ? undefined : count(value, label);
}

function timestamp(value: unknown): string {
  const parsed =
    value instanceof Date
      ? value.getTime()
      : typeof value === "string"
        ? Date.parse(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) invalid("collection time is not a timestamp");
  return new Date(parsed).toISOString();
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

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function splitPayload(value: string): string[] {
  const chunks: string[] = [];
  let offset = 0;
  while (offset < value.length) {
    let end = Math.min(value.length, offset + CHUNK_LENGTH);
    const last = value.charCodeAt(end - 1);
    // Never split a UTF-16 surrogate pair across rows.
    if (end < value.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
    chunks.push(value.slice(offset, end));
    offset = end;
  }
  if (chunks.length === 0 || chunks.length > MAX_CHUNKS) {
    throw new Error("The Item Relations evidence exceeds the storage limit.");
  }
  return chunks;
}

function stopReasonsText(reasons: readonly string[]): string | undefined {
  const text = [...new Set(reasons)].sort().join(",");
  return text ? text.slice(0, MAX_STOP_REASONS_LENGTH) : undefined;
}

/**
 * Counts derived when the envelope is stored, compared against the Atlas
 * snapshot published by the same synchronization.
 */
export function summarizeItemRelationsEvidence(
  evidence: ItemRelationsEvidence,
  snapshot: { items: readonly Item[]; edges: readonly Edge[]; workspaceName?: string },
): ItemRelationsEvidenceSummary {
  const model = buildLineageEvidence({
    items: snapshot.items,
    edges: snapshot.edges,
    workspaceId: evidence.workspaceId,
    workspaceName: snapshot.workspaceName,
    evidence,
  });
  const graph = model.previewGraph;
  return {
    queryCount: evidence.queries.length,
    completeQueryCount: graph?.coverage.complete ?? 0,
    preservedQueryCount: graph?.coverage.preserved ?? 0,
    failedQueryCount: graph?.coverage.failed ?? 0,
    relationCount: (graph?.edges.length ?? 0) + (graph?.unresolved.length ?? 0),
    unresolvedCount: graph?.unresolved.length ?? 0,
    crossWorkspaceCount:
      graph?.edges.filter((edge) => edge.crossWorkspace).length ?? 0,
    conflictCount: model.counts.conflict,
  };
}

/** Chunk rows followed by the manifest; callers must write them in order. */
export async function itemRelationsEvidenceRows(
  input: ItemRelationsEvidenceRecordInput,
): Promise<Row[]> {
  const workspaceId = uuid(input.workspaceId, "workspace ID");
  const evidence = parseItemRelationsEvidence(input.evidence, workspaceId);
  const writerEmail = input.writerEmail.trim().toLowerCase();
  if (!writerEmail || writerEmail.length > 160) {
    throw new Error("A configured synchronizer email is required.");
  }
  const serialized = JSON.stringify(evidence);
  const chunks = splitPayload(serialized);
  const base = {
    workspace_id: workspaceId,
    snapshotId: uuid(input.snapshotId, "snapshot ID"),
    evidenceId: uuid(input.evidenceId ?? crypto.randomUUID(), "evidence ID"),
    ...(input.correlationId
      ? { correlationId: uuid(input.correlationId, "correlation ID") }
      : {}),
    writerEmail,
    chunkCount: chunks.length,
    collectedAt: new Date(evidence.collectedAt),
  };
  return [
    ...chunks.map((payload, index) => ({
      id: crypto.randomUUID(),
      ...base,
      rowType: "chunk",
      chunkIndex: index + 1,
      payload,
    })),
    {
      id: crypto.randomUUID(),
      ...base,
      rowType: "manifest",
      chunkIndex: 0,
      payload: "{}",
      storageVersion: ITEM_RELATIONS_EVIDENCE_STORAGE_VERSION,
      payloadLength: serialized.length,
      payloadHash: await sha256(serialized),
      ...input.summary,
      sampledItemCount: input.coverage.sampledItemCount,
      workspaceItemCount: input.coverage.workspaceItemCount,
      stopReasons: stopReasonsText(input.coverage.stopReasons),
    },
  ];
}

/** Rebuilds and validates one envelope from its manifest and chunk rows. */
export async function evidenceFromRows(
  manifest: Row,
  chunks: readonly Row[],
  workspaceId: string,
): Promise<PersistedItemRelationsEvidence> {
  const expectedWorkspace = uuid(workspaceId, "workspace ID");
  if (
    manifest.rowType !== "manifest" ||
    uuid(manifest.workspace_id, "workspace ID") !== expectedWorkspace ||
    manifest.storageVersion !== ITEM_RELATIONS_EVIDENCE_STORAGE_VERSION
  ) {
    invalid("manifest is not a supported evidence manifest");
  }
  const evidenceId = uuid(manifest.evidenceId, "evidence ID");
  const chunkCount = count(manifest.chunkCount, "chunk count", MAX_CHUNKS);
  if (chunkCount < 1 || chunks.length !== chunkCount) {
    invalid("chunk count does not match the manifest");
  }
  const ordered: string[] = [];
  for (const chunk of chunks) {
    const index = count(chunk.chunkIndex, "chunk index", MAX_CHUNKS);
    if (
      chunk.rowType !== "chunk" ||
      uuid(chunk.evidenceId, "evidence ID") !== evidenceId ||
      uuid(chunk.workspace_id, "workspace ID") !== expectedWorkspace ||
      !sameText(chunk.writerEmail, manifest.writerEmail) ||
      chunk.chunkCount !== chunkCount ||
      index < 1 ||
      index > chunkCount ||
      ordered[index - 1] !== undefined ||
      typeof chunk.payload !== "string"
    ) {
      invalid("chunks do not match the manifest");
    }
    ordered[index - 1] = chunk.payload;
  }
  const serialized = ordered.join("");
  if (
    serialized.length !== manifest.payloadLength ||
    (await sha256(serialized)) !== manifest.payloadHash
  ) {
    invalid("payload does not match its checksum");
  }
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    invalid("payload is not JSON");
  }
  const evidence = parseItemRelationsEvidence(value, expectedWorkspace);
  timestamp(manifest.collectedAt);
  const stopReasons =
    typeof manifest.stopReasons === "string" && manifest.stopReasons
      ? manifest.stopReasons.split(",").filter(Boolean)
      : [];
  return {
    envelope: evidence,
    snapshotId: uuid(manifest.snapshotId, "snapshot ID"),
    coverage: {
      sampledItemCount: optionalCount(
        manifest.sampledItemCount,
        "sampled item count",
      ),
      workspaceItemCount: optionalCount(
        manifest.workspaceItemCount,
        "workspace item count",
      ),
      stopReasons,
    },
  };
}

async function readRows(
  api: ItemRelationsEvidenceApi,
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
      throw new Error("Item Relations evidence pagination did not advance.");
    }
    cursors.add(result.endCursor);
    cursor = result.endCursor;
  }
  throw new Error("Item Relations evidence exceeded the page limit.");
}

async function trustedManifests(
  api: ItemRelationsEvidenceApi,
  workspaceId: string,
  signal?: AbortSignal,
): Promise<Row[]> {
  const groups = await Promise.all(
    trustedWriterEmails().map((writerEmail) =>
      readRows(
        api,
        {
          workspace_id: { eq: workspaceId },
          rowType: { eq: "manifest" },
          writerEmail: { eq: writerEmail },
        },
        signal,
      ),
    ),
  );
  const byEvidence = new Map<string, Row>();
  for (const row of groups.flat()) {
    if (
      sameText(row.workspace_id, workspaceId) &&
      typeof row.evidenceId === "string" &&
      !byEvidence.has(row.evidenceId.toLowerCase())
    ) {
      byEvidence.set(row.evidenceId.toLowerCase(), row);
    }
  }
  const time = (row: Row) => {
    try {
      return Date.parse(timestamp(row.collectedAt));
    } catch {
      return Number.NEGATIVE_INFINITY;
    }
  };
  return [...byEvidence.values()].sort(
    (left, right) =>
      time(right) - time(left) ||
      String(right.evidenceId).localeCompare(String(left.evidenceId)),
  );
}

/**
 * Returns the newest envelope that passes integrity and contract validation,
 * `null` when none is stored, and throws when stored envelopes are all invalid.
 */
export async function readLatestItemRelationsEvidence(
  workspaceId: string,
  signal?: AbortSignal,
  api?: ItemRelationsEvidenceApi,
): Promise<PersistedItemRelationsEvidence | null> {
  const target = uuid(workspaceId, "workspace ID");
  const source = api ?? (await evidenceApi());
  const manifests = await trustedManifests(source, target, signal);
  let lastError: unknown;
  for (const manifest of manifests.slice(0, LOAD_CANDIDATES)) {
    try {
      const chunks = await readRows(
        source,
        {
          workspace_id: { eq: target },
          evidenceId: { eq: String(manifest.evidenceId) },
          rowType: { eq: "chunk" },
          writerEmail: { eq: String(manifest.writerEmail) },
        },
        signal,
      );
      return await evidenceFromRows(manifest, chunks, target);
    } catch (error) {
      if (signal?.aborted) throw error;
      console.warn(
        "[atlas] ignored invalid persisted Item Relations evidence",
        String(manifest.evidenceId),
      );
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return null;
}

async function createRow(
  api: ItemRelationsEvidenceApi,
  row: Row,
): Promise<void> {
  try {
    await api.create(row);
  } catch (error) {
    // A timed-out create may still have committed; retry only when absent.
    const existing = await readRows(api, { id: { eq: row.id } }).catch(
      () => [],
    );
    if (existing.some((candidate) => sameText(candidate.id, row.id))) return;
    try {
      await api.create(row);
    } catch {
      throw error;
    }
  }
}

async function deleteEnvelope(
  api: ItemRelationsEvidenceApi,
  workspaceId: string,
  evidenceId: string,
  writerEmail: string,
): Promise<void> {
  const rows = await readRows(api, {
    workspace_id: { eq: workspaceId },
    evidenceId: { eq: evidenceId },
    writerEmail: { eq: writerEmail },
  });
  for (const row of rows) {
    if (
      sameText(row.workspace_id, workspaceId) &&
      sameText(row.evidenceId, evidenceId) &&
      typeof row.id === "string"
    ) {
      await api.delete({ id: row.id });
    }
  }
}

export type ItemRelationsEvidencePersistResult =
  | {
      status: "persisted";
      evidenceId: string;
      summary: ItemRelationsEvidenceSummary;
      retentionWarning?: boolean;
    }
  | { status: "skipped"; reason: "prior-evidence-unreadable" };

export interface ItemRelationsEvidencePersistInput {
  workspaceId: string;
  snapshotId: string;
  correlationId?: string;
  writerEmail: string;
  collection: {
    evidence: ItemRelationsEvidence;
    sampledItemCount: number;
    workspaceItemCount: number;
    stopReasons: readonly string[];
  };
  snapshot: { items: readonly Item[]; edges: readonly Edge[]; workspaceName?: string };
}

/**
 * Stores a collection after its Atlas snapshot is published. Failed or
 * not-attempted queries keep the previous response through
 * `mergeItemRelationsEvidence`. When prior evidence cannot be read, nothing
 * is written so the visible evidence is never silently replaced.
 */
export async function persistItemRelationsEvidence(
  input: ItemRelationsEvidencePersistInput,
  api?: ItemRelationsEvidenceApi,
): Promise<ItemRelationsEvidencePersistResult> {
  const workspaceId = uuid(input.workspaceId, "workspace ID");
  const writerEmail = input.writerEmail.trim().toLowerCase();
  const source = api ?? (await evidenceApi());
  const next = parseItemRelationsEvidence(
    input.collection.evidence,
    workspaceId,
  );
  let previous: ItemRelationsEvidence | null = null;
  try {
    const stored = await readLatestItemRelationsEvidence(
      workspaceId,
      undefined,
      source,
    );
    previous = stored
      ? parseItemRelationsEvidence(stored.envelope, workspaceId)
      : null;
  } catch (error) {
    if (!(error instanceof ItemRelationsContractError)) {
      return { status: "skipped", reason: "prior-evidence-unreadable" };
    }
  }
  const evidence = mergeItemRelationsEvidence(previous, next);
  const summary = summarizeItemRelationsEvidence(evidence, input.snapshot);
  const evidenceId = crypto.randomUUID();
  const rows = await itemRelationsEvidenceRows({
    workspaceId,
    snapshotId: input.snapshotId,
    correlationId: input.correlationId,
    writerEmail,
    evidence,
    coverage: {
      sampledItemCount: input.collection.sampledItemCount,
      workspaceItemCount: input.collection.workspaceItemCount,
      stopReasons: [...input.collection.stopReasons],
    },
    summary,
    evidenceId,
  });
  const manifest = rows[rows.length - 1];
  const chunks = rows.slice(0, -1);
  try {
    for (let offset = 0; offset < chunks.length; offset += WRITE_BATCH_SIZE) {
      await Promise.all(
        chunks
          .slice(offset, offset + WRITE_BATCH_SIZE)
          .map((row) => createRow(source, row)),
      );
    }
    await createRow(source, manifest);
  } catch (error) {
    await deleteEnvelope(source, workspaceId, evidenceId, writerEmail).catch(
      () => undefined,
    );
    throw error;
  }

  let retentionWarning = false;
  try {
    const manifests = await trustedManifests(source, workspaceId);
    for (const stale of manifests.slice(RETAINED_ENVELOPES)) {
      await deleteEnvelope(
        source,
        workspaceId,
        String(stale.evidenceId),
        String(stale.writerEmail),
      );
    }
  } catch {
    retentionWarning = true;
  }
  return {
    status: "persisted",
    evidenceId,
    summary,
    ...(retentionWarning ? { retentionWarning } : {}),
  };
}
