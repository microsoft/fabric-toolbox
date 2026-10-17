import { getRayfinClient } from "@/lib/rayfin-client";

export type SavedViewSection =
  | "governance"
  | "access"
  | "catalog"
  | "assets"
  | "jobs"
  | "map";

export type SavedFilterValue =
  | string
  | number
  | boolean
  | string[]
  | null;

export type SavedViewFilters = Record<string, SavedFilterValue>;

export interface SavedView {
  id: string;
  name: string;
  section: SavedViewSection;
  filters: SavedViewFilters;
  createdAt: string;
  updatedAt: string;
}

interface SavedViewRow {
  id: string;
  workspace_id: string;
  user_id: string;
  name: string;
  section: string;
  filtersJson: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

interface SavedViewQuery {
  where(filter: Record<string, unknown>): SavedViewQuery;
  orderBy(order: Record<string, "asc" | "desc">): SavedViewQuery;
  execute(): Promise<SavedViewRow[]>;
}

interface SavedViewApi {
  select(fields: readonly string[]): SavedViewQuery;
  create(value: Record<string, unknown>): Promise<SavedViewRow>;
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
  "name",
  "section",
  "filtersJson",
  "createdAt",
  "updatedAt",
] as const;

const SECTIONS = new Set<SavedViewSection>([
  "governance",
  "access",
  "catalog",
  "assets",
  "jobs",
  "map",
]);

function api(): SavedViewApi {
  return (
    getRayfinClient().data as unknown as { SavedView: SavedViewApi }
  ).SavedView;
}

function validName(name: string): string {
  const value = name.trim();
  if (!value || value.length > 100) {
    throw new Error("Saved view names must contain between 1 and 100 characters.");
  }
  return value;
}

function validSection(section: string): SavedViewSection {
  if (!SECTIONS.has(section as SavedViewSection)) {
    throw new Error(`Unsupported saved view section: ${section}`);
  }
  return section as SavedViewSection;
}

function serializeFilters(filters: SavedViewFilters): string {
  const json = JSON.stringify(filters);
  if (json.length > 3500) {
    throw new Error("Saved view filters are too large.");
  }
  return json;
}

function parseRow(row: SavedViewRow): SavedView {
  let filters: unknown;
  try {
    filters = JSON.parse(row.filtersJson);
  } catch {
    throw new Error(`Saved view ${row.id} contains invalid filter data.`);
  }
  if (!filters || Array.isArray(filters) || typeof filters !== "object") {
    throw new Error(`Saved view ${row.id} contains invalid filter data.`);
  }
  return {
    id: String(row.id),
    name: validName(String(row.name)),
    section: validSection(String(row.section)),
    filters: filters as SavedViewFilters,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export async function loadSavedViews(
  isPreview: boolean,
  workspaceId: string,
  userId: string,
): Promise<SavedView[]> {
  if (isPreview) return [];
  const rows = await api()
    .select(FIELDS)
    .where({
      workspace_id: { eq: workspaceId },
      user_id: { eq: userId },
    })
    .orderBy({ updatedAt: "desc" })
    .execute();
  return rows.map(parseRow);
}

export async function createSavedView(
  isPreview: boolean,
  workspaceId: string,
  userId: string,
  input: {
    name: string;
    section: SavedViewSection;
    filters: SavedViewFilters;
  },
): Promise<SavedView> {
  const now = new Date();
  const draft: SavedViewRow = {
    id: crypto.randomUUID(),
    workspace_id: workspaceId,
    user_id: userId,
    name: validName(input.name),
    section: validSection(input.section),
    filtersJson: serializeFilters(input.filters),
    createdAt: now,
    updatedAt: now,
  };
  if (isPreview) return parseRow(draft);
  return parseRow(
    await api().create({
      workspace_id: draft.workspace_id,
      user_id: draft.user_id,
      name: draft.name,
      section: draft.section,
      filtersJson: draft.filtersJson,
      createdAt: now,
      updatedAt: now,
    }),
  );
}

export async function updateSavedView(
  isPreview: boolean,
  current: SavedView,
  input: {
    name?: string;
    filters?: SavedViewFilters;
  },
): Promise<SavedView> {
  const updatedAt = new Date();
  const next: SavedView = {
    ...current,
    name: input.name == null ? current.name : validName(input.name),
    filters: input.filters ?? current.filters,
    updatedAt: updatedAt.toISOString(),
  };
  const filtersJson = serializeFilters(next.filters);
  if (!isPreview) {
    await api().update(
      { id: current.id },
      {
        name: next.name,
        filtersJson,
        updatedAt,
      },
    );
  }
  return next;
}

export async function deleteSavedView(
  isPreview: boolean,
  id: string,
): Promise<void> {
  if (isPreview) return;
  await api().delete({ id });
}
