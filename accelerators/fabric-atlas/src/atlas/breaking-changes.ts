import {
  compareSnapshots,
  type AtlasChange,
  type HistoricalSnapshot,
} from "./history";
import { markdownCodeBlock, markdownText } from "./markdown";
import {
  createLineageIndex,
  getLineageImpact,
  normalizeLineageEdges,
  type SchemaObjectRef,
} from "./lineage";
import type { Edge, Item } from "./model";
import {
  buildSchemaDependencies,
  createSchemaLineageIndex,
  schemaObjectKey,
} from "./schema-lineage";

// Deterministic Breaking Change Guard. Candidates come only from the snapshot
// comparison; downstream impact is read from the older snapshot, where the
// removed or changed evidence still existed.

export type BreakingChangeKind =
  | "item-removed"
  | "table-removed"
  | "column-removed"
  | "measure-removed"
  | "column-type-changed"
  | "measure-expression-changed"
  | "lineage-removed"
  | "lineage-reversed"
  | "lineage-broken"
  | "owner-removed"
  | "owner-access-removed";

export type BreakingChangeDomain = "item" | "schema" | "lineage" | "access";
export type BreakingChangeSeverity = "high" | "medium" | "low";

export const BREAKING_CHANGE_LABEL: Record<BreakingChangeKind, string> = {
  "item-removed": "Item removed",
  "table-removed": "Table removed",
  "column-removed": "Column removed",
  "measure-removed": "Measure removed",
  "column-type-changed": "Column data type changed",
  "measure-expression-changed": "Measure expression changed",
  "lineage-removed": "Lineage relationship removed",
  "lineage-reversed": "Lineage direction reversed",
  "lineage-broken": "Lineage relationship marked broken",
  "owner-removed": "Documented owner removed",
  "owner-access-removed": "Owner permission removed",
};

/** Base score per kind; removals and reversals outrank in-place changes. */
const BASE_SCORE: Record<BreakingChangeKind, number> = {
  "item-removed": 2,
  "table-removed": 2,
  "column-removed": 2,
  "measure-removed": 2,
  "lineage-reversed": 2,
  "column-type-changed": 1,
  "measure-expression-changed": 1,
  "lineage-removed": 1,
  "lineage-broken": 1,
  "owner-removed": 1,
  "owner-access-removed": 1,
};

const SCHEMA_TABLE_KINDS = new Set(["table", "view", "sqlTable", "sqlView", "kqlTable"]);
const SCHEMA_COLUMN_KINDS = new Set(["column", "sqlColumn", "kqlColumn"]);

export interface BreakingChangeItem {
  id: string;
  name: string;
  type?: string;
  ownerName?: string;
  ownerEmail?: string;
}

export interface BreakingChangeCandidate {
  id: string;
  kind: BreakingChangeKind;
  domain: BreakingChangeDomain;
  severity: BreakingChangeSeverity;
  score: number;
  title: string;
  item: BreakingChangeItem;
  object?: { kind: string; table?: string; name: string };
  before?: unknown;
  after?: unknown;
  changeIds: string[];
  /** Text that finds the exact change in the Change Center search. */
  changeSearch: string;
  downstream: Array<BreakingChangeItem & { distance: number }>;
  dependentObjects: Array<{
    itemId: string;
    itemName: string;
    kind: string;
    table?: string;
    name: string;
    confidence: "verified" | "inferred";
  }>;
  recentJobs: Array<{ jobType: string; status: string; startedAt?: string }>;
}

export interface BreakingChangeAnalysis {
  fromSnapshotId: string;
  toSnapshotId: string;
  candidates: BreakingChangeCandidate[];
}

function itemSummary(item: Item | undefined, id: string): BreakingChangeItem {
  return {
    id,
    name: item?.displayName ?? id,
    type: item?.itemType,
    ownerName: item?.ownerName,
    ownerEmail: item?.ownerEmail,
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isEdge(value: unknown): value is Edge {
  const candidate = record(value);
  return typeof candidate.source === "string" && typeof candidate.target === "string";
}

export function severityFor(score: number): BreakingChangeSeverity {
  return score >= 3 ? "high" : score === 2 ? "medium" : "low";
}

/**
 * Classifies breaking-change candidates between two snapshots, ordered from
 * older (`from`) to newer (`to`). Rules are documented in
 * docs/lineage-depth.md and use only synchronized evidence.
 */
export function analyzeBreakingChanges(
  from: HistoricalSnapshot,
  to: HistoricalSnapshot,
  changes: readonly AtlasChange[] = compareSnapshots(from, to),
): BreakingChangeAnalysis {
  const beforeItems = new Map(from.catalog.items.map((item) => [item.fabricId, item]));
  const afterItems = new Map(to.catalog.items.map((item) => [item.fabricId, item]));
  const historicalEdges = normalizeLineageEdges(from.catalog.items, from.catalog.edges);
  const lineage = createLineageIndex(historicalEdges);
  const schemaIndex = createSchemaLineageIndex(buildSchemaDependencies(from.catalog));
  const candidates: BreakingChangeCandidate[] = [];

  const downstreamOf = (itemId: string, includeSelf = false) => {
    const impact = getLineageImpact(lineage, itemId);
    const entries = [...impact.downstream.ids].map((id) => ({
      ...itemSummary(beforeItems.get(id), id),
      distance: impact.downstream.distance.get(id) ?? 0,
    }));
    if (includeSelf) {
      entries.push({ ...itemSummary(beforeItems.get(itemId), itemId), distance: 0 });
    }
    return entries.sort(
      (left, right) => left.distance - right.distance || left.name.localeCompare(right.name),
    );
  };

  const dependentsOf = (reference: SchemaObjectRef, wholeTable = false) => {
    const results: BreakingChangeCandidate["dependentObjects"] = [];
    for (const [key, dependencies] of schemaIndex.consumersByTo) {
      for (const dependency of dependencies) {
        const target = dependency.to;
        const matches = wholeTable
          ? target.itemId === reference.itemId &&
            text(target.tableName).toLowerCase() === text(reference.tableName).toLowerCase()
          : key === schemaObjectKey(reference);
        if (!matches) continue;
        results.push({
          itemId: dependency.from.itemId,
          itemName: beforeItems.get(dependency.from.itemId)?.displayName ?? dependency.from.itemId,
          kind: dependency.from.kind,
          table: dependency.from.tableName,
          name: dependency.from.name,
          confidence: dependency.confidence,
        });
      }
    }
    return results.sort((left, right) =>
      `${left.table}.${left.name}`.localeCompare(`${right.table}.${right.name}`),
    );
  };

  const jobsFor = (itemId: string) =>
    [...(afterItems.has(itemId) ? to : from).catalog.jobs]
      .filter((job) => job.itemFabricId === itemId)
      .sort((left, right) => Date.parse(right.startedAt ?? "") - Date.parse(left.startedAt ?? ""))
      .slice(0, 3)
      .map((job) => ({ jobType: job.jobType, status: job.status, startedAt: job.startedAt }));

  const push = (
    kind: BreakingChangeKind,
    change: AtlasChange,
    details: Pick<BreakingChangeCandidate, "item" | "downstream" | "dependentObjects"> &
      Partial<Pick<BreakingChangeCandidate, "object" | "before" | "after" | "changeIds" | "title">>,
  ) => {
    const maxDistance = Math.max(0, ...details.downstream.map((entry) => entry.distance));
    const impacted =
      details.downstream.some((entry) => entry.distance > 0) ||
      details.dependentObjects.length > 0;
    const score = BASE_SCORE[kind] + (impacted ? 1 : 0) + (maxDistance >= 2 ? 1 : 0);
    candidates.push({
      id: `${kind}:${change.id}`,
      kind,
      domain:
        kind === "item-removed"
          ? "item"
          : kind.startsWith("lineage")
            ? "lineage"
            : kind.startsWith("owner")
              ? "access"
              : "schema",
      severity: severityFor(score),
      score,
      title: details.title ?? `${BREAKING_CHANGE_LABEL[kind]}: ${change.label}`,
      item: details.item,
      object: details.object,
      before: details.before ?? change.before,
      after: details.after ?? change.after,
      changeIds: details.changeIds ?? [change.id],
      changeSearch: change.label,
      downstream: details.downstream,
      dependentObjects: details.dependentObjects,
      recentJobs: jobsFor(details.item.id),
    });
  };

  const addedEdges = changes.filter(
    (change) => change.type === "lineage-added" && isEdge(change.after),
  );
  const pairedAdditions = new Set<string>();
  // Objects and relationships of a removed item are covered by its candidate.
  const removedItemIds = new Set(
    changes
      .filter((change) => change.type === "item-removed")
      .map((change) => change.itemFabricId ?? ""),
  );

  for (const change of changes) {
    const itemId = change.itemFabricId ?? "";
    const historicalItem = itemSummary(beforeItems.get(itemId) ?? afterItems.get(itemId), itemId);
    if (change.type === "item-removed" && itemId) {
      push("item-removed", change, {
        item: historicalItem,
        downstream: downstreamOf(itemId),
        dependentObjects: [],
      });
      continue;
    }
    if (
      change.type === "schema-object-removed" ||
      change.type === "schema-object-modified"
    ) {
      if (removedItemIds.has(itemId)) continue;
      const objectType = change.objectType ?? "";
      const table = change.tableName;
      const name = change.objectName ?? change.label;
      const isTable = SCHEMA_TABLE_KINDS.has(objectType);
      const isColumn = SCHEMA_COLUMN_KINDS.has(objectType);
      const isMeasure = objectType === "measure";
      let kind: BreakingChangeKind | undefined;
      if (change.type === "schema-object-removed") {
        kind = isTable ? "table-removed" : isColumn ? "column-removed" : isMeasure ? "measure-removed" : undefined;
      } else if (isColumn && change.changedFields?.includes("dataType")) {
        kind = "column-type-changed";
      } else if (isMeasure && change.changedFields?.includes("expression")) {
        kind = "measure-expression-changed";
      }
      if (!kind || !itemId) continue;
      const reference: SchemaObjectRef = {
        itemId,
        kind: isMeasure ? "measure" : "column",
        tableName: isTable ? name : table,
        name,
      };
      const field = kind === "column-type-changed" ? "dataType" : kind === "measure-expression-changed" ? "expression" : undefined;
      push(kind, change, {
        item: historicalItem,
        object: { kind: objectType, table: isTable ? undefined : table, name },
        before: field ? record(change.before)[field] : change.before,
        after: field ? record(change.after)[field] : change.after,
        downstream: downstreamOf(itemId),
        dependentObjects: dependentsOf(reference, isTable),
      });
      continue;
    }
    if (change.type === "lineage-removed" && isEdge(change.before)) {
      const edge = change.before;
      if (removedItemIds.has(edge.source) || removedItemIds.has(edge.target)) {
        continue;
      }
      const reversal = addedEdges.find(
        (candidate) =>
          !pairedAdditions.has(candidate.id) &&
          (candidate.after as Edge).source === edge.target &&
          (candidate.after as Edge).target === edge.source,
      );
      if (reversal) pairedAdditions.add(reversal.id);
      const source = beforeItems.get(edge.source)?.displayName ?? edge.source;
      const target = beforeItems.get(edge.target)?.displayName ?? edge.target;
      push(reversal ? "lineage-reversed" : "lineage-removed", change, {
        title: `${BREAKING_CHANGE_LABEL[reversal ? "lineage-reversed" : "lineage-removed"]}: ${source} → ${target}`,
        item: itemSummary(beforeItems.get(edge.target), edge.target),
        before: edge,
        after: reversal?.after,
        changeIds: reversal ? [change.id, reversal.id] : [change.id],
        downstream: downstreamOf(edge.target, true),
        dependentObjects: [],
      });
      continue;
    }
    if (change.type === "lineage-broken-state-changed" && change.after === true) {
      const [sourceId = "", targetId = ""] = change.label.split(" → ");
      const source = beforeItems.get(sourceId)?.displayName ?? sourceId;
      const target = beforeItems.get(targetId)?.displayName ?? targetId;
      push("lineage-broken", change, {
        title: `${BREAKING_CHANGE_LABEL["lineage-broken"]}: ${source} → ${target}`,
        item: itemSummary(beforeItems.get(targetId), targetId),
        downstream: downstreamOf(targetId, true),
        dependentObjects: [],
      });
      continue;
    }
    if (change.type === "item-modified" && itemId) {
      const before = record(change.before);
      const after = record(change.after);
      const hadOwner = !!(text(before.ownerName) || text(before.ownerEmail));
      const hasOwner = !!(text(after.ownerName) || text(after.ownerEmail));
      const downstream = downstreamOf(itemId);
      // Ownership loss is an operational risk only when consumers depend on the item.
      if (hadOwner && !hasOwner && downstream.length > 0) {
        push("owner-removed", change, {
          item: historicalItem,
          before: { ownerName: before.ownerName, ownerEmail: before.ownerEmail },
          after: { ownerName: after.ownerName, ownerEmail: after.ownerEmail },
          downstream,
          dependentObjects: [],
        });
      }
      continue;
    }
    if (
      change.type === "access-grant-removed" &&
      itemId &&
      record(change.before).accessLevel === "owner"
    ) {
      const downstream = downstreamOf(itemId);
      if (downstream.length > 0) {
        push("owner-access-removed", change, {
          title: `${BREAKING_CHANGE_LABEL["owner-access-removed"]}: ${change.label} on ${historicalItem.name}`,
          item: historicalItem,
          downstream,
          dependentObjects: [],
        });
      }
    }
  }

  const rank: Record<BreakingChangeSeverity, number> = { high: 0, medium: 1, low: 2 };
  candidates.sort(
    (left, right) =>
      rank[left.severity] - rank[right.severity] ||
      right.score - left.score ||
      left.title.localeCompare(right.title) ||
      left.id.localeCompare(right.id),
  );
  return { fromSnapshotId: from.snapshotId, toSnapshotId: to.snapshotId, candidates };
}

function valueText(value: unknown): string {
  if (value === undefined) return "Not present";
  if (typeof value === "string") return value || "Empty";
  return JSON.stringify(value, null, 2);
}

/** Markdown change-review brief for one candidate. */
export function breakingChangeBrief(
  candidate: BreakingChangeCandidate,
  from: { snapshotId: string; syncedAt?: string },
  to: { snapshotId: string; syncedAt?: string },
): string {
  const lines = [
    `# ${markdownText(candidate.title)}`,
    "",
    `- Severity: ${candidate.severity} (score ${candidate.score})`,
    `- Kind: ${BREAKING_CHANGE_LABEL[candidate.kind]}`,
    `- Compared snapshots: ${from.snapshotId}${from.syncedAt ? ` (${from.syncedAt})` : ""} → ${to.snapshotId}${to.syncedAt ? ` (${to.syncedAt})` : ""}`,
    `- Affected item: ${markdownText(candidate.item.name)}${candidate.item.type ? ` (${markdownText(candidate.item.type)})` : ""}`,
    `- Documented owner: ${markdownText(candidate.item.ownerName || candidate.item.ownerEmail || "Not documented")}`,
    ...(candidate.object
      ? [`- Object: ${candidate.object.table ? `${markdownText(candidate.object.table)}.` : ""}${markdownText(candidate.object.name)} (${candidate.object.kind})`]
      : []),
    `- Evidence: Atlas snapshot comparison, change ${candidate.changeIds.join(", ")}`,
    "",
    "## Before",
    "",
    ...markdownCodeBlock(valueText(candidate.before)),
    "",
    "## After",
    "",
    ...markdownCodeBlock(valueText(candidate.after)),
    "",
    `## Downstream items in the earlier snapshot (${candidate.downstream.length})`,
    "",
    ...(candidate.downstream.length
      ? candidate.downstream.map(
          (entry) => `- ${markdownText(entry.name)}${entry.type ? ` (${markdownText(entry.type)})` : ""}, ${entry.distance === 0 ? "directly affected" : `${entry.distance} hop${entry.distance === 1 ? "" : "s"}`}`,
        )
      : ["- None recorded"]),
    "",
    `## Dependent model objects (${candidate.dependentObjects.length})`,
    "",
    ...(candidate.dependentObjects.length
      ? candidate.dependentObjects.map(
          (entry) => `- ${markdownText(entry.itemName)}: ${entry.table ? `${markdownText(entry.table)}.` : ""}${markdownText(entry.name)} (${entry.kind}, ${entry.confidence})`,
        )
      : ["- None recorded"]),
    "",
    "## Recent jobs",
    "",
    ...(candidate.recentJobs.length
      ? candidate.recentJobs.map((job) => `- ${job.jobType}: ${job.status}${job.startedAt ? ` at ${job.startedAt}` : ""}`)
      : ["- None recorded"]),
    "",
    "## Limits",
    "",
    "- Impact is item-level and DAX-object-level. Report visual field usage is not exposed by Fabric APIs and is not claimed.",
    "- Severity combines the change kind with recorded downstream depth; it does not estimate usage.",
    "",
  ];
  return lines.join("\n");
}
