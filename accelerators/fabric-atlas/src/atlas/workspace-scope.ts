import { getRayfinClient } from "@/lib/rayfin-client";
import { ATLAS_CONFIG } from "./config";
import { SAMPLE_DATA } from "./model";

const MAX_SCOPE_WORKSPACES = 2_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface WorkspaceScopeUser {
  id: string;
  email?: string;
}

export interface WorkspaceScope {
  id: string;
  displayName: string;
  workspaceType?: string;
  capacityId?: string;
  selectedAt?: string;
  persisted: boolean;
}

export interface WorkspaceDiscovery {
  workspaces: Omit<WorkspaceScope, "selectedAt" | "persisted">[];
  truncated: boolean;
}

interface ScopeRow {
  id: string;
  displayName: string;
  workspaceType?: string;
  capacityId?: string;
  writerEmail?: string;
  selectedAt?: string | Date;
}

interface ScopeQuery {
  orderBy: (order: { displayName: "asc" }) => ScopeQuery;
  first: (count: number) => ScopeQuery;
  execute: () => Promise<ScopeRow[]>;
}

interface ScopeApi {
  select: (fields: readonly string[]) => ScopeQuery;
  findById: (id: string) => Promise<ScopeRow | null>;
  create: (row: ScopeRow) => Promise<ScopeRow>;
  update: (where: { id: string }, row: Partial<ScopeRow>) => Promise<unknown>;
  delete: (where: { id: string }) => Promise<unknown>;
}

interface SharedScopeQuery {
  where: (filter: Record<string, { eq: string }>) => SharedScopeQuery;
  first: (count: number) => SharedScopeQuery;
  execute: () => Promise<{ id: string }[]>;
}

interface SharedScopeApi {
  select: (fields: readonly ["id"]) => SharedScopeQuery;
}

const SHARED_WORKSPACE_ENTITIES = [
  ["Workspace", "fabricId"],
  ["FabricItem", "workspace_id"],
  ["LineageEdge", "workspace_id"],
  ["Principal", "workspace_id"],
  ["AccessGrant", "workspace_id"],
  ["JobRun", "workspace_id"],
  ["ConfigEntry", "workspace_id"],
  ["Comment", "workspace_id"],
  ["SyncRun", "workspace_id"],
  ["GovernancePolicy", "workspace_id"],
  ["GovernanceException", "workspace_id"],
  ["SyncJob", "workspace_id"],
  ["AccessPolicyEvidence", "workspace_id"],
] as const;

function scopeApi(): ScopeApi {
  return getRayfinClient().data.WorkspaceScope as unknown as ScopeApi;
}

async function workspaceHasSharedData(id: string): Promise<boolean> {
  const data = getRayfinClient().data as unknown as Record<
    string,
    SharedScopeApi
  >;
  const rows = await Promise.all(
    SHARED_WORKSPACE_ENTITIES.map(([entity, field]) =>
      data[entity]
        .select(["id"])
        .where({ [field]: { eq: id } })
        .first(1)
        .execute(),
    ),
  );
  return rows.some((records) => records.length > 0);
}

function workspaceId(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    throw new Error("Workspace scope requires a valid Fabric workspace ID.");
  }
  return value.trim().toLowerCase();
}

function boundedText(
  value: unknown,
  max: number,
  label: string,
): string {
  if (typeof value !== "string") {
    throw new Error(`${label} is required.`);
  }
  const text = value.trim();
  if (!text || text.length > max) {
    throw new Error(`${label} must contain between 1 and ${max} characters.`);
  }
  return text;
}

function optionalText(
  value: unknown,
  max: number,
  label: string,
): string | undefined {
  if (value == null || value === "") return undefined;
  return boundedText(value, max, label);
}

function normalizeScope(
  value: {
    id: unknown;
    displayName: unknown;
    workspaceType?: unknown;
    capacityId?: unknown;
    selectedAt?: unknown;
  },
  persisted: boolean,
): WorkspaceScope {
  let selectedAt: string | undefined;
  if (value.selectedAt != null) {
    const date = new Date(value.selectedAt as string | Date);
    if (Number.isNaN(date.getTime())) {
      throw new Error("Workspace scope contains an invalid selection date.");
    }
    selectedAt = date.toISOString();
  } else if (persisted) {
    throw new Error("Workspace scope is missing its selection date.");
  }
  return {
    id: workspaceId(value.id),
    displayName: boundedText(value.displayName, 200, "Workspace name"),
    workspaceType: optionalText(value.workspaceType, 80, "Workspace type"),
    capacityId:
      value.capacityId == null ? undefined : workspaceId(value.capacityId),
    selectedAt,
    persisted,
  };
}

function fallbackScope(isPreview: boolean): WorkspaceScope {
  const workspace = isPreview
    ? SAMPLE_DATA.workspace
    : {
        fabricId: ATLAS_CONFIG.workspaceId,
        displayName: ATLAS_CONFIG.workspaceName,
      };
  return normalizeScope(
    {
      id: workspace.fabricId,
      displayName: workspace.displayName,
      workspaceType: "Workspace",
    },
    false,
  );
}

function requireScopeAdministrator(user: WorkspaceScopeUser): string {
  if (
    !user.id.trim() ||
    user.id.trim() !== ATLAS_CONFIG.syncAdminSubject.trim()
  ) {
    throw new Error(
      "Only the configured Atlas administrator can manage workspace scope.",
    );
  }
  const email = user.email?.trim().toLowerCase();
  if (!email || email !== ATLAS_CONFIG.syncAdminEmail.trim().toLowerCase()) {
    throw new Error(
      "The configured Atlas administrator email is required to manage workspace scope.",
    );
  }
  return email;
}

export async function loadWorkspaceScopes(
  isPreview: boolean,
): Promise<WorkspaceScope[]> {
  if (isPreview) return [fallbackScope(true)];
  const rows = await scopeApi()
    .select([
      "id",
      "displayName",
      "workspaceType",
      "capacityId",
      "selectedAt",
    ])
    .orderBy({ displayName: "asc" })
    .first(MAX_SCOPE_WORKSPACES + 1)
    .execute();
  if (rows.length > MAX_SCOPE_WORKSPACES) {
    throw new Error("Workspace scope exceeded the supported selection limit.");
  }
  if (rows.length === 0) return [fallbackScope(false)];
  return rows.map((row) => normalizeScope(row, true));
}

export async function discoverWorkspaces(
  isPreview: boolean,
  user: WorkspaceScopeUser,
): Promise<WorkspaceDiscovery> {
  if (isPreview) {
    const workspace = fallbackScope(true);
    return {
      workspaces: [
        {
          id: workspace.id,
          displayName: workspace.displayName,
          workspaceType: workspace.workspaceType,
          capacityId: workspace.capacityId,
        },
      ],
      truncated: false,
    };
  }
  requireScopeAdministrator(user);
  const result = await getRayfinClient().functions.workspaceDiscover.invoke();
  if (
    result.contractVersion !== 1 ||
    !Array.isArray(result.workspaces) ||
    typeof result.truncated !== "boolean"
  ) {
    throw new Error("Workspace discovery returned an invalid contract.");
  }
  return {
    workspaces: result.workspaces.map((workspace) => {
      const normalized = normalizeScope(workspace, false);
      return {
        id: normalized.id,
        displayName: normalized.displayName,
        workspaceType: normalized.workspaceType,
        capacityId: normalized.capacityId,
      };
    }),
    truncated: result.truncated,
  };
}

async function persistConfiguredFallback(
  api: ScopeApi,
  writerEmail: string,
  targetWorkspaceId: string,
): Promise<void> {
  const configured = fallbackScope(false);
  if (configured.id === targetWorkspaceId) return;
  if (await api.findById(configured.id)) return;
  await api.create({
    id: configured.id,
    displayName: configured.displayName,
    workspaceType: configured.workspaceType,
    capacityId: configured.capacityId,
    writerEmail,
    selectedAt: new Date(),
  });
}

export async function addWorkspaceScope(
  isPreview: boolean,
  user: WorkspaceScopeUser,
  workspace: Omit<WorkspaceScope, "selectedAt" | "persisted">,
): Promise<WorkspaceScope> {
  const normalized = normalizeScope(workspace, false);
  if (isPreview) return normalized;
  const writerEmail = requireScopeAdministrator(user);
  const api = scopeApi();
  await persistConfiguredFallback(api, writerEmail, normalized.id);
  const selectedAt = new Date();
  const existing = await api.findById(normalized.id);
  const row: ScopeRow = {
    id: normalized.id,
    displayName: normalized.displayName,
    workspaceType: normalized.workspaceType,
    capacityId: normalized.capacityId,
    writerEmail,
    selectedAt,
  };
  if (existing) {
    await api.update(
      { id: normalized.id },
      {
        displayName: row.displayName,
        workspaceType: row.workspaceType,
        capacityId: row.capacityId,
        writerEmail,
        selectedAt,
      },
    );
  } else {
    await api.create(row);
  }
  return normalizeScope(row, true);
}

export async function removeWorkspaceScope(
  isPreview: boolean,
  user: WorkspaceScopeUser,
  id: string,
): Promise<void> {
  if (isPreview) return;
  requireScopeAdministrator(user);
  const targetId = workspaceId(id);
  const selected = await loadWorkspaceScopes(false);
  if (!selected.some((workspace) => workspace.id === targetId)) {
    throw new Error("Workspace scope entry was not found.");
  }
  if (selected.length <= 1) {
    throw new Error("At least one workspace must remain selected.");
  }
  if (await workspaceHasSharedData(targetId)) {
    throw new Error(
      "This workspace has shared Atlas data. Scope removal requires a reviewed archival and deletion workflow.",
    );
  }
  await scopeApi().delete({ id: targetId });
}
