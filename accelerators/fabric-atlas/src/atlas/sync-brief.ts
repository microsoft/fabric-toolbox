import { buildGovernanceFindings, type GovernanceFinding } from "./governance";
import {
  compareSnapshots,
  snapshotDataForInspection,
  tenantSettingsComparable,
  type AtlasChange,
  type HistoricalSnapshot,
} from "./history";
import { createLineageIndex, getLineageImpact } from "./lineage";
import type { AccessLevel } from "./model";

/**
 * Sync Brief: a short, client-side digest of what changed between the two
 * latest validated snapshots. Built only from persisted snapshots; no new
 * entity or collector is involved.
 */

export type SyncBriefSectionId =
  | "items"
  | "access"
  | "lineage"
  | "jobs"
  | "schema"
  | "findings"
  | "impact";

export type SyncBriefLink =
  | { kind: "item"; itemId: string }
  | { kind: "access"; principalId?: string; itemId?: string }
  | { kind: "job"; itemId: string; query: string }
  | { kind: "lineage"; itemId?: string }
  | {
      kind: "object";
      itemId: string;
      objectName?: string;
      objectId?: string;
      tableName?: string;
      objectKind?: AtlasChange["objectType"];
    }
  | { kind: "finding"; finding: GovernanceFinding };

export interface SyncBriefEntry {
  id: string;
  title: string;
  detail: string;
  link?: SyncBriefLink;
}

export interface SyncBriefSection {
  id: SyncBriefSectionId;
  title: string;
  /** Unavailable means the snapshots lack the metadata, never "zero changes". */
  status: "available" | "unavailable";
  reason?: string;
  entries: SyncBriefEntry[];
}

export interface SyncBrief {
  state: "no-snapshot" | "first-snapshot" | "no-changes" | "changes";
  currentSnapshotId?: string;
  previousSnapshotId?: string;
  currentSyncedAt?: string;
  previousSyncedAt?: string;
  sections: SyncBriefSection[];
  totalEntries: number;
  /** Findings present in both snapshots; reported as context, not as new. */
  preExistingHighFindings: number;
  tenantSettings: "comparable" | "unavailable";
}

const ACCESS_RANK: Record<AccessLevel, number> = {
  none: 0,
  view: 1,
  edit: 2,
  owner: 3,
};

const ELEVATED_FLAGS = new Set(["external", "admin", "broad"]);
const IMPACT_LIMIT = 5;

const SECTION_TITLES: Record<SyncBriefSectionId, string> = {
  items: "Items added or removed",
  access: "New external or elevated access",
  lineage: "Lineage edges added or removed",
  jobs: "Jobs failed or recovered",
  schema: "Measures and schema objects changed",
  findings: "New high-priority findings",
  impact: "Largest downstream impact",
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function accessRank(value: unknown): number {
  return typeof value === "string" && value in ACCESS_RANK
    ? ACCESS_RANK[value as AccessLevel]
    : 0;
}

function isElevatedAccess(change: AtlasChange): boolean {
  if (change.type !== "access-grant-added" && change.type !== "access-grant-changed") {
    return false;
  }
  const after = record(change.after);
  const before = record(change.before);
  const flag = typeof after?.flag === "string" ? after.flag : undefined;
  const flagIsNew = flag && ELEVATED_FLAGS.has(flag) && before?.flag !== flag;
  if (change.type === "access-grant-added") {
    return Boolean(flag && ELEVATED_FLAGS.has(flag)) || accessRank(after?.accessLevel) >= ACCESS_RANK.edit;
  }
  return Boolean(flagIsNew) || accessRank(after?.accessLevel) > accessRank(before?.accessLevel);
}

const SCHEMA_ITEM_TYPES = new Set([
  "Lakehouse",
  "Warehouse",
  "SQLEndpoint",
  "SemanticModel",
  "KQLDatabase",
  "Datamart",
]);

/** Snapshots always persist a schema map; an empty one with tabular items means not collected. */
function hasSchema(snapshot: HistoricalSnapshot): boolean {
  const schema = snapshot.catalog.schema ?? {};
  if (Object.values(schema).some((tables) => tables.length > 0)) return true;
  return !snapshot.catalog.items.some((item) => SCHEMA_ITEM_TYPES.has(item.itemType));
}

function hasJobs(snapshot: HistoricalSnapshot): boolean {
  return snapshot.catalog.jobs.length > 0;
}

function section(
  id: SyncBriefSectionId,
  entries: SyncBriefEntry[],
  unavailableReason?: string,
): SyncBriefSection {
  return unavailableReason
    ? { id, title: SECTION_TITLES[id], status: "unavailable", reason: unavailableReason, entries: [] }
    : { id, title: SECTION_TITLES[id], status: "available", entries };
}

function highFindings(snapshot: HistoricalSnapshot): GovernanceFinding[] {
  return buildGovernanceFindings(snapshotDataForInspection(snapshot)).filter(
    (finding) => finding.severity === "critical" || finding.severity === "high",
  );
}

function edgeEnds(change: AtlasChange): { source?: string; target?: string } {
  const edge = record(change.after) ?? record(change.before);
  return {
    source: typeof edge?.source === "string" ? edge.source : undefined,
    target: typeof edge?.target === "string" ? edge.target : undefined,
  };
}

export function buildSyncBrief(
  previous: HistoricalSnapshot | undefined,
  current: HistoricalSnapshot | undefined,
): SyncBrief {
  const empty = {
    sections: [],
    totalEntries: 0,
    preExistingHighFindings: 0,
    tenantSettings: "unavailable" as const,
  };
  if (!current) return { state: "no-snapshot", ...empty };
  if (!previous || previous.snapshotId === current.snapshotId) {
    return {
      state: "first-snapshot",
      currentSnapshotId: current.snapshotId,
      currentSyncedAt: current.syncedAt,
      ...empty,
    };
  }

  const changes = compareSnapshots(previous, current);
  const itemName = new Map<string, string>();
  for (const item of [...previous.catalog.items, ...current.catalog.items]) {
    itemName.set(item.fabricId, item.displayName);
  }
  const nameOf = (id?: string) => (id ? itemName.get(id) ?? id : "Workspace");

  const items = changes
    .filter((change) => change.type === "item-added" || change.type === "item-removed")
    .map<SyncBriefEntry>((change) => ({
      id: change.id,
      title: change.label,
      detail: change.type === "item-added" ? "Added" : "Removed",
      link:
        change.type === "item-added" && change.itemFabricId
          ? { kind: "item", itemId: change.itemFabricId }
          : undefined,
    }));

  const access = changes.filter(isElevatedAccess).map<SyncBriefEntry>((change) => {
    const after = record(change.after);
    const before = record(change.before);
    const level = String(after?.accessLevel ?? "unknown");
    const flag = typeof after?.flag === "string" ? ` · ${after.flag}` : "";
    const from = before ? ` (was ${String(before.accessLevel ?? "unknown")})` : "";
    return {
      id: change.id,
      title: change.label,
      detail: `${level}${flag} on ${nameOf(change.itemFabricId)}${from}`,
      link: { kind: "access", principalId: change.label, itemId: change.itemFabricId },
    };
  });

  const lineage = changes
    .filter((change) => change.type === "lineage-added" || change.type === "lineage-removed")
    .map<SyncBriefEntry>((change) => {
      const { source, target } = edgeEnds(change);
      return {
        id: change.id,
        title: `${nameOf(source)} → ${nameOf(target)}`,
        detail: change.type === "lineage-added" ? "Edge added" : "Edge removed",
        link: { kind: "lineage", itemId: target ?? source },
      };
    });

  const jobs = changes
    .filter(
      (change) =>
        change.type === "job-status-changed" &&
        (change.after === "failed" ||
          (change.before === "failed" && change.after === "completed")),
    )
    .map<SyncBriefEntry>((change) => ({
      id: change.id,
      title: change.label,
      detail: change.after === "failed" ? "Failed" : "Recovered",
      link: change.itemFabricId
        ? { kind: "job", itemId: change.itemFabricId, query: change.label }
        : undefined,
    }));

  const schema = changes
    .filter((change) => change.domain === "schema")
    .map<SyncBriefEntry>((change) => ({
      id: change.id,
      title: change.label,
      detail: `${change.objectType ?? "object"} ${
        change.type === "schema-object-added"
          ? "added"
          : change.type === "schema-object-removed"
            ? "removed"
            : `changed (${(change.changedFields ?? []).join(", ") || "details"})`
      } in ${nameOf(change.itemFabricId)}`,
      link:
        change.itemFabricId && change.type !== "schema-object-removed"
          ? {
              kind: "object",
              itemId: change.itemFabricId,
              objectName: change.objectName,
              objectId: change.objectId,
              tableName: change.tableName,
              objectKind: change.objectType,
            }
          : change.itemFabricId
            ? { kind: "item", itemId: change.itemFabricId }
            : undefined,
    }));

  const previousFindingIds = new Set(highFindings(previous).map((finding) => finding.id));
  const currentFindings = highFindings(current);
  const newFindings = currentFindings.filter((finding) => !previousFindingIds.has(finding.id));
  const preExistingHighFindings = currentFindings.length - newFindings.length;
  const findings = newFindings.map<SyncBriefEntry>((finding) => ({
    id: `finding:${finding.id}`,
    title: finding.title,
    detail: `${finding.severity} · ${finding.detail}`,
    link: { kind: "finding", finding },
  }));

  const currentItemIds = new Set(current.catalog.items.map((item) => item.fabricId));
  const changedItemIds = new Set(
    changes
      .map((change) => change.itemFabricId)
      .filter((id): id is string => !!id && currentItemIds.has(id)),
  );
  for (const change of changes) {
    if (change.domain !== "lineage") continue;
    const { source, target } = edgeEnds(change);
    for (const id of [source, target]) if (id && currentItemIds.has(id)) changedItemIds.add(id);
  }
  const index = createLineageIndex(current.catalog.edges);
  const impact = [...changedItemIds]
    .map((id) => ({ id, downstream: getLineageImpact(index, id).downstream.ids.size }))
    .filter((entry) => entry.downstream > 0)
    .sort((left, right) => right.downstream - left.downstream || nameOf(left.id).localeCompare(nameOf(right.id)))
    .slice(0, IMPACT_LIMIT)
    .map<SyncBriefEntry>((entry) => ({
      id: `impact:${entry.id}`,
      title: nameOf(entry.id),
      detail: `${entry.downstream} downstream item${entry.downstream === 1 ? "" : "s"}`,
      link: { kind: "lineage", itemId: entry.id },
    }));

  const schemaUnavailable =
    !hasSchema(previous) || !hasSchema(current)
      ? "Schema metadata was not collected in both snapshots."
      : undefined;
  const jobsUnavailable =
    !hasJobs(previous) || !hasJobs(current)
      ? "Job history was not collected in both snapshots."
      : undefined;
  const sections = [
    section("items", items),
    section("access", access),
    section("lineage", lineage),
    section("jobs", jobs, jobsUnavailable),
    section("schema", schema, schemaUnavailable),
    section("findings", findings),
    section("impact", impact),
  ];
  const totalEntries = sections.reduce(
    (sum, entry) => sum + (entry.id === "impact" ? 0 : entry.entries.length),
    0,
  );

  return {
    state: totalEntries === 0 ? "no-changes" : "changes",
    currentSnapshotId: current.snapshotId,
    previousSnapshotId: previous.snapshotId,
    currentSyncedAt: current.syncedAt,
    previousSyncedAt: previous.syncedAt,
    sections,
    totalEntries,
    preExistingHighFindings,
    tenantSettings: tenantSettingsComparable(previous, current) ? "comparable" : "unavailable",
  };
}

export function syncBriefMarkdown(brief: SyncBrief, workspaceName?: string): string {
  const lines = [`# Sync Brief${workspaceName ? ` — ${workspaceName}` : ""}`, ""];
  if (brief.state === "no-snapshot") {
    lines.push("No validated snapshot is available yet.");
    return `${lines.join("\n")}\n`;
  }
  if (brief.state === "first-snapshot") {
    lines.push(
      `Baseline: first validated snapshot (${brief.currentSyncedAt}). The next sync will produce a brief.`,
    );
    return `${lines.join("\n")}\n`;
  }
  lines.push(`- Baseline: ${brief.previousSyncedAt} (${brief.previousSnapshotId})`);
  lines.push(`- Current: ${brief.currentSyncedAt} (${brief.currentSnapshotId})`);
  lines.push(`- Tenant settings drift: ${brief.tenantSettings}`);
  lines.push(`- Pre-existing high-priority findings: ${brief.preExistingHighFindings}`);
  lines.push("");
  if (brief.state === "no-changes") {
    lines.push("No monitored changes.", "");
  }
  for (const entry of brief.sections) {
    lines.push(`## ${entry.title}`, "");
    if (entry.status === "unavailable") {
      lines.push(`Unavailable — ${entry.reason}`, "");
      continue;
    }
    if (!entry.entries.length) {
      lines.push("None.", "");
      continue;
    }
    for (const item of entry.entries) lines.push(`- **${item.title}** — ${item.detail}`);
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
