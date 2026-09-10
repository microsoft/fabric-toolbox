import type { SavedViewFilters, SavedViewSection } from "./saved-views";
import type { SearchResult } from "./search";
import type { AssetObjectKind } from "./catalog-objects";

export type Tab =
  | "overview"
  | "map"
  | "catalog"
  | "assets"
  | "governance"
  | "access"
  | "jobs"
  | "workspace"
  | "about";

export type GovernanceSection =
  | "findings"
  | "changes"
  | "history"
  | "coverage"
  | "posture";

export interface AtlasFocusRequest {
  requestId: string;
  itemId?: string;
  principalId?: string;
  commentId?: string;
  jobId?: string;
  tableName?: string;
  objectName?: string;
  objectId?: string;
  objectKind?: AssetObjectKind;
  workspaceSection?: "configuration" | "notes";
  governanceSection?: GovernanceSection;
  query?: string;
  filters?: SavedViewFilters;
}

export interface AtlasNavigation {
  tab: Tab;
  focus?: AtlasFocusRequest;
}

function request(
  values: Omit<AtlasFocusRequest, "requestId">,
): AtlasFocusRequest {
  return { requestId: crypto.randomUUID(), ...values };
}

export function navigationForSearch(result: SearchResult): AtlasNavigation {
  const target = result.target;
  if (target.objectKind) {
    return {
      tab: "assets",
      focus: request({
        itemId: target.itemId,
        tableName: target.tableName,
        objectName: target.objectName ?? result.title,
        objectId: target.objectId,
        objectKind: target.objectKind,
        query: result.title,
      }),
    };
  }
  switch (target.kind) {
    case "workspace":
      return { tab: "overview" };
    case "item":
      return {
        tab: "catalog",
        focus: request({ itemId: target.itemId, query: result.title }),
      };
    case "table":
    case "view":
    case "column":
    case "measure":
      return {
        tab: "assets",
        focus: request({
          itemId: target.itemId,
          tableName: target.tableName,
          objectName: target.objectName ?? result.title,
          objectKind: target.kind as AssetObjectKind,
          query: result.title,
        }),
      };
    case "principal":
      return {
        tab: "access",
        focus: request({
          principalId: target.principalId,
          query: result.title,
        }),
      };
    case "comment":
      return {
        tab: "workspace",
        focus: request({
          itemId: target.itemId,
          commentId: target.commentId,
          workspaceSection: "notes",
          query: result.title,
        }),
      };
    case "config":
      return {
        tab: "workspace",
        focus: request({
          itemId: target.itemId,
          workspaceSection: "configuration",
          query: result.title,
        }),
      };
    case "job":
      return {
        tab: "jobs",
        focus: request({
          itemId: target.itemId,
          jobId: target.jobId,
          query: result.title,
        }),
      };
  }
}

export function navigationForSavedView(
  section: SavedViewSection,
  filters: SavedViewFilters,
): AtlasNavigation {
  const tab: Tab =
    section === "governance"
      ? "governance"
      : section === "access"
        ? "access"
        : section;
  return {
    tab,
    focus: request({
      governanceSection:
        section === "governance" &&
        typeof filters.section === "string"
          ? (filters.section as GovernanceSection)
          : undefined,
      filters,
    }),
  };
}
