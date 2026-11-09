import { getRayfinClient } from "@/lib/rayfin-client";

export type GovernanceExceptionStatus = "active" | "expired" | "invalid";

export interface GovernanceException {
  id: string;
  findingId: string;
  reason: string;
  expiresAt: string;
  authorId: string;
  authorName: string;
  authorEmail: string;
  createdAt: string;
  updatedAt: string;
}

interface GovernanceExceptionRow
  extends Omit<
    GovernanceException,
    "expiresAt" | "createdAt" | "updatedAt"
  > {
  workspace_id: string;
  recordKey: string;
  writerEmail: string;
  expiresAt: string | Date;
  createdAt: string | Date;
  updatedAt: string | Date;
}

const FIELDS = [
  "id",
  "workspace_id",
  "recordKey",
  "writerEmail",
  "findingId",
  "reason",
  "expiresAt",
  "authorId",
  "authorName",
  "authorEmail",
  "createdAt",
  "updatedAt",
] as const;

function api() {
  return getRayfinClient().data.GovernanceException;
}

function normalizedSubject(value: string): string {
  const subject = value.trim();
  if (!subject || subject.length > 700) {
    throw new Error("A valid governance finding identity is required.");
  }
  return subject;
}

function normalizedReason(value: string): string {
  const reason = value.trim();
  if (!reason || reason.length > 2000) {
    throw new Error("An exception reason between 1 and 2000 characters is required.");
  }
  return reason;
}

function expiryIso(value: string | Date, requireFuture: boolean): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf())) {
    throw new Error("A valid governance exception expiry is required.");
  }
  if (requireFuture && parsed.valueOf() <= Date.now()) {
    throw new Error("Governance exception expiry must be in the future.");
  }
  return parsed.toISOString();
}

function parse(row: GovernanceExceptionRow): GovernanceException {
  return {
    id: String(row.id),
    findingId: String(row.findingId),
    reason: String(row.reason),
    expiresAt: expiryIso(row.expiresAt, false),
    authorId: String(row.authorId),
    authorName: String(row.authorName),
    authorEmail: String(row.authorEmail),
    createdAt: new Date(row.createdAt).toISOString(),
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
  findingId: string,
): Promise<string> {
  return sha256([workspaceId, findingId].join("\u0000"));
}

async function findExisting(key: string): Promise<GovernanceExceptionRow | undefined> {
  const rows = await api()
    .select(FIELDS)
    .where({ recordKey: { eq: key } })
    .orderBy({ updatedAt: "desc" })
    .execute();
  return rows[0];
}

export function governanceExceptionStatus(
  exception: Pick<GovernanceException, "findingId" | "expiresAt">,
  now = Date.now(),
): GovernanceExceptionStatus {
  if (!exception.findingId.trim() || exception.findingId.length > 700) {
    return "invalid";
  }
  const expiresAt = Date.parse(exception.expiresAt);
  if (!Number.isFinite(expiresAt)) return "invalid";
  return expiresAt > now ? "active" : "expired";
}

export function activeExceptionForFinding(
  exceptions: readonly GovernanceException[],
  findingId: string,
  now = Date.now(),
): GovernanceException | undefined {
  return exceptions.find(
    (exception) =>
      exception.findingId === findingId &&
      governanceExceptionStatus(exception, now) === "active",
  );
}

export async function loadGovernanceExceptions(
  isPreview: boolean,
  workspaceId: string,
): Promise<GovernanceException[]> {
  if (isPreview) return [];
  const rows = await api()
    .select(FIELDS)
    .where({ workspace_id: { eq: workspaceId } })
    .orderBy({ expiresAt: "asc" })
    .execute();
  return rows.map(parse);
}

export async function saveGovernanceException(
  isPreview: boolean,
  workspaceId: string,
  author: { id: string; name: string; email?: string },
  input: {
    current?: GovernanceException;
    findingId: string;
    reason: string;
    expiresAt: string;
  },
): Promise<GovernanceException> {
  const findingId = normalizedSubject(input.findingId);
  const reason = normalizedReason(input.reason);
  const expiresAt = expiryIso(input.expiresAt, true);
  const authorEmail =
    author.email?.trim().toLowerCase() ||
    (isPreview ? "preview@local.invalid" : "");
  if (!authorEmail) {
    throw new Error("An authenticated email is required to save an exception.");
  }
  const key = await recordKey(workspaceId, findingId);
  const now = new Date();
  const values = {
    reason,
    expiresAt: new Date(expiresAt),
    authorId: author.id,
    authorName: author.name.trim() || authorEmail,
    authorEmail,
    updatedAt: now,
  };
  if (isPreview) {
    return parse({
      id: input.current?.id ?? crypto.randomUUID(),
      workspace_id: workspaceId,
      recordKey: key,
      writerEmail: authorEmail,
      findingId,
      createdAt: input.current?.createdAt ?? now,
      ...values,
    });
  }
  const existing = input.current ?? (await findExisting(key));
  if (existing) {
    await api().update({ id: existing.id }, values);
    return {
      id: existing.id,
      findingId,
      reason,
      expiresAt,
      authorId: values.authorId,
      authorName: values.authorName,
      authorEmail,
      createdAt: new Date(existing.createdAt).toISOString(),
      updatedAt: now.toISOString(),
    };
  }
  try {
    return parse(
      await api().create({
        id: crypto.randomUUID(),
        workspace_id: workspaceId,
        recordKey: key,
        writerEmail: authorEmail,
        findingId,
        createdAt: now,
        ...values,
      }),
    );
  } catch (error) {
    const concurrent = await findExisting(key);
    if (!concurrent) throw error;
    await api().update({ id: concurrent.id }, values);
    return parse({ ...concurrent, ...values, findingId });
  }
}

export async function deleteGovernanceException(
  isPreview: boolean,
  id: string,
): Promise<void> {
  if (isPreview) return;
  await api().delete({ id });
}
