import type { ItemRelationFlow } from "./item-relations-evidence";

// Graph toggles split relationships into data-flow and control relations.
// Snapshot labels come from Atlas normalization; Beta flows come from the
// documented Item Relations family. Association and unknown Beta relations
// are dependencies, so they follow the data-flow toggle and keep their own
// "unverified" labelling elsewhere.

export type RelationFamily = "data" | "control";

const CONTROL_SNAPSHOT_RELATIONS = new Set([
  "orchestrates",
  "endpoint",
  "sql endpoint",
  "database",
  "default db",
  "kql database",
]);

export function snapshotRelationFamily(relation: string): RelationFamily {
  return CONTROL_SNAPSHOT_RELATIONS.has(relation.trim().toLowerCase())
    ? "control"
    : "data";
}

export function previewRelationFamily(flow: ItemRelationFlow): RelationFamily {
  return flow === "control" || flow === "lifecycle" ? "control" : "data";
}
