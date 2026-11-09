import { getRayfinClient } from "@/lib/rayfin-client";
import {
  POSTURE_PILLARS,
  POSTURE_TARGETS,
  type PosturePillar,
} from "./posture";

export type GovernanceTargets = Record<PosturePillar, number>;

export interface GovernancePolicyRecord {
  id?: string;
  targets: GovernanceTargets;
  source: "default" | "persisted";
  updatedAt?: string;
  updatedByName?: string;
  updatedByEmail?: string;
}

interface GovernancePolicyRow {
  id: string;
  workspace_id: string;
  recordKey: string;
  writerEmail: string;
  documentationTarget: number;
  ownershipTarget: number;
  sensitivityTarget: number;
  accessTarget: number;
  lineageTarget: number;
  operationsTarget: number;
  updatedById: string;
  updatedByName: string;
  updatedByEmail: string;
  updatedAt: string | Date;
}

const FIELDS = [
  "id",
  "workspace_id",
  "recordKey",
  "writerEmail",
  "documentationTarget",
  "ownershipTarget",
  "sensitivityTarget",
  "accessTarget",
  "lineageTarget",
  "operationsTarget",
  "updatedById",
  "updatedByName",
  "updatedByEmail",
  "updatedAt",
] as const;

function api() {
  return getRayfinClient().data.GovernancePolicy;
}

function defaultRecord(): GovernancePolicyRecord {
  return {
    targets: { ...POSTURE_TARGETS },
    source: "default",
  };
}

function targetField(pillar: PosturePillar): keyof GovernancePolicyRow {
  return `${pillar}Target` as keyof GovernancePolicyRow;
}

export function validateGovernanceTargets(
  values: Record<PosturePillar, number>,
): GovernanceTargets {
  const targets = {} as GovernanceTargets;
  for (const pillar of POSTURE_PILLARS) {
    const value = values[pillar];
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      throw new Error(
        `${pillar} governance target must be a whole number from 0 to 100.`,
      );
    }
    targets[pillar] = value;
  }
  return targets;
}

function parse(row: GovernancePolicyRow): GovernancePolicyRecord {
  const values = Object.fromEntries(
    POSTURE_PILLARS.map((pillar) => [
      pillar,
      Number(row[targetField(pillar)]),
    ]),
  ) as GovernanceTargets;
  return {
    id: String(row.id),
    targets: validateGovernanceTargets(values),
    source: "persisted",
    updatedAt: new Date(row.updatedAt).toISOString(),
    updatedByName: String(row.updatedByName),
    updatedByEmail: String(row.updatedByEmail),
  };
}

async function findExisting(
  workspaceId: string,
): Promise<GovernancePolicyRow | undefined> {
  const rows = await api()
    .select(FIELDS)
    .where({ workspace_id: { eq: workspaceId } })
    .orderBy({ updatedAt: "desc" })
    .execute();
  if (rows.length > 1) {
    throw new Error(
      "Multiple governance policy rows exist for this workspace.",
    );
  }
  return rows[0];
}

export async function loadGovernancePolicy(
  isPreview: boolean,
  workspaceId: string,
): Promise<GovernancePolicyRecord> {
  if (isPreview) return defaultRecord();
  const row = await findExisting(workspaceId);
  return row ? parse(row) : defaultRecord();
}

export async function saveGovernancePolicy(
  isPreview: boolean,
  workspaceId: string,
  author: { id: string; name: string; email?: string },
  targets: GovernanceTargets,
  current?: GovernancePolicyRecord,
): Promise<GovernancePolicyRecord> {
  const validated = validateGovernanceTargets(targets);
  const authorEmail =
    author.email?.trim().toLowerCase() ||
    (isPreview ? "preview@local.invalid" : "");
  if (!authorEmail) {
    throw new Error("An authenticated email is required to save governance targets.");
  }
  const authorName = author.name.trim() || authorEmail;
  const now = new Date();
  const values = {
    documentationTarget: validated.documentation,
    ownershipTarget: validated.ownership,
    sensitivityTarget: validated.sensitivity,
    accessTarget: validated.access,
    lineageTarget: validated.lineage,
    operationsTarget: validated.operations,
    updatedById: author.id,
    updatedByName: authorName,
    updatedByEmail: authorEmail,
    updatedAt: now,
  };
  if (isPreview) {
    return parse({
      id: current?.id ?? crypto.randomUUID(),
      workspace_id: workspaceId,
      recordKey: workspaceId,
      writerEmail: authorEmail,
      ...values,
    });
  }
  const existing = current?.id ? current : await findExisting(workspaceId);
  if (existing?.id) {
    await api().update({ id: existing.id }, values);
    return parse({
      id: existing.id,
      workspace_id: workspaceId,
      recordKey: workspaceId,
      writerEmail: authorEmail,
      ...values,
    });
  }
  try {
    return parse(
      await api().create({
        id: crypto.randomUUID(),
        workspace_id: workspaceId,
        recordKey: workspaceId,
        writerEmail: authorEmail,
        ...values,
      }),
    );
  } catch (error) {
    const concurrent = await findExisting(workspaceId);
    if (!concurrent) throw error;
    await api().update({ id: concurrent.id }, values);
    return parse({ ...concurrent, ...values });
  }
}

export async function deleteGovernancePolicy(
  isPreview: boolean,
  id: string | undefined,
): Promise<void> {
  if (isPreview || !id) return;
  await api().delete({ id });
}
