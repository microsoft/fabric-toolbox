// Persistence + sync boundary.
//
// Preview / standalone: everything is kept in-memory from the sample dataset,
// so the app is fully explorable without a backend (and drives the screenshots).
//
// Deployed inside Fabric:
//  - `runFabricSync` acquires a token (MSAL), invokes the `sync_all` Fabric User
//    Data Function, maps the Fabric REST payload onto the Atlas model, writes it
//    into the Rayfin entities, and returns it for immediate display.
//  - `loadFromDb` re-reads the Rayfin entities on startup so a previous sync is
//    shown without re-calling Fabric.
//  - `persistComment` writes a new comment to the Comment entity.
//
// Every backend call is wired defensively so a missing/ës misconfigured backend
// never breaks the UI — see docs/architecture.md for the full flow.

import { ATLAS_CONFIG } from "./config";
import {
  invokeSyncAll,
  mapSyncToAtlas,
  realText,
  SyncCancelledError,
  toItemType,
  type SyncIdentity,
} from "./live-sync";
import { normalizeLineageEdges } from "./lineage";
import { DEPLOYMENT_ID } from "./release";
import {
  buildAtlasHistory,
  snapshotFromData,
  summarizeSnapshot,
  type AtlasHistory,
  type HistoricalSnapshot,
  type SnapshotCatalog,
  type SnapshotSummary,
} from "./history";
import type {
  AtlasData,
  Comment,
  Edge,
  Grant,
  Item,
  Job,
  ModelTableSchema,
  Principal,
  WorkspaceInfo,
} from "./model";
import {
  itemMetadataFromSchema,
  parseObjectLineagePayload,
  type MetadataObjectLineageEdge,
} from "./item-metadata";

export type SyncProgressReporter = (progress: number, stage: string) => void;

type Row = Record<string, unknown>;
const SNAPSHOT_WRITE_BATCH_SIZE = 8;
const SYNC_RUN_UPDATE_RETRY_DELAYS_MS = [0, 100, 400];

function assertSyncActive(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new SyncCancelledError("Synchronization cancelled.");
  }
}

interface EntityQuery {
  where: (filter: Row) => EntityQuery;
  first: (count: number) => EntityQuery;
  after: (cursor: string) => EntityQuery;
  executePaginated: () => Promise<{
    items: Row[];
    endCursor?: string;
    hasNextPage: boolean;
  }>;
}
interface EntityApi {
  select?: (fields: readonly string[]) => EntityQuery;
  findMany?: (f?: unknown) => Promise<Row[]>;
  create: (v: Row) => Promise<Row>;
  update?: (filter: Row, values: Row) => Promise<unknown>;
  delete?: (filter: Row) => Promise<unknown>;
}

const ENTITY_FIELDS: Record<string, readonly string[]> = {
  Workspace: [
    "id",
    "snapshotId",
    "writerEmail",
    "deploymentId",
    "syncSectionsJson",
    "fabricId",
    "displayName",
    "capacity",
    "region",
    "itemCount",
    "edgeCount",
    "principalCount",
    "grantCount",
    "jobCount",
    "configCount",
    "schemaEntryCount",
    "summaryVersion",
    "healthyCount",
    "staleCount",
    "failingCount",
    "labelCount",
    "externalPrincipalCount",
    "failedJobCount",
    "brokenEdgeCount",
    "tableCount",
    "columnCount",
    "measureCount",
    "syncedAt",
  ],
  FabricItem: [
    "id",
    "workspace_id",
    "snapshotId",
    "writerEmail",
    "fabricId",
    "displayName",
    "itemType",
    "size",
    "description",
    "ownerName",
    "ownerEmail",
    "configuredBy",
    "modifiedBy",
    "health",
    "endorsement",
    "endorsementRaw",
    "endorsementBy",
    "sensitivity",
    "sensitivityLabelId",
    "tags",
    "tagIds",
    "ownerMetadataAvailable",
    "sensitivityMetadataAvailable",
    "endorsementMetadataAvailable",
    "tagMetadataAvailable",
    "lastRefresh",
    "itemCreatedAt",
    "itemUpdatedAt",
  ],
  LineageEdge: [
    "id",
    "workspace_id",
    "snapshotId",
    "writerEmail",
    "sourceFabricId",
    "targetFabricId",
    "relation",
    "broken",
  ],
  Principal: [
    "id",
    "workspace_id",
    "snapshotId",
    "writerEmail",
    "principalId",
    "displayName",
    "kind",
    "email",
    "external",
    "workspaceRole",
  ],
  AccessGrant: [
    "id",
    "workspace_id",
    "snapshotId",
    "writerEmail",
    "itemFabricId",
    "principalRef",
    "accessLevel",
    "source",
    "roleName",
    "flag",
  ],
  JobRun: [
    "id",
    "workspace_id",
    "snapshotId",
    "writerEmail",
    "itemFabricId",
    "itemName",
    "jobType",
    "status",
    "startedAt",
    "durationSec",
    "message",
  ],
  ConfigEntry: [
    "id",
    "workspace_id",
    "snapshotId",
    "writerEmail",
    "itemFabricId",
    "section",
    "label",
    "value",
  ],
  Comment: [
    "id",
    "workspace_id",
    "itemFabricId",
    "authorId",
    "authorName",
    "authorEmail",
    "body",
    "createdAt",
  ],
  SyncRun: [
    "id",
    "workspace_id",
    "snapshotId",
    "correlationId",
    "writerEmail",
    "startedAt",
    "finishedAt",
    "status",
    "itemsSynced",
    "durationMs",
    "failureCode",
    "failureMessage",
    "triggeredBy",
    "summary",
  ],
};

async function dataApi(): Promise<Record<string, EntityApi>> {
  const { getRayfinClient } = await import("@/lib/rayfin-client");
  return getRayfinClient().data as unknown as Record<string, EntityApi>;
}

function workspaceId(): string {
  return (
    (window as unknown as { __atlasWorkspaceId?: string }).__atlasWorkspaceId ??
    ATLAS_CONFIG.workspaceId
  );
}

const WS_FALLBACK: WorkspaceInfo = {
  fabricId: ATLAS_CONFIG.workspaceId,
  displayName: ATLAS_CONFIG.workspaceName,
  capacity: "",
  region: "",
};

interface SyncAttempt {
  id: string;
  snapshotId: string;
  workspaceId: string;
  writerEmail: string;
  startedAt: Date;
  data: Record<string, EntityApi>;
  user: SyncIdentity;
}

function textOrFallback(value: unknown, fallback: string): string {
  const text = value == null ? "" : String(value).trim();
  return !text || text === "undefined" || text === "null" ? fallback : text;
}

function requireSyncWriter(user: SyncIdentity): string {
  const expectedSubject = ATLAS_CONFIG.syncAdminSubject.trim();
  const actualSubject = user.id?.trim() ?? "";
  if (
    !expectedSubject ||
    !actualSubject ||
    actualSubject !== expectedSubject
  ) {
    throw new Error(
      "Only the configured Atlas sync administrator can publish workspace snapshots.",
    );
  }
  return ATLAS_CONFIG.syncAdminEmail.trim().toLowerCase();
}

async function startSyncAttempt(user: SyncIdentity): Promise<SyncAttempt> {
  const attempt: SyncAttempt = {
    id: crypto.randomUUID(),
    snapshotId: crypto.randomUUID(),
    workspaceId: workspaceId(),
    writerEmail: requireSyncWriter(user),
    startedAt: new Date(),
    data: await dataApi(),
    user,
  };
  await attempt.data.SyncRun.create({
    id: attempt.id,
    correlationId: attempt.id,
    workspace_id: attempt.workspaceId,
    snapshotId: attempt.snapshotId,
    writerEmail: attempt.writerEmail,
    startedAt: attempt.startedAt,
    status: "running",
    triggeredBy: user.name,
    summary: "Synchronization in progress.",
  });
  return attempt;
}

async function updateSyncAttempt(
  attempt: SyncAttempt,
  status: "completed" | "failed",
  finishedAt: Date,
  itemsSynced?: number,
  summary?: string,
): Promise<void> {
  const api = attempt.data.SyncRun;
  if (!api.update) {
    throw new Error("Rayfin SyncRun does not support status updates");
  }
  let lastError: unknown;
  for (const delay of SYNC_RUN_UPDATE_RETRY_DELAYS_MS) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      await api.update(
        { id: attempt.id },
        {
          finishedAt,
          status,
          itemsSynced,
          durationMs: Math.max(
            0,
            finishedAt.getTime() - attempt.startedAt.getTime(),
          ),
          failureCode: status === "failed" ? "sync-failed" : undefined,
          failureMessage:
            status === "failed"
              ? "Synchronization failed before snapshot publication."
              : undefined,
          summary,
        },
      );
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/* --------------------------- comments --------------------------- */

/** Persist a new comment to the Fabric-backed database (no-op in preview). */
export async function persistComment(
  isPreview: boolean,
  comment: Comment,
): Promise<void> {
  if (isPreview) return;
  if (
    !comment.authorId.trim() ||
    !comment.authorEmail?.trim()
  ) {
    throw new Error("An authenticated comment author is required.");
  }
  if (!comment.body.trim() || comment.body.length > 2000) {
    throw new Error("Comments must contain between 1 and 2000 characters.");
  }
  const data = await dataApi();
  await data.Comment.create({
    workspace_id: workspaceId(),
    itemFabricId: comment.itemFabricId,
    authorId: comment.authorId,
    authorName: comment.authorEmail,
    authorEmail: comment.authorEmail,
    body: comment.body,
    createdAt: new Date(comment.createdAt),
  });
}

/* ----------------------------- sync ----------------------------- */

/**
 * Live sync: invoke the `sync_all` UDF, map the result, persist it to the
 * Rayfin entities, and return it. Returns `null` in preview (no token/backend),
 * so the store keeps its sample data.
 */
export async function runFabricSync(
  isPreview: boolean,
  user: SyncIdentity,
  reportProgress?: SyncProgressReporter,
  signal?: AbortSignal,
): Promise<AtlasData | null> {
  if (isPreview) {
    reportProgress?.(15, "Preparing preview sync");
    await new Promise((r) => setTimeout(r, 250));
    reportProgress?.(65, "Refreshing sample workspace");
    await new Promise((r) => setTimeout(r, 400));
    reportProgress?.(100, "Sync complete");
    return null;
  }
  assertSyncActive(signal);
  const attempt = await startSyncAttempt(user);
  try {
    const raw = await invokeSyncAll(
      attempt.workspaceId,
      user,
      reportProgress,
      signal,
      attempt.id,
    );
    reportProgress?.(62, "Workspace metadata complete");
    const atlas = mapSyncToAtlas(raw, WS_FALLBACK);
    reportProgress?.(66, "Building the governance catalog");
    reportProgress?.(69, "Preserving team notes");
    const persisted = await persistSync(
      atlas,
      reportProgress,
      attempt,
      signal,
    );
    reportProgress?.(100, "Sync complete");
    return persisted;
  } catch (error) {
    try {
      await updateSyncAttempt(
        attempt,
        "failed",
        new Date(),
        undefined,
        "Synchronization failed before snapshot publication.",
      );
    } catch (attemptError) {
      console.warn("[atlas] failed to record sync failure", attemptError);
    }
    throw error;
  }
}

/** Replace the catalog rows in the Rayfin DB with a freshly synced snapshot. */
async function persistSync(
  atlas: AtlasData,
  reportProgress?: SyncProgressReporter,
  attempt?: SyncAttempt,
  signal?: AbortSignal,
): Promise<AtlasData> {
  if (!attempt) {
    throw new Error("A synchronization attempt is required for persistence");
  }
  const wid = attempt.workspaceId;
  const snapshotId = attempt.snapshotId;
  const syncedAt = new Date();
  const writerEmail = attempt.writerEmail;
  const data = attempt.data;

  const insertAll = async (entity: string, rows: Row[]) => {
    for (
      let offset = 0;
      offset < rows.length;
      offset += SNAPSHOT_WRITE_BATCH_SIZE
    ) {
      assertSyncActive(signal);
      const payloads = rows
        .slice(offset, offset + SNAPSHOT_WRITE_BATCH_SIZE)
        .map((row) => ({
          workspace_id: wid,
          snapshotId,
          writerEmail,
          ...row,
        }));
      const results = await Promise.allSettled(
        payloads.map((row) => data[entity].create(row)),
      );
      const failure = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      if (failure) throw failure.reason;
      assertSyncActive(signal);
    }
  };

  assertSyncActive(signal);
  reportProgress?.(70, "Preparing the Atlas database");
  reportProgress?.(76, "Writing workspace items");

  await insertAll(
    "FabricItem",
    atlas.items.map((i) => ({
      fabricId: i.fabricId,
      displayName: i.displayName,
      itemType: i.itemType,
      size: i.size,
      description: i.description,
      ownerName: i.ownerName,
      ownerEmail: i.ownerEmail,
      configuredBy: i.configuredBy,
      modifiedBy: i.modifiedBy,
      health: i.health,
      endorsement: i.endorsement,
      endorsementRaw: i.endorsementRaw,
      endorsementBy: i.endorsementBy,
      sensitivity: i.sensitivity,
      sensitivityLabelId: i.sensitivityLabelId,
      tags: i.tags?.length ? i.tags.join(", ") : undefined,
      tagIds: i.tagIds?.length ? i.tagIds.join(",") : undefined,
      ownerMetadataAvailable: i.ownerMetadataAvailable,
      sensitivityMetadataAvailable: i.sensitivityMetadataAvailable,
      endorsementMetadataAvailable: i.endorsementMetadataAvailable,
      tagMetadataAvailable: i.tagMetadataAvailable,
      lastRefresh: i.lastRefresh ? new Date(i.lastRefresh) : undefined,
      itemCreatedAt: i.createdAt ? new Date(i.createdAt) : undefined,
      itemUpdatedAt: i.updatedAt ? new Date(i.updatedAt) : undefined,
    })),
  );
  reportProgress?.(82, "Writing principals and access");
  await insertAll(
    "Principal",
    atlas.principals.map((p) => ({
      principalId: p.principalId,
      displayName: p.displayName,
      kind: p.kind,
      email: p.email,
      external: p.external,
      workspaceRole: p.workspaceRole,
    })),
  );
  await insertAll(
    "AccessGrant",
    atlas.grants.map((g) => ({
      itemFabricId: g.itemFabricId,
      principalRef: g.principalRef,
      accessLevel: g.accessLevel,
      source: g.source,
      roleName: g.roleName,
      flag: g.flag,
    })),
  );
  reportProgress?.(88, "Writing jobs and lineage");
  await insertAll(
    "JobRun",
    atlas.jobs.map((j) => ({
      itemFabricId: j.itemFabricId,
      itemName: j.itemName,
      jobType: j.jobType,
      status: j.status,
      startedAt: j.startedAt ? new Date(j.startedAt) : undefined,
      durationSec: j.durationSec,
      message: j.message,
    })),
  );
  await insertAll(
    "LineageEdge",
    atlas.edges.map((e) => ({
      sourceFabricId: e.source,
      targetFabricId: e.target,
      relation: e.relation,
      broken: !!e.broken,
    })),
  );
  await insertAll(
    "ConfigEntry",
    atlas.config.map((c) => ({
      itemFabricId: c.itemFabricId,
      section: c.section,
      label: c.label,
      value: c.value,
    })),
  );
  reportProgress?.(94, "Writing object metadata");
  // Persist the sub-object schema as hidden ConfigEntry
  // rows so the Asset Catalog and deep lineage survive a reload without re-sync.
  // Values are chunked instead of truncated so wide table schemas retain every
  // real column while staying within ConfigEntry.value's 2,000-character limit.
  const schemaRows: Row[] = [];
  for (const [itemId, tables] of Object.entries(atlas.schema ?? {})) {
    for (const t of tables) {
      const serialized = JSON.stringify({
        rows:
          typeof t.rows === "number" &&
          Number.isFinite(t.rows) &&
          t.rows >= 0
            ? t.rows
            : undefined,
        objectType: t.objectType,
        source: t.source,
        description: t.description,
        isHidden: t.isHidden,
        columns: t.columns,
        measures: t.measures,
      });
      const chunks = serialized.match(/[\s\S]{1,1960}/g) ?? [""];
      for (let part = 0; part < chunks.length; part += 1) {
        schemaRows.push({
          itemFabricId: itemId,
          section: "__schema__",
          label: t.name,
          value: `v1:${String(part + 1).padStart(4, "0")}:${String(chunks.length).padStart(4, "0")}:${chunks[part]}`,
        });
      }
    }
  }
  if (schemaRows.length) await insertAll("ConfigEntry", schemaRows);
  const objectEdgeRows: Row[] = [];
  const serializedObjectEdges = JSON.stringify(atlas.objectEdges ?? []);
  const objectEdgeChunks =
    serializedObjectEdges === "[]"
      ? []
      : serializedObjectEdges.match(/[\s\S]{1,1960}/g) ?? [];
  for (let part = 0; part < objectEdgeChunks.length; part += 1) {
    objectEdgeRows.push({
      itemFabricId: atlas.workspace.fabricId,
      section: "__object_edges__",
      label: "workspace",
      value: `v1:${String(part + 1).padStart(4, "0")}:${String(objectEdgeChunks.length).padStart(4, "0")}:${objectEdgeChunks[part]}`,
    });
  }
  if (objectEdgeRows.length) {
    await insertAll("ConfigEntry", objectEdgeRows);
  }

  const snapshotSummary = summarizeSnapshot(
    snapshotFromData(atlas, snapshotId, syncedAt.toISOString()),
  );
  const manifest: Row = {
    snapshotId,
    writerEmail,
    deploymentId: DEPLOYMENT_ID,
    syncSectionsJson: atlas.workspace.syncSections
      ? JSON.stringify(atlas.workspace.syncSections)
      : undefined,
    fabricId: atlas.workspace.fabricId,
    displayName: atlas.workspace.displayName,
    capacity: atlas.workspace.capacity,
    region: atlas.workspace.region,
    itemCount: atlas.items.length,
    edgeCount: atlas.edges.length,
    principalCount: atlas.principals.length,
    grantCount: atlas.grants.length,
    jobCount: atlas.jobs.length,
    configCount: atlas.config.length,
    schemaEntryCount: schemaRows.length + objectEdgeRows.length,
    summaryVersion: 1,
    healthyCount: snapshotSummary.healthyCount,
    staleCount: snapshotSummary.staleCount,
    failingCount: snapshotSummary.failingCount,
    labelCount: snapshotSummary.labelCount,
    externalPrincipalCount: snapshotSummary.externalPrincipalCount,
    failedJobCount: snapshotSummary.failedJobCount,
    brokenEdgeCount: snapshotSummary.brokenEdgeCount,
    tableCount: snapshotSummary.tableCount,
    columnCount: snapshotSummary.columnCount,
    measureCount: snapshotSummary.measureCount,
    syncedAt,
  };
  const verifiedCatalog = await verifyPersistedSnapshot(
    data,
    manifest,
    wid,
    snapshotId,
    writerEmail,
  );
  assertSyncActive(signal);

  // The audit row and every snapshot row must succeed before the Workspace
  // marker is written. That final marker is the atomic visibility switch:
  // orphaned rows from a failed attempt are never selected by hydration.
  reportProgress?.(97, "Finalizing the workspace snapshot");
  const syncSummary = `${atlas.items.length} items · ${atlas.edges.length} lineage edges · ${atlas.principals.length} principals · ${atlas.jobs.length} jobs`;
  await updateSyncAttempt(
    attempt,
    "completed",
    syncedAt,
    atlas.items.length,
    syncSummary,
  );
  assertSyncActive(signal);
  await data.Workspace.create(manifest);
  reportProgress?.(99, "Applying snapshot retention");
  try {
    await pruneSnapshots(data, wid, snapshotId, writerEmail);
  } catch (error) {
    console.warn("[atlas] snapshot retention deferred", error);
  }
  try {
    await cleanupOrphanSnapshots(data, wid, writerEmail);
  } catch (error) {
    console.warn("[atlas] orphan cleanup deferred", error);
  }
  return {
    ...verifiedCatalog,
    comments: atlas.comments,
    syncRuns: [
      {
        id: attempt.id,
        startedAt: attempt.startedAt.toISOString(),
        finishedAt: syncedAt.toISOString(),
        status: "completed",
        itemsSynced: atlas.items.length,
        durationMs: Math.max(
          0,
          syncedAt.getTime() - attempt.startedAt.getTime(),
        ),
        triggeredBy: attempt.user.name,
        summary: syncSummary,
      },
      ...atlas.syncRuns,
    ],
  };
}

/* ----------------------------- load ----------------------------- */

const READ_RETRY_DELAYS_MS = [0, 120, 360];

export async function readWithRetry(
  api: EntityApi,
  fields: readonly string[],
  filter: Row,
): Promise<Row[]> {
  let lastError: unknown;
  for (const delay of READ_RETRY_DELAYS_MS) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      if (!api.select) {
        if (!api.findMany) {
          throw new Error("Rayfin entity does not support reads");
        }
        return await api.findMany(filter);
      }
      const rows: Row[] = [];
      let cursor: string | undefined;
      const seenCursors = new Set<string>();
      while (true) {
        let query = api.select(fields).where(filter).first(100);
        if (cursor) query = query.after(cursor);
        const page = await query.executePaginated();
        rows.push(...page.items);
        if (!page.hasNextPage) return rows;
        if (
          !page.endCursor ||
          page.endCursor === cursor ||
          seenCursors.has(page.endCursor)
        ) {
          throw new Error("Rayfin pagination did not advance");
        }
        seenCursors.add(page.endCursor);
        cursor = page.endCursor;
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function sameText(left: unknown, right: unknown): boolean {
  return String(left ?? "").toLowerCase() === String(right ?? "").toLowerCase();
}

function trustedWriterEmails(): string[] {
  return [
    ...new Set(
      [
        ATLAS_CONFIG.syncAdminEmail,
        ...ATLAS_CONFIG.previousSyncWriters,
      ]
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

function isTrustedWriter(value: unknown): boolean {
  return trustedWriterEmails().some((email) => sameText(value, email));
}

function rowBelongsToWorkspace(row: Row, wid: string): boolean {
  return sameText(row.workspace_id, wid);
}

function rowsForSnapshot(
  rows: Row[],
  wid: string,
  snapshotId?: string,
  writerEmail = ATLAS_CONFIG.syncAdminEmail,
): Row[] {
  return rows.filter(
    (row) =>
      rowBelongsToWorkspace(row, wid) &&
      sameText(row.snapshotId, snapshotId) &&
      sameText(row.writerEmail, writerEmail),
  );
}

const MANIFEST_COUNTS = [
  ["itemCount", "items"],
  ["edgeCount", "lineage edges"],
  ["principalCount", "principals"],
  ["grantCount", "access grants"],
  ["jobCount", "jobs"],
  ["configCount", "configuration rows"],
  ["schemaEntryCount", "schema chunks"],
] as const;

function parseChunkedValue(
  rawValues: string[],
  malformedMessage: string,
  incompleteMessage: string,
): string {
  if (rawValues.length === 1 && !rawValues[0].startsWith("v1:")) {
    return rawValues[0];
  }
  const chunks = rawValues.map((value) => {
    const match = /^v1:(\d{4}):(\d{4}):([\s\S]*)$/.exec(value);
    if (!match) throw new Error(malformedMessage);
    return {
      part: Number(match[1]),
      total: Number(match[2]),
      value: match[3],
    };
  });
  const total = chunks[0]?.total ?? 0;
  if (
    total !== chunks.length ||
    chunks.some((chunk) => chunk.total !== total) ||
    new Set(chunks.map((chunk) => chunk.part)).size !== total ||
    chunks.some((chunk) => chunk.part < 1 || chunk.part > total)
  ) {
    throw new Error(incompleteMessage);
  }
  return chunks
    .sort((left, right) => left.part - right.part)
    .map((chunk) => chunk.value)
    .join("");
}

function validateManifest(
  marker: Row,
  counts: Record<(typeof MANIFEST_COUNTS)[number][0], number>,
): void {
  if (
    !marker.snapshotId ||
    !isTrustedWriter(marker.writerEmail)
  ) {
    throw new Error("snapshot manifest is not signed by the configured writer");
  }
  for (const [field, label] of MANIFEST_COUNTS) {
    if (marker[field] == null || Number(marker[field]) !== counts[field]) {
      throw new Error(`snapshot manifest mismatch for ${label}`);
    }
  }
}

function parseSchemaRows(
  rows: Row[],
  itemIds: Set<string>,
): Record<string, ModelTableSchema[]> {
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const itemId = String(row.itemFabricId ?? "");
    const label = String(row.label ?? "");
    if (!itemIds.has(itemId) || !label) {
      throw new Error("snapshot contains schema for an unknown item");
    }
    const key = JSON.stringify([itemId, label]);
    const values = grouped.get(key) ?? [];
    values.push(row);
    grouped.set(key, values);
  }

  const schema: Record<string, ModelTableSchema[]> = {};
  for (const [key, parts] of grouped) {
    const [itemId, label] = JSON.parse(key) as [string, string];
    const rawValues = parts.map((part) => String(part.value ?? ""));
    const serialized = parseChunkedValue(
      rawValues,
      "snapshot contains a malformed schema chunk",
      "snapshot contains an incomplete schema",
    );
    const parsed = JSON.parse(serialized) as {
      rows?: number;
      objectType?: string;
      source?: string;
      description?: string;
      isHidden?: boolean;
      columns?: ModelTableSchema["columns"];
      measures?: ModelTableSchema["measures"];
      metadata?: ModelTableSchema["metadata"];
    };
    const tables = schema[itemId] ?? [];
    tables.push({
      name: label,
      rows: parsed.rows,
      objectType: parsed.objectType,
      source: parsed.source,
      description: parsed.description,
      isHidden: parsed.isHidden,
      columns: Array.isArray(parsed.columns) ? parsed.columns : [],
      measures: Array.isArray(parsed.measures) ? parsed.measures : [],
      metadata: parsed.metadata,
    });
    schema[itemId] = tables;
  }
  return schema;
}

function parseObjectEdgeRows(rows: Row[]): MetadataObjectLineageEdge[] {
  if (rows.length === 0) return [];
  if (
    rows.some(
      (row) =>
        String(row.section) !== "__object_edges__" ||
        String(row.label) !== "workspace",
    )
  ) {
    throw new Error("snapshot contains malformed object lineage chunks");
  }
  const serialized = parseChunkedValue(
    rows.map((row) => String(row.value ?? "")),
    "snapshot contains a malformed object lineage chunk",
    "snapshot contains incomplete object lineage",
  );
  let raw: unknown;
  try {
    raw = JSON.parse(serialized);
  } catch {
    throw new Error("snapshot contains invalid object lineage");
  }
  const parsed = parseObjectLineagePayload(raw);
  if (!parsed) throw new Error("snapshot contains invalid object lineage");
  return parsed.objectEdges;
}

type ReadEntity = (entity: string, filter: Row) => Promise<Row[]>;

interface SnapshotRows {
  itemRows: Row[];
  edgeRows: Row[];
  principalRows: Row[];
  grantRows: Row[];
  jobRows: Row[];
  regularConfigRows: Row[];
  schemaRows: Row[];
  objectEdgeRows: Row[];
  syncRows: Row[];
}

function readerFor(data: Record<string, EntityApi>): ReadEntity {
  return (entity, filter) => {
    const api = data[entity];
    if (!api) throw new Error(`Rayfin entity ${entity} is unavailable`);
    const fields = ENTITY_FIELDS[entity];
    if (!fields) throw new Error(`Rayfin fields for ${entity} are unavailable`);
    return readWithRetry(api, fields, filter);
  };
}

async function readTrustedWorkspaceMarkers(
  read: ReadEntity,
  wid: string,
  snapshotId?: string,
): Promise<Row[]> {
  const groups = await Promise.all(
    trustedWriterEmails().map((writerEmail) =>
      read("Workspace", {
        fabricId: { eq: wid },
        ...(snapshotId ? { snapshotId: { eq: snapshotId } } : {}),
        writerEmail: { eq: writerEmail },
      }),
    ),
  );
  return groups.flat();
}

async function readTrustedSyncRuns(
  read: ReadEntity,
  wid: string,
): Promise<Row[]> {
  const groups = await Promise.all(
    trustedWriterEmails().map((writerEmail) =>
      read("SyncRun", {
        workspace_id: { eq: wid },
        writerEmail: { eq: writerEmail },
      }),
    ),
  );
  return groups
    .flat()
    .filter(
      (row) =>
        rowBelongsToWorkspace(row, wid) && isTrustedWriter(row.writerEmail),
    );
}

function validDateIso(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function nonNegativeInteger(row: Row, field: string): number | undefined {
  const value = Number(row[field]);
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export function snapshotSummaryFromManifest(
  marker: Row,
): SnapshotSummary | undefined {
  if (Number(marker.summaryVersion) !== 1) return undefined;
  const snapshotId = realText(marker.snapshotId);
  const syncedAt = validDateIso(marker.syncedAt);
  if (!snapshotId || !syncedAt) return undefined;

  const values = {
    items: nonNegativeInteger(marker, "itemCount"),
    healthy: nonNegativeInteger(marker, "healthyCount"),
    stale: nonNegativeInteger(marker, "staleCount"),
    failing: nonNegativeInteger(marker, "failingCount"),
    labels: nonNegativeInteger(marker, "labelCount"),
    principals: nonNegativeInteger(marker, "principalCount"),
    externalPrincipals: nonNegativeInteger(
      marker,
      "externalPrincipalCount",
    ),
    grants: nonNegativeInteger(marker, "grantCount"),
    failedJobs: nonNegativeInteger(marker, "failedJobCount"),
    lineage: nonNegativeInteger(marker, "edgeCount"),
    brokenEdges: nonNegativeInteger(marker, "brokenEdgeCount"),
    tables: nonNegativeInteger(marker, "tableCount"),
    columns: nonNegativeInteger(marker, "columnCount"),
    measures: nonNegativeInteger(marker, "measureCount"),
  };
  if (Object.values(values).some((value) => value == null)) return undefined;

  const summary = values as Record<keyof typeof values, number>;
  if (
    summary.healthy + summary.stale + summary.failing > summary.items ||
    summary.labels > summary.items ||
    summary.externalPrincipals > summary.principals ||
    summary.failedJobs >
      (nonNegativeInteger(marker, "jobCount") ?? -1) ||
    summary.brokenEdges > summary.lineage
  ) {
    return undefined;
  }

  return {
    snapshotId,
    syncedAt,
    label: syncedAt.slice(0, 10),
    deploymentId: realText(marker.deploymentId),
    items: summary.items,
    itemCount: summary.items,
    healthy: summary.healthy,
    healthyCount: summary.healthy,
    stale: summary.stale,
    staleCount: summary.stale,
    failing: summary.failing,
    failingCount: summary.failing,
    labels: summary.labels,
    labelCount: summary.labels,
    principals: summary.principals,
    principalCount: summary.principals,
    externalPrincipals: summary.externalPrincipals,
    externalPrincipalCount: summary.externalPrincipals,
    grants: summary.grants,
    grantCount: summary.grants,
    failedJobs: summary.failedJobs,
    failedJobCount: summary.failedJobs,
    lineage: summary.lineage,
    lineageEdges: summary.lineage,
    lineageEdgeCount: summary.lineage,
    brokenEdges: summary.brokenEdges,
    brokenEdgeCount: summary.brokenEdges,
    tables: summary.tables,
    tableCount: summary.tables,
    columns: summary.columns,
    columnCount: summary.columns,
    measures: summary.measures,
    measureCount: summary.measures,
  };
}

function trustedMarkers(rows: Row[], wid: string): Row[] {
  return rows
    .filter(
      (row) =>
        sameText(row.fabricId, wid) &&
        !!textOrFallback(row.snapshotId, "") &&
        isTrustedWriter(row.writerEmail),
    )
    .sort(
      (left, right) =>
        (Date.parse(String(right.syncedAt ?? "")) || 0) -
          (Date.parse(String(left.syncedAt ?? "")) || 0) ||
        String(right.snapshotId).localeCompare(String(left.snapshotId)),
    );
}

function parseSyncSections(
  value: unknown,
): WorkspaceInfo["syncSections"] {
  const serialized = realText(value);
  if (!serialized) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("snapshot contains malformed sync section status");
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("snapshot contains malformed sync section status");
  }
  const sections: NonNullable<WorkspaceInfo["syncSections"]> = {};
  for (const [name, raw] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    if (!raw || Array.isArray(raw) || typeof raw !== "object") {
      throw new Error("snapshot contains malformed sync section status");
    }
    const status = (raw as { status?: unknown }).status;
    if (
      status !== "complete" &&
      status !== "unsupported" &&
      status !== "failed"
    ) {
      throw new Error("snapshot contains malformed sync section status");
    }
    const code = realText((raw as { code?: unknown }).code);
    sections[name] = { status, code };
  }
  return sections;
}

async function readSnapshotRows(
  read: ReadEntity,
  wid: string,
  snapshotId: string,
  includeSyncRuns: boolean,
  writerEmail = ATLAS_CONFIG.syncAdminEmail,
): Promise<SnapshotRows> {
  const filter = {
    workspace_id: { eq: wid },
    snapshotId: { eq: snapshotId },
    writerEmail: { eq: writerEmail },
  };
  const [
    allItemRows,
    allEdgeRows,
    allPrincipalRows,
    allGrantRows,
    allJobRows,
    allConfigRows,
    allSyncRows,
  ] = await Promise.all([
    read("FabricItem", filter),
    read("LineageEdge", filter),
    read("Principal", filter),
    read("AccessGrant", filter),
    read("JobRun", filter),
    read("ConfigEntry", filter),
    includeSyncRuns ? read("SyncRun", filter) : Promise.resolve([]),
  ]);
  const configRows = rowsForSnapshot(
    allConfigRows,
    wid,
    snapshotId,
    writerEmail,
  );
  return {
    itemRows: rowsForSnapshot(allItemRows, wid, snapshotId, writerEmail),
    edgeRows: rowsForSnapshot(allEdgeRows, wid, snapshotId, writerEmail),
    principalRows: rowsForSnapshot(
      allPrincipalRows,
      wid,
      snapshotId,
      writerEmail,
    ),
    grantRows: rowsForSnapshot(allGrantRows, wid, snapshotId, writerEmail),
    jobRows: rowsForSnapshot(allJobRows, wid, snapshotId, writerEmail),
    regularConfigRows: configRows.filter(
      (row) =>
        String(row.section) !== "__schema__" &&
        String(row.section) !== "__object_edges__",
    ),
    schemaRows: configRows.filter(
      (row) => String(row.section) === "__schema__",
    ),
    objectEdgeRows: configRows.filter(
      (row) => String(row.section) === "__object_edges__",
    ),
    syncRows: rowsForSnapshot(allSyncRows, wid, snapshotId, writerEmail),
  };
}

const SNAPSHOT_VERIFY_RETRY_DELAYS_MS = [0, 150, 500];

async function verifyPersistedSnapshot(
  data: Record<string, EntityApi>,
  marker: Row,
  wid: string,
  snapshotId: string,
  writerEmail: string,
): Promise<SnapshotCatalog> {
  const read = readerFor(data);
  let lastError: unknown;
  for (const delay of SNAPSHOT_VERIFY_RETRY_DELAYS_MS) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const rows = await readSnapshotRows(
        read,
        wid,
        snapshotId,
        false,
        writerEmail,
      );
      return catalogFromRows(marker, rows);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function catalogFromRows(
  marker: Row,
  rows: SnapshotRows,
): SnapshotCatalog {
  validateManifest(marker, {
    itemCount: rows.itemRows.length,
    edgeCount: rows.edgeRows.length,
    principalCount: rows.principalRows.length,
    grantCount: rows.grantRows.length,
    jobCount: rows.jobRows.length,
    configCount: rows.regularConfigRows.length,
    schemaEntryCount: rows.schemaRows.length + rows.objectEdgeRows.length,
  });

  const items: Item[] = rows.itemRows.map((row) => {
    const fabricId = realText(row.fabricId);
    const itemType = toItemType(row.itemType);
    if (!fabricId || !itemType) {
      throw new Error("snapshot contains malformed Fabric item metadata");
    }
    return {
      fabricId,
      displayName: realText(row.displayName) ?? fabricId,
      itemType,
      size: realText(row.size),
      description: realText(row.description),
      ownerName: realText(row.ownerName),
      ownerEmail: realText(row.ownerEmail),
      configuredBy: realText(row.configuredBy),
      modifiedBy: realText(row.modifiedBy),
      health: (row.health as Item["health"]) ?? "unknown",
      endorsement: (row.endorsement as Item["endorsement"]) ?? "none",
      endorsementRaw: realText(row.endorsementRaw),
      endorsementBy: realText(row.endorsementBy),
      sensitivity: realText(row.sensitivity),
      sensitivityLabelId: realText(row.sensitivityLabelId),
      tags: row.tags
        ? String(row.tags)
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [],
      tagIds: row.tagIds
        ? String(row.tagIds)
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [],
      ownerMetadataAvailable:
        typeof row.ownerMetadataAvailable === "boolean"
          ? row.ownerMetadataAvailable
          : undefined,
      sensitivityMetadataAvailable:
        typeof row.sensitivityMetadataAvailable === "boolean"
          ? row.sensitivityMetadataAvailable
          : undefined,
      endorsementMetadataAvailable:
        typeof row.endorsementMetadataAvailable === "boolean"
          ? row.endorsementMetadataAvailable
          : undefined,
      tagMetadataAvailable:
        typeof row.tagMetadataAvailable === "boolean"
          ? row.tagMetadataAvailable
          : undefined,
      lastRefresh: validDateIso(row.lastRefresh),
      createdAt: validDateIso(row.itemCreatedAt),
      updatedAt: validDateIso(row.itemUpdatedAt),
    };
  });
  if (new Set(items.map((item) => item.fabricId)).size !== items.length) {
    throw new Error("snapshot contains duplicate Fabric item IDs");
  }

  const itemIds = new Set(items.map((item) => item.fabricId));
  const edges: Edge[] = normalizeLineageEdges(
    items,
    rows.edgeRows.map((row) => ({
      source: String(row.sourceFabricId),
      target: String(row.targetFabricId),
      relation: String(row.relation),
      broken: !!row.broken,
    })),
  );
  const grants: Grant[] = rows.grantRows.map((row) => ({
    itemFabricId: (row.itemFabricId as string) || undefined,
    principalRef: String(row.principalRef),
    accessLevel: row.accessLevel as Grant["accessLevel"],
    source: row.source as Grant["source"],
    roleName: (row.roleName as string) || undefined,
    flag: (row.flag as Grant["flag"]) || undefined,
  }));
  const principals: Principal[] = rows.principalRows.map((row) => {
    const persistedRole = realText(row.workspaceRole);
    const workspaceGrants = grants.filter(
      (grant) =>
        !grant.itemFabricId && grant.source === "workspaceRole",
    );
    const directGrant = workspaceGrants.find((grant) =>
      sameText(grant.principalRef, row.principalId),
    );
    const emailMatches = realText(row.email)
      ? workspaceGrants.filter((grant) =>
          sameText(grant.principalRef, row.email),
        )
      : [];
    const nameMatches = workspaceGrants.filter((grant) =>
      sameText(grant.principalRef, row.displayName),
    );
    const workspaceGrantRole =
      directGrant?.roleName ??
      (emailMatches.length === 1
        ? emailMatches[0].roleName
        : undefined) ??
      (nameMatches.length === 1
        ? nameMatches[0].roleName
        : undefined);
    const workspaceRole = [persistedRole, workspaceGrantRole].find(
      (role): role is Principal["workspaceRole"] =>
        role === "Admin" ||
        role === "Member" ||
        role === "Contributor" ||
        role === "Viewer",
    );
    return {
      principalId: String(row.principalId),
      displayName: String(row.displayName),
      kind: row.kind as Principal["kind"],
      email: (row.email as string) || undefined,
      external:
        typeof row.external === "boolean" ? row.external : undefined,
      workspaceRole: workspaceRole ?? "Viewer",
    };
  });
  const markerTime =
    validDateIso(marker.syncedAt) ?? new Date(0).toISOString();
  const jobs: Job[] = rows.jobRows.map((row) => ({
    itemFabricId: String(row.itemFabricId),
    itemName: String(row.itemName),
    jobType: String(row.jobType),
    status: row.status as Job["status"],
    startedAt: validDateIso(row.startedAt) ?? markerTime,
    durationSec: Number(row.durationSec ?? 0),
    message: (row.message as string) || undefined,
  }));
  const config = rows.regularConfigRows.map((row) => ({
    itemFabricId: String(row.itemFabricId),
    section: String(row.section),
    label: String(row.label),
    value: String(row.value ?? ""),
  }));
  const schema = parseSchemaRows(rows.schemaRows, itemIds);
  const itemMetadata = Object.fromEntries(
    items.flatMap((item) => {
      const metadata = itemMetadataFromSchema(
        item.itemType,
        schema[item.fabricId],
      );
      return metadata ? [[item.fabricId, metadata] as const] : [];
    }),
  );
  const objectEdges = parseObjectEdgeRows(rows.objectEdgeRows);
  const snapshotId = String(marker.snapshotId);
  const syncedAt = validDateIso(marker.syncedAt) ?? markerTime;
  const workspace: WorkspaceInfo = {
    fabricId: textOrFallback(marker.fabricId, WS_FALLBACK.fabricId),
    displayName: textOrFallback(marker.displayName, WS_FALLBACK.displayName),
    capacity: textOrFallback(marker.capacity, WS_FALLBACK.capacity),
    region: textOrFallback(marker.region, WS_FALLBACK.region),
    deploymentId: textOrFallback(marker.deploymentId, "") || undefined,
    snapshotId,
    syncedAt,
    syncSections: parseSyncSections(marker.syncSectionsJson),
  };

  return {
    workspace,
    items,
    edges,
    principals,
    grants,
    jobs,
    config,
    schema,
    itemMetadata,
    objectEdges,
  };
}

const SNAPSHOT_DELETE_BATCH_SIZE = 8;
const MAX_SNAPSHOTS_PRUNED_PER_SYNC = 4;
const MAX_RETENTION_CANDIDATES = 100;
const ORPHAN_ATTEMPT_GRACE_MS = 60 * 60 * 1000;

async function deleteScopedRows(
  data: Record<string, EntityApi>,
  entity: string,
  rows: Row[],
  wid: string,
  snapshotId: string,
  writerEmail: string,
  workspaceMarker = false,
): Promise<void> {
  const api = data[entity];
  if (!api?.delete) {
    throw new Error(`Rayfin entity ${entity} does not support deletion`);
  }
  const scoped = rows.filter((row) => {
    const belongsToTarget = workspaceMarker
      ? sameText(row.fabricId, wid)
      : rowBelongsToWorkspace(row, wid);
    return (
      belongsToTarget &&
      sameText(row.snapshotId, snapshotId) &&
      sameText(row.writerEmail, writerEmail) &&
      !!realText(row.id)
    );
  });
  if (scoped.length !== rows.length) {
    throw new Error(`snapshot retention rejected unscoped ${entity} rows`);
  }

  for (
    let offset = 0;
    offset < scoped.length;
    offset += SNAPSHOT_DELETE_BATCH_SIZE
  ) {
    const results = await Promise.allSettled(
      scoped
        .slice(offset, offset + SNAPSHOT_DELETE_BATCH_SIZE)
        .map((row) => api.delete!({ id: String(row.id) })),
    );
    const failure = results.find(
      (result): result is PromiseRejectedResult =>
        result.status === "rejected",
    );
    if (failure) throw failure.reason;
  }
}

async function deleteSnapshot(
  data: Record<string, EntityApi>,
  marker: Row,
  rows: SnapshotRows,
  wid: string,
  writerEmail: string,
): Promise<void> {
  const snapshotId = String(marker.snapshotId);
  await deleteSnapshotContent(
    data,
    rows,
    wid,
    snapshotId,
    writerEmail,
  );
  await deleteScopedRows(
    data,
    "SyncRun",
    rows.syncRows,
    wid,
    snapshotId,
    writerEmail,
  );
  await deleteScopedRows(
    data,
    "Workspace",
    [marker],
    wid,
    snapshotId,
    writerEmail,
    true,
  );
}

async function deleteSnapshotContent(
  data: Record<string, EntityApi>,
  rows: SnapshotRows,
  wid: string,
  snapshotId: string,
  writerEmail: string,
): Promise<void> {
  const groups: Array<[string, Row[]]> = [
    [
      "ConfigEntry",
      [
        ...rows.regularConfigRows,
        ...rows.schemaRows,
        ...rows.objectEdgeRows,
      ],
    ],
    ["JobRun", rows.jobRows],
    ["AccessGrant", rows.grantRows],
    ["Principal", rows.principalRows],
    ["LineageEdge", rows.edgeRows],
    ["FabricItem", rows.itemRows],
  ];
  for (const [entity, entityRows] of groups) {
    await deleteScopedRows(
      data,
      entity,
      entityRows,
      wid,
      snapshotId,
      writerEmail,
    );
  }
}

async function cleanupOrphanSnapshots(
  data: Record<string, EntityApi>,
  wid: string,
  writerEmail: string,
): Promise<void> {
  const read = readerFor(data);
  const [workspaceRows, syncRows] = await Promise.all([
    readTrustedWorkspaceMarkers(read, wid),
    readTrustedSyncRuns(read, wid),
  ]);
  const published = new Set(
    trustedMarkers(workspaceRows, wid).map((row) => String(row.snapshotId)),
  );
  const now = Date.now();
  const candidates = syncRows
    .map((row) => ({
      row,
      timestamp: Date.parse(
        String(row.finishedAt ?? row.startedAt ?? ""),
      ),
    }))
    .filter(({ row, timestamp }) => {
      const snapshotId = realText(row.snapshotId);
      return (
        !!snapshotId &&
        !published.has(snapshotId) &&
        (row.status === "running" ||
          row.status === "failed" ||
          row.status === "completed") &&
        Number.isFinite(timestamp) &&
        now - timestamp >= ORPHAN_ATTEMPT_GRACE_MS
      );
    })
    .sort((left, right) => left.timestamp - right.timestamp)
    .map(({ row }) => row);
  for (const attempt of candidates.slice(0, MAX_SNAPSHOTS_PRUNED_PER_SYNC)) {
    const snapshotId = String(attempt.snapshotId);
    const attemptWriter = realText(attempt.writerEmail) ?? writerEmail;
    try {
      const rows = await readSnapshotRows(
        read,
        wid,
        snapshotId,
        false,
        attemptWriter,
      );
      await deleteSnapshotContent(
        data,
        rows,
        wid,
        snapshotId,
        attemptWriter,
      );
    } catch (error) {
      console.warn("[atlas] orphan snapshot cleanup deferred", error);
    }
  }
}

async function pruneSnapshots(
  data: Record<string, EntityApi>,
  wid: string,
  currentSnapshotId: string,
  writerEmail: string,
): Promise<void> {
  const read = readerFor(data);
  const workspaceRows = await readTrustedWorkspaceMarkers(read, wid);
  const unique = new Map<string, Row>();
  for (const marker of trustedMarkers(workspaceRows, wid)) {
    const snapshotId = String(marker.snapshotId);
    if (!unique.has(snapshotId)) unique.set(snapshotId, marker);
  }
  const current = unique.get(currentSnapshotId);
  if (!current || !sameText(current.writerEmail, writerEmail)) return;
  const candidates = [
    current,
    ...[...unique.values()].filter(
      (marker) => !sameText(marker.snapshotId, currentSnapshotId),
    ),
  ].slice(0, MAX_RETENTION_CANDIDATES);

  let retained = 0;
  let pruned = 0;
  for (const marker of candidates) {
    const snapshotId = String(marker.snapshotId);
    const markerWriter = realText(marker.writerEmail);
    if (!markerWriter) continue;
    const manifestSummary = snapshotSummaryFromManifest(marker);
    let rows: SnapshotRows | undefined;
    let valid = !!manifestSummary;

    if (!valid || retained >= ATLAS_CONFIG.snapshotRetentionCount) {
      try {
        rows = await readSnapshotRows(
          read,
          wid,
          snapshotId,
          true,
          markerWriter,
        );
        catalogFromRows(marker, rows);
        valid = true;
      } catch (error) {
        console.warn(
          "[atlas] skipped invalid retention candidate",
          snapshotId,
          error,
        );
        if (
          rows &&
          retained >= ATLAS_CONFIG.snapshotRetentionCount &&
          pruned < MAX_SNAPSHOTS_PRUNED_PER_SYNC
        ) {
          await deleteSnapshot(data, marker, rows, wid, markerWriter);
          pruned += 1;
        }
        continue;
      }
    }
    if (!valid) continue;

    if (
      sameText(snapshotId, currentSnapshotId) ||
      retained < ATLAS_CONFIG.snapshotRetentionCount
    ) {
      retained += 1;
      continue;
    }
    if (pruned >= MAX_SNAPSHOTS_PRUNED_PER_SYNC) break;
    if (!rows) {
      rows = await readSnapshotRows(
        read,
        wid,
        snapshotId,
        true,
        markerWriter,
      );
      catalogFromRows(marker, rows);
    }
    await deleteSnapshot(data, marker, rows, wid, markerWriter);
    pruned += 1;
  }
}

function commentsFromRows(rows: Row[], wid: string): Comment[] {
  return rows
    .filter((row) => rowBelongsToWorkspace(row, wid))
    .map((row) => ({
      id: String(row.id),
      itemFabricId: (row.itemFabricId as string) || undefined,
      authorId: String(row.authorId),
      authorName: textOrFallback(row.authorName, String(row.authorEmail)),
      authorEmail: (row.authorEmail as string) || undefined,
      body: String(row.body),
      createdAt: validDateIso(row.createdAt) ?? new Date(0).toISOString(),
    }));
}

export async function loadCommentsFromDb(
  isPreview: boolean,
): Promise<Comment[]> {
  if (isPreview) return [];
  const data = await dataApi();
  const wid = workspaceId();
  const read = readerFor(data);
  const rows = await read("Comment", { workspace_id: { eq: wid } });
  return commentsFromRows(rows, wid);
}

function syncRunsFromRows(rows: Row[], fallbackTime: string): AtlasData["syncRuns"] {
  return rows
    .map((row) => ({
      id: String(row.id),
      correlationId: (row.correlationId as string) || undefined,
      startedAt: validDateIso(row.startedAt) ?? fallbackTime,
      finishedAt: validDateIso(row.finishedAt),
      status:
        (row.status as "running" | "completed" | "failed") ?? "completed",
      itemsSynced:
        row.itemsSynced != null ? Number(row.itemsSynced) : undefined,
      durationMs:
        row.durationMs != null ? Number(row.durationMs) : undefined,
      failureCode: (row.failureCode as string) || undefined,
      failureMessage: (row.failureMessage as string) || undefined,
      triggeredBy: (row.triggeredBy as string) || undefined,
      summary: (row.summary as string) || undefined,
    }))
    .sort(
      (left, right) =>
        Date.parse(right.startedAt) - Date.parse(left.startedAt),
    );
}

/**
 * Read the previously synced catalog back out of the Rayfin entities. Returns
 * `null` in preview or when nothing has been synced yet (so the caller shows
 * the empty state), and never exposes an incomplete snapshot.
 */
export async function loadFromDb(isPreview: boolean): Promise<AtlasData | null> {
  if (isPreview) return null;
  try {
    const data = await dataApi();
    const wid = workspaceId();
    const read = readerFor(data);
    const workspaceRows = await readTrustedWorkspaceMarkers(read, wid);
    let syncRows: Row[] = [];
    try {
      syncRows = await readTrustedSyncRuns(read, wid);
    } catch (error) {
      console.warn("[atlas] sync history unavailable", error);
    }

    for (const marker of trustedMarkers(workspaceRows, wid)) {
      try {
        const snapshotId = String(marker.snapshotId);
        const markerWriter = realText(marker.writerEmail);
        if (!markerWriter) continue;
        const rows = await readSnapshotRows(
          read,
          wid,
          snapshotId,
          false,
          markerWriter,
        );
        const catalog = catalogFromRows(marker, rows);
        return {
          ...catalog,
          comments: [],
          syncRuns: syncRunsFromRows(
            syncRows,
            catalog.workspace.syncedAt ?? new Date(0).toISOString(),
          ),
        };
      } catch (error) {
        console.warn(
          "[atlas] ignored incomplete database snapshot",
          marker.snapshotId,
          error,
        );
      }
    }
    return null;
  } catch (error) {
    console.warn("[atlas] loadFromDb failed", error);
    return null;
  }
}

export async function loadHistoricalSnapshotFromDb(
  isPreview: boolean,
  snapshotId: string,
): Promise<HistoricalSnapshot | undefined> {
  if (isPreview || !snapshotId) return undefined;
  const data = await dataApi();
  const wid = workspaceId();
  const read = readerFor(data);
  const workspaceRows = await readTrustedWorkspaceMarkers(
    read,
    wid,
    snapshotId,
  );
  const marker = trustedMarkers(workspaceRows, wid).find((candidate) =>
    sameText(candidate.snapshotId, snapshotId),
  );
  if (!marker) return undefined;
  const markerWriter = realText(marker.writerEmail);
  if (!markerWriter) return undefined;
  const rows = await readSnapshotRows(
    read,
    wid,
    snapshotId,
    false,
    markerWriter,
  );
  const catalog = catalogFromRows(marker, rows);
  return {
    snapshotId,
    syncedAt: catalog.workspace.syncedAt ?? String(marker.syncedAt ?? ""),
    catalog,
  };
}

/**
 * Build snapshot history from the validated current catalog and older trusted
 * manifests. Invalid older snapshots are skipped without affecting current data.
 */
export async function loadHistoryFromDb(
  isPreview: boolean,
  currentData: AtlasData,
  limit = ATLAS_CONFIG.snapshotRetentionCount,
): Promise<AtlasHistory> {
  const cap = Math.max(0, Math.floor(limit));
  if (cap === 0) return buildAtlasHistory([]);

  const current = snapshotFromData(
    currentData,
    currentData.workspace.snapshotId ?? (isPreview ? "preview-current" : "current"),
    currentData.workspace.syncedAt ??
      currentData.syncRuns[0]?.finishedAt ??
      currentData.syncRuns[0]?.startedAt ??
      "",
  );
  if (isPreview || !currentData.workspace.snapshotId || cap === 1) {
    return buildAtlasHistory([current]);
  }

  const data = await dataApi();
  const wid = workspaceId();
  const read = readerFor(data);
  const workspaceRows = await readTrustedWorkspaceMarkers(read, wid);
  const currentTime = Date.parse(current.syncedAt);
  const snapshots: HistoricalSnapshot[] = [current];
  const summaries: SnapshotSummary[] = [];
  let previousLoaded = false;

  for (const marker of trustedMarkers(workspaceRows, wid)) {
    if (summaries.length >= cap - 1 && previousLoaded) break;
    const snapshotId = String(marker.snapshotId);
    const markerWriter = realText(marker.writerEmail);
    if (!markerWriter) continue;
    if (sameText(snapshotId, current.snapshotId)) continue;
    const markerTime = Date.parse(String(marker.syncedAt ?? ""));
    if (
      Number.isFinite(currentTime) &&
      Number.isFinite(markerTime) &&
      markerTime > currentTime
    ) {
      continue;
    }
    const manifestSummary = snapshotSummaryFromManifest(marker);
    let loaded: HistoricalSnapshot | undefined;
    if (!manifestSummary || !previousLoaded) {
      try {
        const rows = await readSnapshotRows(
          read,
          wid,
          snapshotId,
          false,
          markerWriter,
        );
        const catalog = catalogFromRows(marker, rows);
        loaded = {
          snapshotId,
          syncedAt:
            catalog.workspace.syncedAt ?? String(marker.syncedAt ?? ""),
          catalog,
        };
      } catch (error) {
        console.warn(
          "[atlas] ignored invalid historical snapshot details",
          snapshotId,
          error,
        );
      }
    }
    if (summaries.length < cap - 1) {
      if (manifestSummary) summaries.push(manifestSummary);
      else if (loaded) summaries.push(summarizeSnapshot(loaded));
    }
    if (loaded && !previousLoaded) {
      snapshots.push(loaded);
      previousLoaded = true;
    }
  }

  return buildAtlasHistory(snapshots, summaries);
}
