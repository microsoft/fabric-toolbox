import type { AtlasData, Edge, Item } from "@/atlas/model";
import { snapshotFromData, type HistoricalSnapshot } from "@/atlas/history";

export const FIXTURE_WORKSPACE = "11111111-1111-4111-8111-111111111111";

export function fixtureItem(
  fabricId: string,
  itemType: Item["itemType"],
  displayName: string,
  extra: Partial<Item> = {},
): Item {
  return {
    fabricId,
    itemType,
    displayName,
    health: "healthy",
    endorsement: "none",
    tags: [],
    ...extra,
  };
}

/** A validated-shape snapshot built from representative catalog fragments. */
export function fixtureSnapshot(
  snapshotId: string,
  syncedAt: string,
  data: Partial<
    Pick<AtlasData, "schema" | "jobs" | "grants" | "principals">
  > & {
    items: Item[];
    edges: Edge[];
  },
): HistoricalSnapshot {
  return snapshotFromData(
    {
      workspace: {
        fabricId: FIXTURE_WORKSPACE,
        displayName: "Sales analytics",
        capacity: "",
        region: "",
        snapshotId,
        syncedAt,
      },
      principals: [],
      grants: [],
      jobs: [],
      config: [],
      comments: [],
      syncRuns: [],
      ...data,
    } as AtlasData,
    snapshotId,
    syncedAt,
  );
}
