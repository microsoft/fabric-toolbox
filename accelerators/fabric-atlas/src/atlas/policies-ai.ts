import type { AtlasData, Item } from "./model";
import type { HistoricalSnapshot, SnapshotCatalog } from "./history";
import {
  parseDataAgentMetadata, type DataAgentSourceMetadata,
} from "./item-metadata";

export const POLICIES_AI_LIMITATION =
  "Collected metadata and configured source selections do not establish AI exposure, AI safety or compliance. Unknown exposure is not the same as not exposed.";
export const WATCHLIST_BLOCKER =
  "Watchlists (#38) are unavailable: this build has no user-scoped Watchlist entity or persistence service. Personal saved views remain available.";
export const SYNC_BRIEF_BLOCKER =
  "Sync Brief (#40) is unavailable: this build has no validated-snapshot brief generator. The existing Change Center can inspect actual historical evidence.";

export interface AiInventoryRow {
  item: Item;
  owner: string;
  sensitivity: string;
  endorsement: string;
  lineage: string;
  exposure: "unknown";
  selections: "observed" | "observed-empty" | "unavailable" | "not-applicable";
  sources: DataAgentSourceMetadata[];
  snapshotId?: string;
  catalogCollectedAt?: string;
  provenance: string;
}
const FAMILIES = new Set(["DataAgent", "SemanticModel", "Ontology", "GraphModel"]);
function text(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}
function agentSources(catalog: SnapshotCatalog, itemId: string): DataAgentSourceMetadata[] | undefined {
  const metadata = catalog.itemMetadata?.[itemId];
  return metadata?.kind === "dataAgent" ? parseDataAgentMetadata(metadata)?.sources : undefined;
}

export function buildAiGovernanceInventory(data: AtlasData): AiInventoryRow[] {
  const referenced = new Set<string>();
  for (const item of data.items.filter((candidate) => candidate.itemType === "DataAgent")) {
    for (const source of agentSources(data, item.fabricId) ?? []) {
      if (!source.workspaceId || source.workspaceId === data.workspace.fabricId) referenced.add(source.artifactId);
    }
  }
  return data.items.filter((item) => FAMILIES.has(item.itemType) || referenced.has(item.fabricId))
    .map((item): AiInventoryRow => {
      const sources = item.itemType === "DataAgent" ? agentSources(data, item.fabricId) : undefined;
      const edges = data.edges.filter((edge) => edge.source === item.fabricId || edge.target === item.fabricId);
      const label = text(item.sensitivity) ?? (item.sensitivityLabelId ? `Recorded label ID: ${item.sensitivityLabelId}` : undefined);
      return {
        item,
        owner: text(item.ownerName) ?? text(item.ownerEmail) ??
          (item.ownerMetadataAvailable === false ? "Not collected" : "Unknown"),
        sensitivity: label ?? (item.sensitivityMetadataAvailable === true ? "No label recorded" : "Not collected"),
        endorsement: item.endorsementMetadataAvailable === false ? "Not collected" :
          item.endorsement !== "none" ? item.endorsement :
          item.endorsementMetadataAvailable === true ? "No endorsement recorded" : "Unknown",
        lineage: edges.length ? `${edges.length} observed item-level edges; completeness not established` :
          data.workspace.syncSections?.lineage?.status === "complete"
            ? "No item-level edges in collected snapshot; other lineage remains unknown" : "Not collected",
        exposure: "unknown",
        selections: item.itemType !== "DataAgent" ? "not-applicable" :
          sources === undefined ? "unavailable" : sources.length ? "observed" : "observed-empty",
        sources: sources ?? [],
        snapshotId: data.workspace.snapshotId,
        catalogCollectedAt: data.workspace.syncedAt,
        provenance: item.itemType === "DataAgent" && sources !== undefined
          ? "Normalized Data Agent definition metadata in the published catalog snapshot"
          : "Published catalog metadata; no AI exposure collector",
      };
    })
    .sort((left, right) => left.item.displayName.localeCompare(right.item.displayName) ||
      left.item.fabricId.localeCompare(right.item.fabricId));
}

export interface SourceSelectionDifference {
  id: string;
  agentId: string;
  agentName: string;
  type: "source-added" | "source-removed" | "selection-added" | "selection-removed";
  sourceId: string;
  sourceWorkspaceId?: string;
  elementId?: string;
  label: string;
}
export type SourceSelectionComparison =
  | { state: "unavailable"; reason: string; differences: SourceSelectionDifference[]; unavailableAgents: string[] }
  | {
      state: "ready"; previousSnapshotId: string; currentSnapshotId: string;
      previousCollectedAt: string; currentCollectedAt: string;
      differences: SourceSelectionDifference[]; unavailableAgents: string[];
    };

function sourceKey(source: DataAgentSourceMetadata): string {
  return JSON.stringify([source.workspaceId ?? "workspace-unknown", source.artifactId]);
}
function elementKey(element: DataAgentSourceMetadata["selectedElements"][number]): string {
  return JSON.stringify([element.elementType, element.parentId ?? "", element.id]);
}
function stableSelections(sources: DataAgentSourceMetadata[]): boolean {
  return sources.every((source) => source.selectedElements.every((element) =>
    !!element.parentId || element.parentPath.length === 0,
  ));
}
function published(snapshot: HistoricalSnapshot): boolean {
  return !!snapshot.snapshotId && snapshot.catalog.workspace.snapshotId === snapshot.snapshotId &&
    !!snapshot.catalog.workspace.syncedAt && Number.isFinite(Date.parse(snapshot.syncedAt));
}

export function compareAgentSourceSelections(
  previous: HistoricalSnapshot | undefined, current: HistoricalSnapshot | undefined,
): SourceSelectionComparison {
  const unavailable = (reason: string): SourceSelectionComparison => ({
    state: "unavailable", reason, differences: [], unavailableAgents: [],
  });
  if (!previous || !current) return unavailable("Two loaded, validated snapshots are required.");
  if (!published(previous) || !published(current) ||
    previous.snapshotId === current.snapshotId ||
    previous.catalog.workspace.fabricId !== current.catalog.workspace.fabricId ||
    Date.parse(previous.syncedAt) >= Date.parse(current.syncedAt)) {
    return unavailable("Published snapshot identity, workspace or chronological evidence is unavailable.");
  }
  if (previous.catalog.workspace.syncSections?.definitions?.status !== "complete" ||
    current.catalog.workspace.syncSections?.definitions?.status !== "complete") {
    return unavailable("Definition collection completeness is not recorded for both snapshots.");
  }
  if (previous.catalog.workspace.deploymentId !== current.catalog.workspace.deploymentId) {
    return unavailable("The snapshots have different deployment provenance; projection parity is unverified.");
  }
  const differences: SourceSelectionDifference[] = [];
  const unavailableAgents: string[] = [];
  for (const agent of current.catalog.items.filter((item) => item.itemType === "DataAgent")) {
    const beforeItem = previous.catalog.items.find((item) => item.fabricId === agent.fabricId && item.itemType === "DataAgent");
    const before = beforeItem ? agentSources(previous.catalog, agent.fabricId) : undefined;
    const after = agentSources(current.catalog, agent.fabricId);
    if (!before || !after || !stableSelections(before) || !stableSelections(after)) {
      unavailableAgents.push(agent.fabricId);
      continue;
    }
    const oldSources = new Map(before.map((source) => [sourceKey(source), source]));
    const newSources = new Map(after.map((source) => [sourceKey(source), source]));
    const add = (type: SourceSelectionDifference["type"], source: DataAgentSourceMetadata,
      element?: DataAgentSourceMetadata["selectedElements"][number]) => differences.push({
        id: JSON.stringify([agent.fabricId, type, sourceKey(source), element ? elementKey(element) : ""]),
        agentId: agent.fabricId, agentName: agent.displayName, type, sourceId: source.artifactId,
        sourceWorkspaceId: source.workspaceId, elementId: element?.id,
        label: element?.displayName ?? source.displayName,
      });
    for (const [key, source] of oldSources) if (!newSources.has(key)) add("source-removed", source);
    for (const [key, source] of newSources) {
      const old = oldSources.get(key);
      if (!old) { add("source-added", source); continue; }
      const oldElements = new Map(old.selectedElements.map((element) => [elementKey(element), element]));
      const newElements = new Map(source.selectedElements.map((element) => [elementKey(element), element]));
      for (const [id, element] of oldElements) if (!newElements.has(id)) add("selection-removed", source, element);
      for (const [id, element] of newElements) if (!oldElements.has(id)) add("selection-added", source, element);
    }
  }
  return {
    state: "ready", previousSnapshotId: previous.snapshotId, currentSnapshotId: current.snapshotId,
    previousCollectedAt: previous.syncedAt, currentCollectedAt: current.syncedAt,
    differences: differences.sort((left, right) => left.id.localeCompare(right.id)), unavailableAgents,
  };
}
