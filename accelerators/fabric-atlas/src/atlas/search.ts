import {
  assetObjectKindLabel,
  buildCatalogObjects,
  type AssetObjectKind,
  type CatalogObject,
} from "./catalog-objects";
import type { AtlasData } from "./model";

export type SearchTargetKind =
  | "workspace"
  | "item"
  | "table"
  | "view"
  | "column"
  | "measure"
  | "principal"
  | "comment"
  | "config"
  | "job";

export interface SearchTarget {
  kind: SearchTargetKind;
  workspaceId?: string;
  itemId?: string;
  principalId?: string;
  commentId?: string;
  jobId?: string;
  section?: string;
  tableName?: string;
  objectName?: string;
  objectId?: string;
  objectKind?: AssetObjectKind;
}

export interface SearchIndexEntry {
  id: string;
  kind: SearchTargetKind;
  title: string;
  subtitle?: string;
  target: SearchTarget;
  searchText: string;
  normalizedTitle: string;
}

export interface SearchResult extends SearchIndexEntry {
  score: number;
}

export interface SearchOptions {
  limit?: number;
}

const KIND_SCORE: Record<SearchTargetKind, number> = {
  workspace: 30,
  item: 30,
  table: 25,
  view: 25,
  column: 20,
  measure: 20,
  principal: 20,
  config: 10,
  job: 10,
  comment: 0,
};

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function stablePart(value: string): string {
  return encodeURIComponent(normalizeSearchText(value) || "(blank)");
}

function entry(
  id: string,
  kind: SearchTargetKind,
  title: string,
  subtitle: string | undefined,
  target: SearchTarget,
  values: unknown[],
): SearchIndexEntry {
  return {
    id,
    kind,
    title,
    subtitle,
    target,
    normalizedTitle: normalizeSearchText(title),
    searchText: normalizeSearchText(
      [title, subtitle, ...values].map(text).filter(Boolean).join(" "),
    ),
  };
}

function searchKindForObject(object: CatalogObject): SearchTargetKind {
  if (object.kind === "view" || object.kind === "sqlView") return "view";
  if (
    object.kind === "table" ||
    object.kind === "sqlTable" ||
    object.kind === "kqlTable" ||
    object.kind === "kqlMaterializedView"
  ) {
    return "table";
  }
  if (
    object.kind === "column" ||
    object.kind === "sqlColumn" ||
    object.kind === "kqlColumn" ||
    object.kind === "kqlFunctionParameter" ||
    object.kind === "ontologyProperty" ||
    object.kind === "ontologyTimeSeriesProperty" ||
    object.kind === "graphProperty" ||
    object.kind === "dataAgentElement"
  ) {
    return "column";
  }
  if (object.kind === "measure") return "measure";
  return "item";
}

export function searchJobId(
  itemId: string,
  jobType: string,
  startedAt: string,
): string {
  return [
    "job",
    stablePart(itemId),
    stablePart(jobType),
    stablePart(startedAt),
  ].join(":");
}

export function buildSearchIndex(data: AtlasData): SearchIndexEntry[] {
  const entries: SearchIndexEntry[] = [];
  const itemNames = new Map(
    data.items.map((item) => [item.fabricId, item.displayName]),
  );

  entries.push(
    entry(
      `workspace:${stablePart(data.workspace.fabricId)}`,
      "workspace",
      data.workspace.displayName,
      "Workspace",
      {
        kind: "workspace",
        workspaceId: data.workspace.fabricId,
      },
      [
        data.workspace.fabricId,
        data.workspace.capacity,
        data.workspace.region,
        data.workspace.deploymentId,
      ],
    ),
  );

  for (const item of data.items) {
    entries.push(
      entry(
        `item:${stablePart(item.fabricId)}`,
        "item",
        item.displayName,
        item.itemType,
        { kind: "item", itemId: item.fabricId },
        [
          item.fabricId,
          item.description,
          item.ownerName,
          item.ownerEmail,
          item.configuredBy,
          item.modifiedBy,
          item.health,
          item.endorsement,
          item.endorsementRaw,
          item.endorsementBy,
          item.sensitivity,
          item.sensitivityLabelId,
          ...item.tags,
          ...(item.tagIds ?? []),
        ],
      ),
    );
  }

  for (const object of buildCatalogObjects(data)) {
    const kind = searchKindForObject(object);
    const label = assetObjectKindLabel(object.kind);
    entries.push(
      entry(
        `asset:${object.id}`,
        kind,
        object.name,
        `${label}${object.parentName ? ` in ${object.parentName}` : ""} · ${object.itemName}`,
        {
          kind,
          itemId: object.itemFabricId,
          tableName: object.tableName ?? object.parentName,
          objectName: object.name,
          objectId: object.objectId,
          objectKind: object.kind,
        },
        [
          label,
          object.itemName,
          object.itemType,
          object.parentName,
          object.tableName,
          object.dataType,
          object.source,
          object.sourceItemName,
          object.description,
          object.expression,
          JSON.stringify(object.details),
          object.isHidden ? "hidden" : "",
        ],
      ),
    );
  }

  for (const principal of data.principals) {
    entries.push(
      entry(
        `principal:${stablePart(principal.principalId)}`,
        "principal",
        principal.displayName,
        principal.kind,
        { kind: "principal", principalId: principal.principalId },
        [
          principal.principalId,
          principal.email,
          principal.workspaceRole,
          principal.external ? "external" : "",
        ],
      ),
    );
  }

  for (const comment of data.comments) {
    entries.push(
      entry(
        `comment:${stablePart(comment.id)}`,
        "comment",
        comment.body,
        `Comment by ${comment.authorName}`,
        {
          kind: "comment",
          itemId: comment.itemFabricId,
          principalId: comment.authorId,
          commentId: comment.id,
        },
        [
          comment.authorName,
          comment.authorEmail,
          comment.createdAt,
          comment.itemFabricId
            ? itemNames.get(comment.itemFabricId)
            : data.workspace.displayName,
        ],
      ),
    );
  }

  for (const config of data.config) {
    entries.push(
      entry(
        [
          "config",
          stablePart(config.itemFabricId),
          stablePart(config.section),
          stablePart(config.label),
          stablePart(config.value),
        ].join(":"),
        "config",
        config.label,
        `${config.section} · ${itemNames.get(config.itemFabricId) ?? config.itemFabricId}`,
        {
          kind: "config",
          itemId: config.itemFabricId,
          section: config.section,
          objectName: config.label,
        },
        [
          config.value,
          config.section,
          itemNames.get(config.itemFabricId),
        ],
      ),
    );
  }

  for (const job of data.jobs) {
    const id = searchJobId(job.itemFabricId, job.jobType, job.startedAt);
    entries.push(
      entry(
        id,
        "job",
        `${job.jobType}: ${job.itemName}`,
        job.status,
        { kind: "job", itemId: job.itemFabricId, jobId: id },
        [
          job.itemFabricId,
          job.message,
          job.startedAt,
          String(job.durationSec),
        ],
      ),
    );
  }

  return entries.sort((left, right) => compareText(left.id, right.id));
}

export const createSearchIndex = buildSearchIndex;

function tokenScore(entry: SearchIndexEntry, token: string): number {
  const titleWords = entry.normalizedTitle.split(" ");
  if (entry.normalizedTitle === token) return 160;
  if (entry.normalizedTitle.startsWith(token)) return 100;
  if (titleWords.some((word) => word === token)) return 80;
  if (titleWords.some((word) => word.startsWith(token))) return 55;
  if (entry.normalizedTitle.includes(token)) return 35;
  return 10;
}

export function searchIndex(
  index: SearchIndexEntry[],
  query: string,
  options?: SearchOptions,
): SearchResult[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];
  const tokens = [...new Set(normalizedQuery.split(" ").filter(Boolean))];
  const limit = Math.max(0, Math.floor(options?.limit ?? 50));
  if (limit === 0) return [];

  return index
    .filter((candidate) =>
      tokens.every((token) => candidate.searchText.includes(token)),
    )
    .map((candidate) => {
      let score =
        KIND_SCORE[candidate.kind] +
        tokens.reduce(
          (total, token) => total + tokenScore(candidate, token),
          0,
        );
      if (candidate.normalizedTitle === normalizedQuery) score += 1_000;
      else if (candidate.normalizedTitle.startsWith(normalizedQuery))
        score += 500;
      else if (candidate.normalizedTitle.includes(normalizedQuery))
        score += 200;
      return { ...candidate, score };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        compareText(left.normalizedTitle, right.normalizedTitle) ||
        compareText(left.kind, right.kind) ||
        compareText(left.id, right.id),
    )
    .slice(0, limit);
}

export function searchAtlas(
  data: AtlasData,
  query: string,
  options?: SearchOptions,
): SearchResult[] {
  return searchIndex(buildSearchIndex(data), query, options);
}

export const globalSearch = searchAtlas;
export const searchAtlasData = searchAtlas;
