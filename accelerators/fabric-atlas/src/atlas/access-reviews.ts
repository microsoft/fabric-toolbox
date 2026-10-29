import { getRayfinClient } from "@/lib/rayfin-client";

export type AccessReviewStatus = "reviewed" | "accepted" | "needsAction";
export type AccessReviewEventStatus = AccessReviewStatus | "cleared";
export type AccessReviewHistorySource = "event" | "legacy";

export interface AccessReviewHistoryEntry {
  id: string;
  rowKey: string;
  itemFabricId: string;
  principalRef: string;
  status: AccessReviewEventStatus;
  note?: string;
  evidenceKey?: string;
  eventOrder?: string;
  occurredAt: string;
  source: AccessReviewHistorySource;
}

export interface AccessReviewDecision {
  id: string;
  rowKey: string;
  itemFabricId: string;
  principalRef: string;
  status: AccessReviewStatus;
  note?: string;
  evidenceKey?: string;
  reviewedAt: string;
  updatedAt: string;
  needsReview: boolean;
  source: AccessReviewHistorySource;
}

export interface AccessReviewHistory {
  rowKey: string;
  itemFabricId: string;
  principalRef: string;
  decision?: AccessReviewDecision;
  history: AccessReviewHistoryEntry[];
}

interface LegacyReviewRow {
  id: string;
  workspace_id: string;
  user_id: string;
  recordKey: string;
  rowKey: string;
  itemFabricId: string;
  principalRef: string;
  status: AccessReviewStatus;
  note?: string;
  reviewedAt: string | Date;
  updatedAt: string | Date;
}

interface EventRow {
  id: string;
  workspace_id: string;
  user_id: string;
  rowKey: string;
  itemFabricId: string;
  principalRef: string;
  status: AccessReviewEventStatus;
  evidenceKey: string;
  eventOrder: string;
  note?: string;
  occurredAt: string | Date;
}

const LEGACY_FIELDS = [
  "id",
  "workspace_id",
  "user_id",
  "recordKey",
  "rowKey",
  "itemFabricId",
  "principalRef",
  "status",
  "note",
  "reviewedAt",
  "updatedAt",
] as const;

const EVENT_FIELDS = [
  "id",
  "workspace_id",
  "user_id",
  "rowKey",
  "itemFabricId",
  "principalRef",
  "status",
  "evidenceKey",
  "eventOrder",
  "note",
  "occurredAt",
] as const;

let lastEventTime = 0;

function nextEventDate(): Date {
  lastEventTime = Math.max(Date.now(), lastEventTime + 1);
  return new Date(lastEventTime);
}

function apis() {
  const data = getRayfinClient().data;
  return {
    legacy: data.AccessReview,
    events: data.AccessReviewEvent,
  };
}

function legacyEntry(row: LegacyReviewRow): AccessReviewHistoryEntry {
  return {
    id: String(row.id),
    rowKey: String(row.rowKey),
    itemFabricId: String(row.itemFabricId),
    principalRef: String(row.principalRef),
    status: row.status,
    note: row.note ? String(row.note) : undefined,
    occurredAt: new Date(row.reviewedAt).toISOString(),
    source: "legacy",
  };
}

function eventEntry(row: EventRow): AccessReviewHistoryEntry {
  return {
    id: String(row.id),
    rowKey: String(row.rowKey),
    itemFabricId: String(row.itemFabricId),
    principalRef: String(row.principalRef),
    status: row.status,
    note: row.note ? String(row.note) : undefined,
    evidenceKey: String(row.evidenceKey),
    eventOrder: String(row.eventOrder),
    occurredAt: new Date(row.occurredAt).toISOString(),
    source: "event",
  };
}

function compareHistory(
  left: AccessReviewHistoryEntry,
  right: AccessReviewHistoryEntry,
): number {
  if (left.eventOrder && right.eventOrder) {
    const byEventOrder = right.eventOrder.localeCompare(left.eventOrder);
    if (byEventOrder !== 0) return byEventOrder;
  }
  const byDate =
    new Date(right.occurredAt).getTime() -
    new Date(left.occurredAt).getTime();
  if (byDate !== 0) return byDate;
  if (left.source !== right.source) return left.source === "event" ? -1 : 1;
  return left.id.localeCompare(right.id);
}

function decisionFromEntry(
  entry: AccessReviewHistoryEntry,
  currentEvidence: string | undefined,
): AccessReviewDecision | undefined {
  if (entry.status === "cleared") return undefined;
  return {
    id: entry.id,
    rowKey: entry.rowKey,
    itemFabricId: entry.itemFabricId,
    principalRef: entry.principalRef,
    status: entry.status,
    note: entry.note,
    evidenceKey: entry.evidenceKey,
    reviewedAt: entry.occurredAt,
    updatedAt: entry.occurredAt,
    needsReview:
      !entry.evidenceKey ||
      !currentEvidence ||
      entry.evidenceKey !== currentEvidence,
    source: entry.source,
  };
}

function currentEntry(
  history: AccessReviewHistoryEntry[],
): AccessReviewHistoryEntry | undefined {
  return (
    history.find((entry) => entry.source === "event") ??
    history.find((entry) => entry.source === "legacy")
  );
}

export function buildAccessReviewHistories(
  entries: AccessReviewHistoryEntry[],
  evidenceByRowKey: ReadonlyMap<string, string> = new Map(),
): AccessReviewHistory[] {
  const grouped = new Map<string, AccessReviewHistoryEntry[]>();
  for (const entry of entries) {
    const history = grouped.get(entry.rowKey) ?? [];
    history.push(entry);
    grouped.set(entry.rowKey, history);
  }

  return [...grouped.entries()]
    .map(([rowKey, values]) => {
      const history = [...values].sort(compareHistory);
      const latest = currentEntry(history);
      const identity = latest ?? history[0];
      return {
        rowKey,
        itemFabricId: identity.itemFabricId,
        principalRef: identity.principalRef,
        decision: latest
          ? decisionFromEntry(latest, evidenceByRowKey.get(rowKey))
          : undefined,
        history,
      };
    })
    .sort((left, right) => left.rowKey.localeCompare(right.rowKey));
}

export function revalidateAccessReviewHistories(
  reviews: AccessReviewHistory[],
  evidenceByRowKey: ReadonlyMap<string, string>,
): AccessReviewHistory[] {
  return reviews.map((review) => {
    const latest = currentEntry(review.history);
    return {
      ...review,
      decision: latest
        ? decisionFromEntry(latest, evidenceByRowKey.get(review.rowKey))
        : undefined,
    };
  });
}

export function appendAccessReviewEvent(
  reviews: AccessReviewHistory[],
  event: AccessReviewHistoryEntry,
  evidenceByRowKey: ReadonlyMap<string, string>,
): AccessReviewHistory[] {
  const entries = reviews.flatMap((review) => review.history);
  return buildAccessReviewHistories(
    [event, ...entries],
    evidenceByRowKey,
  );
}

export async function loadAccessReviewHistories(
  isPreview: boolean,
  workspaceId: string,
  userId: string,
  evidenceByRowKey: ReadonlyMap<string, string> = new Map(),
): Promise<AccessReviewHistory[]> {
  if (isPreview) return [];
  const { legacy, events } = apis();
  const scope = {
    workspace_id: { eq: workspaceId },
    user_id: { eq: userId },
  };
  const [eventRows, legacyRows] = await Promise.all([
    events
      .select(EVENT_FIELDS)
      .where(scope)
      .orderBy({ eventOrder: "desc" })
      .execute(),
    legacy
      .select(LEGACY_FIELDS)
      .where(scope)
      .orderBy({ reviewedAt: "desc" })
      .execute(),
  ]);
  return buildAccessReviewHistories(
    [
      ...eventRows.map(eventEntry),
      ...legacyRows.map(legacyEntry),
    ],
    evidenceByRowKey,
  );
}

export async function loadAccessReviews(
  isPreview: boolean,
  workspaceId: string,
  userId: string,
  evidenceByRowKey: ReadonlyMap<string, string> = new Map(),
): Promise<AccessReviewDecision[]> {
  const reviews = await loadAccessReviewHistories(
    isPreview,
    workspaceId,
    userId,
    evidenceByRowKey,
  );
  return reviews.flatMap((review) =>
    review.decision ? [review.decision] : [],
  );
}

async function appendEvent(
  isPreview: boolean,
  workspaceId: string,
  userId: string,
  input: {
    rowKey: string;
    itemFabricId: string;
    principalRef: string;
    status: AccessReviewEventStatus;
    evidenceKey: string;
    note?: string;
  },
): Promise<AccessReviewHistoryEntry> {
  if (!input.evidenceKey) {
    throw new Error("Access review evidence is required.");
  }
  const occurredAt = nextEventDate();
  const eventOrder = `${occurredAt.getTime().toString().padStart(13, "0")}:${crypto.randomUUID()}`;
  const row: EventRow = {
    id: crypto.randomUUID(),
    workspace_id: workspaceId,
    user_id: userId,
    rowKey: input.rowKey,
    itemFabricId: input.itemFabricId,
    principalRef: input.principalRef,
    status: input.status,
    evidenceKey: input.evidenceKey,
    eventOrder,
    note: input.note?.trim() || undefined,
    occurredAt,
  };
  if (isPreview) return eventEntry(row);
  const { events } = apis();
  return eventEntry(
    await events.create({
      workspace_id: workspaceId,
      user_id: userId,
      rowKey: row.rowKey,
      itemFabricId: row.itemFabricId,
      principalRef: row.principalRef,
      status: row.status,
      evidenceKey: row.evidenceKey,
      eventOrder: row.eventOrder,
      note: row.note,
      occurredAt,
    }),
  );
}

export async function saveAccessReview(
  isPreview: boolean,
  workspaceId: string,
  userId: string,
  input: {
    rowKey: string;
    itemFabricId: string;
    principalRef: string;
    status: AccessReviewStatus;
    evidenceKey: string;
    note?: string;
  },
): Promise<AccessReviewHistoryEntry> {
  return appendEvent(isPreview, workspaceId, userId, input);
}

export async function clearAccessReview(
  isPreview: boolean,
  workspaceId: string,
  userId: string,
  input: {
    rowKey: string;
    itemFabricId: string;
    principalRef: string;
    evidenceKey: string;
  },
): Promise<AccessReviewHistoryEntry> {
  return appendEvent(isPreview, workspaceId, userId, {
    ...input,
    status: "cleared",
  });
}
