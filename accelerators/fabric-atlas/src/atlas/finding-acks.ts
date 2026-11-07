import { getRayfinClient } from "@/lib/rayfin-client";

export type FindingAckStatus = "acked" | "muted";

export interface FindingAcknowledgement {
  id: string;
  findingId: string;
  status: FindingAckStatus;
  occurrenceSnapshotId?: string;
  note?: string;
  updatedAt: string;
}

interface AckRow {
  id: string;
  workspace_id: string;
  user_id: string;
  recordKey: string;
  findingId: string;
  status: FindingAckStatus;
  occurrenceSnapshotId?: string;
  note?: string;
  updatedAt: string | Date;
}

interface Query {
  where(filter: Record<string, unknown>): Query;
  orderBy(order: Record<string, "asc" | "desc">): Query;
  execute(): Promise<AckRow[]>;
}

interface Api {
  select(fields: readonly string[]): Query;
  create(value: Record<string, unknown>): Promise<AckRow>;
  update(
    filter: Record<string, unknown>,
    value: Record<string, unknown>,
  ): Promise<unknown>;
  delete(filter: Record<string, unknown>): Promise<unknown>;
}

const FIELDS = [
  "id",
  "workspace_id",
  "user_id",
  "recordKey",
  "findingId",
  "status",
  "occurrenceSnapshotId",
  "note",
  "updatedAt",
] as const;

function api(): Api {
  return (
    getRayfinClient().data as unknown as { FindingAck: Api }
  ).FindingAck;
}

function parse(row: AckRow): FindingAcknowledgement {
  return {
    id: String(row.id),
    findingId: String(row.findingId),
    status: row.status,
    occurrenceSnapshotId: row.occurrenceSnapshotId
      ? String(row.occurrenceSnapshotId)
      : undefined,
    note: row.note ? String(row.note) : undefined,
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function recordKey(
  workspaceId: string,
  userId: string,
  findingId: string,
): Promise<string> {
  return sha256([workspaceId, userId, findingId].join("\u0000"));
}

async function findExisting(key: string): Promise<AckRow | undefined> {
  const rows = await api()
    .select(FIELDS)
    .where({ recordKey: { eq: key } })
    .orderBy({ updatedAt: "desc" })
    .execute();
  return rows[0];
}

export async function loadFindingAcks(
  isPreview: boolean,
  workspaceId: string,
  userId: string,
): Promise<FindingAcknowledgement[]> {
  if (isPreview) return [];
  const rows = await api()
    .select(FIELDS)
    .where({
      workspace_id: { eq: workspaceId },
      user_id: { eq: userId },
    })
    .orderBy({ updatedAt: "desc" })
    .execute();
  return rows.map(parse);
}

export async function saveFindingAck(
  isPreview: boolean,
  workspaceId: string,
  userId: string,
  input: {
    current?: FindingAcknowledgement;
    findingId: string;
    occurrenceSnapshotId?: string;
    status: FindingAckStatus;
    note?: string;
  },
): Promise<FindingAcknowledgement> {
  const now = new Date();
  const key = await recordKey(workspaceId, userId, input.findingId);
  const row: AckRow = {
    id: input.current?.id ?? crypto.randomUUID(),
    workspace_id: workspaceId,
    user_id: userId,
    recordKey: key,
    findingId: input.findingId,
    status: input.status,
    occurrenceSnapshotId: input.occurrenceSnapshotId,
    note: input.note?.trim() || undefined,
    updatedAt: now,
  };
  if (isPreview) return parse(row);
  const existing = input.current ?? (await findExisting(key));
  if (existing) {
    await api().update(
      { id: existing.id },
      {
        status: row.status,
        occurrenceSnapshotId: row.occurrenceSnapshotId,
        note: row.note,
        updatedAt: now,
      },
    );
    return parse({ ...row, id: existing.id });
  }
  try {
    return parse(
      await api().create({
        workspace_id: workspaceId,
        user_id: userId,
        recordKey: key,
        findingId: row.findingId,
        status: row.status,
        occurrenceSnapshotId: row.occurrenceSnapshotId,
        note: row.note,
        updatedAt: now,
      }),
    );
  } catch (error) {
    const concurrent = await findExisting(key);
    if (!concurrent) throw error;
    await api().update(
      { id: concurrent.id },
      {
        status: row.status,
        occurrenceSnapshotId: row.occurrenceSnapshotId,
        note: row.note,
        updatedAt: now,
      },
    );
    return parse({ ...row, id: concurrent.id });
  }
}

export async function deleteFindingAck(
  isPreview: boolean,
  id: string,
): Promise<void> {
  if (isPreview) return;
  await api().delete({ id });
}
