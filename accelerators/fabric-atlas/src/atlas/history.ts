import type {
  AtlasData,
  Edge,
  Grant,
  Item,
  Job,
} from "./model";
import {
  buildCatalogObjects,
  type AssetObjectKind,
} from "./catalog-objects";

export type SnapshotCatalog = Omit<AtlasData, "comments" | "syncRuns">;

export interface HistoricalSnapshot {
  snapshotId: string;
  syncedAt: string;
  catalog: SnapshotCatalog;
}

export interface SnapshotMetrics {
  items: number;
  itemCount: number;
  healthy: number;
  healthyCount: number;
  stale: number;
  staleCount: number;
  failing: number;
  failingCount: number;
  labels: number;
  labelCount: number;
  principals: number;
  principalCount: number;
  externalPrincipals: number;
  externalPrincipalCount: number;
  grants: number;
  grantCount: number;
  failedJobs: number;
  failedJobCount: number;
  lineage: number;
  lineageEdges: number;
  lineageEdgeCount: number;
  brokenEdges: number;
  brokenEdgeCount: number;
  tables: number;
  tableCount: number;
  columns: number;
  columnCount: number;
  measures: number;
  measureCount: number;
}

export interface SnapshotSummary extends SnapshotMetrics {
  snapshotId: string;
  syncedAt: string;
  label: string;
  deploymentId?: string;
}

export type SnapshotTrendPoint = SnapshotSummary;

export type AtlasChangeType =
  | "item-added"
  | "item-removed"
  | "item-modified"
  | "schema-object-added"
  | "schema-object-removed"
  | "schema-object-modified"
  | "access-grant-added"
  | "access-grant-removed"
  | "access-grant-changed"
  | "sensitivity-changed"
  | "lineage-added"
  | "lineage-removed"
  | "lineage-broken-state-changed"
  | "job-new"
  | "job-status-changed";

export type AtlasChangeDomain =
  | "item"
  | "schema"
  | "access"
  | "sensitivity"
  | "lineage"
  | "job";

export interface AtlasChange {
  id: string;
  type: AtlasChangeType;
  domain: AtlasChangeDomain;
  snapshotId: string;
  syncedAt: string;
  label: string;
  itemFabricId?: string;
  objectType?: AssetObjectKind;
  objectName?: string;
  objectId?: string;
  tableName?: string;
  before?: unknown;
  after?: unknown;
  changedFields?: string[];
}

export interface AtlasHistory {
  current?: HistoricalSnapshot;
  snapshots: HistoricalSnapshot[];
  summaries: SnapshotSummary[];
  snapshotSummaries: SnapshotSummary[];
  trend: SnapshotTrendPoint[];
  trendPoints: SnapshotTrendPoint[];
  changes: AtlasChange[];
}

export type ChangeRecord = AtlasChange;
export type SnapshotChange = AtlasChange;

export function snapshotDataForInspection(
  snapshot: HistoricalSnapshot,
): AtlasData {
  return {
    ...snapshot.catalog,
    comments: [],
    syncRuns: [],
  };
}

export function readableChangeValue(value: unknown): string {
  if (value === undefined) return "Not present";
  if (value === null || value === "") return "None";
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  return JSON.stringify(value, null, 2);
}

export function changeFieldValue(
  value: unknown,
  field: string,
): unknown {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return undefined;
  }
  return (value as Record<string, unknown>)[field];
}

interface SchemaObject {
  key: string;
  itemFabricId: string;
  objectType: AssetObjectKind;
  objectName: string;
  objectId: string;
  tableName?: string;
  label: string;
  value: Record<string, unknown>;
}

const CHANGE_ORDER: Record<AtlasChangeType, number> = {
  "item-added": 0,
  "item-removed": 1,
  "item-modified": 2,
  "schema-object-added": 3,
  "schema-object-removed": 4,
  "schema-object-modified": 5,
  "access-grant-added": 6,
  "access-grant-removed": 7,
  "access-grant-changed": 8,
  "sensitivity-changed": 9,
  "lineage-added": 10,
  "lineage-removed": 11,
  "lineage-broken-state-changed": 12,
  "job-new": 13,
  "job-status-changed": 14,
};

function cleanText(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function normalizedText(value: unknown): string {
  return cleanText(value).toLowerCase();
}

export function normalizeSensitivity(value: unknown): string | undefined {
  const normalized = cleanText(value);
  return normalized || undefined;
}

function sensitivityChange(
  before: Item,
  after: Item,
): { before?: string; after?: string } | undefined {
  const oldId = normalizeSensitivity(before.sensitivityLabelId);
  const newId = normalizeSensitivity(after.sensitivityLabelId);
  if (oldId && newId) {
    return normalizedText(oldId) === normalizedText(newId)
      ? undefined
      : { before: oldId, after: newId };
  }

  const oldName = normalizeSensitivity(before.sensitivity);
  const newName = normalizeSensitivity(after.sensitivity);
  if (oldName && newName) {
    return normalizedText(oldName) === normalizedText(newName)
      ? undefined
      : { before: oldName, after: newName };
  }

  const oldValue = oldName ?? oldId;
  const newValue = newName ?? newId;
  return normalizedText(oldValue) === normalizedText(newValue)
    ? undefined
    : { before: oldValue, after: newValue };
}

export function normalizeTags(tags: readonly string[] | undefined): string[] {
  return [
    ...new Set(
      (tags ?? [])
        .map((tag) => normalizedText(tag))
        .filter(Boolean),
    ),
  ].sort();
}

function stableValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableValue(child)}`)
    .join(",")}}`;
}

function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => stableValue(before[key]) !== stableValue(after[key]))
    .sort();
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function makeChange(
  current: HistoricalSnapshot,
  type: AtlasChangeType,
  domain: AtlasChangeDomain,
  stableKey: string,
  change: Omit<
    AtlasChange,
    "id" | "type" | "domain" | "snapshotId" | "syncedAt"
  >,
): AtlasChange {
  return {
    id: `change-${stableHash(
      [current.snapshotId, type, stableKey].join("\u0000"),
    )}`,
    type,
    domain,
    snapshotId: current.snapshotId,
    syncedAt: current.syncedAt,
    ...change,
  };
}

function mapBy<T>(values: readonly T[], key: (value: T) => string): Map<string, T> {
  return new Map(
    [...values]
      .map((value) => [key(value), value] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function itemValue(item: Item): Record<string, unknown> {
  return {
    displayName: cleanText(item.displayName),
    itemType: item.itemType,
    description: cleanText(item.description),
    ownerName: cleanText(item.ownerName),
    ownerEmail: normalizedText(item.ownerEmail),
    configuredBy: normalizedText(item.configuredBy),
    modifiedBy: normalizedText(item.modifiedBy),
    health: item.health,
    endorsement: item.endorsement,
    endorsementRaw: normalizedText(item.endorsementRaw),
    endorsementBy: normalizedText(item.endorsementBy),
    tags: normalizeTags(item.tags),
    tagIds: normalizeTags(item.tagIds),
    ownerMetadataAvailable: item.ownerMetadataAvailable,
    sensitivityMetadataAvailable: item.sensitivityMetadataAvailable,
    endorsementMetadataAvailable: item.endorsementMetadataAvailable,
    tagMetadataAvailable: item.tagMetadataAvailable,
    lastRefresh: cleanText(item.lastRefresh),
    createdAt: cleanText(item.createdAt),
    updatedAt: cleanText(item.updatedAt),
    size: cleanText(item.size),
  };
}

function schemaObjects(catalog: SnapshotCatalog): SchemaObject[] {
  return buildCatalogObjects(catalog).map((object) => ({
    key: object.id,
    itemFabricId: object.itemFabricId,
    objectType: object.kind,
    objectName: object.name,
    objectId: object.objectId,
    tableName: object.tableName ?? object.parentName,
    label: object.parentName
      ? `${object.parentName}.${object.name}`
      : object.name,
    value: object.details,
  }));
}

function principalForReference(
  catalog: SnapshotCatalog,
  reference: string,
): SnapshotCatalog["principals"][number] | undefined {
  const normalizedReference = normalizedText(reference);
  const idMatches = catalog.principals.filter(
    (principal) =>
      normalizedText(principal.principalId) === normalizedReference,
  );
  if (idMatches.length === 1) return idMatches[0];
  const emailMatches = catalog.principals.filter(
    (principal) =>
      normalizedText(principal.email) === normalizedReference,
  );
  if (emailMatches.length === 1) return emailMatches[0];
  const nameMatches = catalog.principals.filter(
    (principal) =>
      normalizedText(principal.displayName) === normalizedReference,
  );
  return nameMatches.length === 1 ? nameMatches[0] : undefined;
}

function principalsByEmail(
  catalog: SnapshotCatalog,
): Map<string, SnapshotCatalog["principals"]> {
  const result = new Map<string, SnapshotCatalog["principals"]>();
  for (const principal of catalog.principals) {
    const email = normalizedText(principal.email);
    if (!email) continue;
    const matches = result.get(email) ?? [];
    matches.push(principal);
    result.set(email, matches);
  }
  return result;
}

function principalComparisonKeys(
  previous: SnapshotCatalog,
  current: SnapshotCatalog,
): {
  previous: Map<string, string>;
  current: Map<string, string>;
} {
  const previousKeys = new Map(
    previous.principals.map((principal) => [
      normalizedText(principal.principalId),
      normalizedText(principal.principalId),
    ]),
  );
  const currentKeys = new Map(
    current.principals.map((principal) => [
      normalizedText(principal.principalId),
      normalizedText(principal.principalId),
    ]),
  );
  const previousEmails = principalsByEmail(previous);
  const currentEmails = principalsByEmail(current);

  for (const [email, previousMatches] of previousEmails) {
    const currentMatches = currentEmails.get(email) ?? [];
    if (previousMatches.length !== 1 || currentMatches.length !== 1) continue;
    const comparisonKey = `email:${email}`;
    previousKeys.set(
      normalizedText(previousMatches[0].principalId),
      comparisonKey,
    );
    currentKeys.set(
      normalizedText(currentMatches[0].principalId),
      comparisonKey,
    );
  }
  return { previous: previousKeys, current: currentKeys };
}

function grantKey(
  catalog: SnapshotCatalog,
  grant: Grant,
  comparisonKeys: ReadonlyMap<string, string>,
): string {
  const principal = principalForReference(catalog, grant.principalRef);
  const principalKey = principal
    ? comparisonKeys.get(normalizedText(principal.principalId)) ??
      normalizedText(principal.principalId)
    : normalizedText(grant.principalRef);
  return [
    cleanText(grant.itemFabricId),
    principalKey,
    grant.source,
  ].join("\u0000");
}

function grantValue(grant: Grant): Record<string, unknown> {
  return {
    accessLevel: grant.accessLevel,
    roleName: cleanText(grant.roleName),
    flag: cleanText(grant.flag),
  };
}

function edgeKey(edge: Edge): string {
  return [
    cleanText(edge.source),
    cleanText(edge.target),
    normalizedText(edge.relation),
  ].join("\u0000");
}

function jobKey(job: Job): string {
  return [
    cleanText(job.itemFabricId),
    normalizedText(job.jobType),
    cleanText(job.startedAt),
  ].join("\u0000");
}

function compareMap<T>(
  previous: Map<string, T>,
  current: Map<string, T>,
  callbacks: {
    added: (key: string, value: T) => AtlasChange;
    removed?: (key: string, value: T) => AtlasChange;
    retained?: (key: string, before: T, after: T) => AtlasChange | undefined;
  },
): AtlasChange[] {
  const changes: AtlasChange[] = [];
  for (const [key, value] of current) {
    const before = previous.get(key);
    if (before === undefined) changes.push(callbacks.added(key, value));
    else {
      const change = callbacks.retained?.(key, before, value);
      if (change) changes.push(change);
    }
  }
  if (callbacks.removed) {
    for (const [key, value] of previous) {
      if (!current.has(key)) changes.push(callbacks.removed(key, value));
    }
  }
  return changes;
}

export function compareSnapshots(
  previous: HistoricalSnapshot,
  current: HistoricalSnapshot,
): AtlasChange[] {
  const changes: AtlasChange[] = [];
  const previousItems = mapBy(previous.catalog.items, (item) => item.fabricId);
  const currentItems = mapBy(current.catalog.items, (item) => item.fabricId);

  changes.push(
    ...compareMap(previousItems, currentItems, {
      added: (key, item) =>
        makeChange(current, "item-added", "item", key, {
          label: item.displayName,
          itemFabricId: item.fabricId,
          after: itemValue(item),
        }),
      removed: (key, item) =>
        makeChange(current, "item-removed", "item", key, {
          label: item.displayName,
          itemFabricId: item.fabricId,
          before: itemValue(item),
        }),
      retained: (key, before, after) => {
        const oldValue = itemValue(before);
        const newValue = itemValue(after);
        const fields = changedFields(oldValue, newValue);
        return fields.length
          ? makeChange(current, "item-modified", "item", key, {
              label: after.displayName,
              itemFabricId: after.fabricId,
              before: oldValue,
              after: newValue,
              changedFields: fields,
            })
          : undefined;
      },
    }),
  );

  for (const [key, item] of currentItems) {
    const before = previousItems.get(key);
    if (!before) continue;
    const sensitivity = sensitivityChange(before, item);
    if (sensitivity) {
      changes.push(
        makeChange(current, "sensitivity-changed", "sensitivity", key, {
          label: item.displayName,
          itemFabricId: item.fabricId,
          before: sensitivity.before,
          after: sensitivity.after,
          changedFields: ["sensitivity"],
        }),
      );
    }
  }

  const previousSchema = mapBy(schemaObjects(previous.catalog), (object) => object.key);
  const currentSchema = mapBy(schemaObjects(current.catalog), (object) => object.key);
  changes.push(
    ...compareMap(previousSchema, currentSchema, {
      added: (key, object) =>
        makeChange(current, "schema-object-added", "schema", key, {
          label: object.label,
          itemFabricId: object.itemFabricId,
          objectType: object.objectType,
          objectName: object.objectName,
          objectId: object.objectId,
          tableName: object.tableName,
          after: object.value,
        }),
      removed: (key, object) =>
        makeChange(current, "schema-object-removed", "schema", key, {
          label: object.label,
          itemFabricId: object.itemFabricId,
          objectType: object.objectType,
          objectName: object.objectName,
          objectId: object.objectId,
          tableName: object.tableName,
          before: object.value,
        }),
      retained: (key, before, after) => {
        const fields = changedFields(before.value, after.value);
        return fields.length
          ? makeChange(current, "schema-object-modified", "schema", key, {
              label: after.label,
              itemFabricId: after.itemFabricId,
              objectType: after.objectType,
              objectName: after.objectName,
              objectId: after.objectId,
              tableName: after.tableName,
              before: before.value,
              after: after.value,
              changedFields: fields,
            })
          : undefined;
      },
    }),
  );

  const comparisonKeys = principalComparisonKeys(
    previous.catalog,
    current.catalog,
  );
  const previousGrants = mapBy(previous.catalog.grants, (grant) =>
    grantKey(previous.catalog, grant, comparisonKeys.previous),
  );
  const currentGrants = mapBy(current.catalog.grants, (grant) =>
    grantKey(current.catalog, grant, comparisonKeys.current),
  );
  changes.push(
    ...compareMap(previousGrants, currentGrants, {
      added: (key, grant) =>
        makeChange(current, "access-grant-added", "access", key, {
          label: grant.principalRef,
          itemFabricId: grant.itemFabricId,
          after: grantValue(grant),
        }),
      removed: (key, grant) =>
        makeChange(current, "access-grant-removed", "access", key, {
          label: grant.principalRef,
          itemFabricId: grant.itemFabricId,
          before: grantValue(grant),
        }),
      retained: (key, before, after) => {
        const oldValue = grantValue(before);
        const newValue = grantValue(after);
        const fields = changedFields(oldValue, newValue);
        return fields.length
          ? makeChange(current, "access-grant-changed", "access", key, {
              label: after.principalRef,
              itemFabricId: after.itemFabricId,
              before: oldValue,
              after: newValue,
              changedFields: fields,
            })
          : undefined;
      },
    }),
  );

  const previousEdges = mapBy(previous.catalog.edges, edgeKey);
  const currentEdges = mapBy(current.catalog.edges, edgeKey);
  changes.push(
    ...compareMap(previousEdges, currentEdges, {
      added: (key, edge) =>
        makeChange(current, "lineage-added", "lineage", key, {
          label: `${edge.source} → ${edge.target}`,
          after: edge,
        }),
      removed: (key, edge) =>
        makeChange(current, "lineage-removed", "lineage", key, {
          label: `${edge.source} → ${edge.target}`,
          before: edge,
        }),
      retained: (key, before, after) =>
        !!before.broken !== !!after.broken
          ? makeChange(
              current,
              "lineage-broken-state-changed",
              "lineage",
              key,
              {
                label: `${after.source} → ${after.target}`,
                before: !!before.broken,
                after: !!after.broken,
                changedFields: ["broken"],
              },
            )
          : undefined,
    }),
  );

  const previousJobs = mapBy(previous.catalog.jobs, jobKey);
  const currentJobs = mapBy(current.catalog.jobs, jobKey);
  changes.push(
    ...compareMap(previousJobs, currentJobs, {
      added: (key, job) =>
        makeChange(current, "job-new", "job", key, {
          label: `${job.itemName} · ${job.jobType}`,
          itemFabricId: job.itemFabricId,
          after: job,
        }),
      retained: (key, before, after) =>
        before.status !== after.status
          ? makeChange(current, "job-status-changed", "job", key, {
              label: `${after.itemName} · ${after.jobType}`,
              itemFabricId: after.itemFabricId,
              before: before.status,
              after: after.status,
              changedFields: ["status"],
            })
          : undefined,
    }),
  );

  return changes.sort(
    (left, right) =>
      CHANGE_ORDER[left.type] - CHANGE_ORDER[right.type] ||
      left.label.localeCompare(right.label) ||
      left.id.localeCompare(right.id),
  );
}

export function summarizeSnapshot(snapshot: HistoricalSnapshot): SnapshotSummary {
  const objects = buildCatalogObjects(snapshot.catalog);
  const items = snapshot.catalog.items.length;
  const lineage = snapshot.catalog.edges.length;
  const healthy = snapshot.catalog.items.filter(
    (item) => item.health === "healthy",
  ).length;
  const stale = snapshot.catalog.items.filter(
    (item) => item.health === "stale",
  ).length;
  const failing = snapshot.catalog.items.filter(
    (item) => item.health === "failing",
  ).length;
  const labels = snapshot.catalog.items.filter(
    (item) =>
      normalizeSensitivity(item.sensitivity) ||
      normalizedText(item.sensitivityLabelId),
  ).length;
  const principals = snapshot.catalog.principals.length;
  const externalPrincipals = snapshot.catalog.principals.filter(
    (principal) => principal.external || principal.kind === "guest",
  ).length;
  const grants = snapshot.catalog.grants.length;
  const failedJobs = snapshot.catalog.jobs.filter(
    (job) => job.status === "failed",
  ).length;
  const brokenEdges = snapshot.catalog.edges.filter((edge) => edge.broken).length;
  const tables = objects.filter((object) =>
    [
      "table",
      "view",
      "sqlTable",
      "sqlView",
      "kqlTable",
      "kqlMaterializedView",
    ].includes(object.kind),
  ).length;
  const columns = objects.filter((object) =>
    ["column", "sqlColumn", "kqlColumn"].includes(object.kind),
  ).length;
  const measures = objects.filter(
    (object) => object.kind === "measure",
  ).length;
  return {
    snapshotId: snapshot.snapshotId,
    syncedAt: snapshot.syncedAt,
    label: snapshot.syncedAt.slice(0, 10),
    deploymentId: snapshot.catalog.workspace.deploymentId,
    items,
    itemCount: items,
    healthy,
    healthyCount: healthy,
    stale,
    staleCount: stale,
    failing,
    failingCount: failing,
    labels,
    labelCount: labels,
    principals,
    principalCount: principals,
    externalPrincipals,
    externalPrincipalCount: externalPrincipals,
    grants,
    grantCount: grants,
    failedJobs,
    failedJobCount: failedJobs,
    lineage,
    lineageEdges: lineage,
    lineageEdgeCount: lineage,
    brokenEdges,
    brokenEdgeCount: brokenEdges,
    tables,
    tableCount: tables,
    columns,
    columnCount: columns,
    measures,
    measureCount: measures,
  };
}

export function snapshotCatalogFromData(data: AtlasData): SnapshotCatalog {
  return {
    workspace: { ...data.workspace },
    items: data.items.map((item) => ({ ...item, tags: [...item.tags] })),
    edges: data.edges.map((edge) => ({ ...edge })),
    principals: data.principals.map((principal) => ({ ...principal })),
    grants: data.grants.map((grant) => ({ ...grant })),
    jobs: data.jobs.map((job) => ({ ...job })),
    config: data.config.map((entry) => ({ ...entry })),
    schema: Object.fromEntries(
      Object.entries(data.schema ?? {}).map(([itemId, tables]) => [
        itemId,
        tables.map((table) => ({
          ...table,
          columns: table.columns.map((column) => ({ ...column })),
          measures: table.measures.map((measure) => ({ ...measure })),
        })),
      ]),
    ),
    itemMetadata: data.itemMetadata
      ? structuredClone(data.itemMetadata)
      : undefined,
    objectEdges: data.objectEdges?.map((edge) => ({
      ...edge,
      source: {
        ...edge.source,
        parentPath: edge.source.parentPath
          ? [...edge.source.parentPath]
          : undefined,
      },
      target: {
        ...edge.target,
        parentPath: edge.target.parentPath
          ? [...edge.target.parentPath]
          : undefined,
      },
    })),
  };
}

export function snapshotFromData(
  data: AtlasData,
  snapshotId = data.workspace.snapshotId ?? "current",
  syncedAt =
    data.workspace.syncedAt ??
    data.syncRuns[0]?.finishedAt ??
    data.syncRuns[0]?.startedAt ??
    "",
): HistoricalSnapshot {
  return {
    snapshotId,
    syncedAt,
    catalog: snapshotCatalogFromData(data),
  };
}

export function buildAtlasHistory(
  input: readonly HistoricalSnapshot[],
  summaryInput: readonly SnapshotSummary[] = [],
): AtlasHistory {
  const snapshots = [
    ...new Map(
      [...input]
        .filter((snapshot) => !!snapshot.snapshotId)
        .sort(
          (left, right) =>
            Date.parse(right.syncedAt || "1970-01-01") -
              Date.parse(left.syncedAt || "1970-01-01") ||
            right.snapshotId.localeCompare(left.snapshotId),
        )
        .map((snapshot) => [snapshot.snapshotId, snapshot]),
    ).values(),
  ];
  const summaries = [
    ...new Map(
      [
        ...summaryInput,
        ...snapshots.map(summarizeSnapshot),
      ]
        .filter((summary) => !!summary.snapshotId)
        .sort(
          (left, right) =>
            Date.parse(right.syncedAt || "1970-01-01") -
              Date.parse(left.syncedAt || "1970-01-01") ||
            right.snapshotId.localeCompare(left.snapshotId),
        )
        .map((summary) => [summary.snapshotId, summary]),
    ).values(),
  ];
  const trend = [...summaries].reverse();
  const changes: AtlasChange[] = [];
  for (let index = 0; index + 1 < snapshots.length; index += 1) {
    changes.push(...compareSnapshots(snapshots[index + 1], snapshots[index]));
  }
  return {
    current: snapshots[0],
    snapshots,
    summaries,
    snapshotSummaries: summaries,
    trend,
    trendPoints: trend,
    changes,
  };
}
