// Dated capability states for Phase 5 lineage depth. A capability is shown as
// available only when Atlas collects the evidence it needs; otherwise the UI
// states the gap instead of approximating it.

export type LineageCapabilityStatus = "available" | "partial" | "deferred";

export interface LineageCapability {
  id: string;
  title: string;
  status: LineageCapabilityStatus;
  decidedAt: string;
  evidence: string;
  limitation?: string;
}

export const LINEAGE_CAPABILITIES: readonly LineageCapability[] = [
  {
    id: "lineage-time-machine",
    title: "Lineage time machine",
    status: "available",
    decidedAt: "2026-10-02",
    evidence: "Two validated Atlas snapshots from retained history.",
    limitation:
      "Item-level only; needs at least two retained snapshots. Item Relations (Beta) evidence has no history.",
  },
  {
    id: "breaking-change-guard",
    title: "Breaking change guard",
    status: "available",
    decidedAt: "2026-10-02",
    evidence:
      "Snapshot comparison, historical item lineage and verified DAX dependencies of the earlier snapshot.",
    limitation: "Report visual field usage is not exposed by Fabric APIs and is never claimed.",
  },
  {
    id: "semantic-model-xray",
    title: "Semantic model X-Ray",
    status: "available",
    decidedAt: "2026-10-02",
    evidence: "Synchronized tables, columns, measures and measure DAX of the active snapshot.",
    limitation:
      "References that do not resolve to exactly one synchronized object are listed, not linked.",
  },
  {
    id: "cross-workspace-expansion",
    title: "Cross-workspace expansion",
    status: "partial",
    decidedAt: "2026-10-02",
    evidence: "Relations already present in persisted Item Relations (Beta) evidence.",
    limitation:
      "Live queries of external items are deferred: the collector is synchronizer-only, evidence envelopes are scoped to one workspace, and disclosure of unselected workspaces is not reviewed.",
  },
  {
    id: "ontology-metrics",
    title: "Ontology metrics",
    status: "deferred",
    decidedAt: "2026-10-02",
    evidence: "Collected Ontology definitions expose entity types, properties, relationships, bindings and contextualizations only.",
    limitation:
      "No metric fields have been verified in real definition payloads, so no metric or DAX-to-metric lineage is shown.",
  },
  {
    id: "ontology-inheritance",
    title: "Ontology entity inheritance",
    status: "deferred",
    decidedAt: "2026-10-02",
    evidence: "Collected Ontology definitions expose entity types, properties, relationships, bindings and contextualizations only.",
    limitation:
      "No base-type or inheritance fields have been verified, so inherited properties are not derived.",
  },
];

export function lineageCapability(id: string): LineageCapability | undefined {
  return LINEAGE_CAPABILITIES.find((capability) => capability.id === id);
}
