import type { GovernanceFinding, GovernanceSeverity } from "./governance";
import { createLineageIndex, getLineageImpact, type LineageIndex } from "./lineage";
import type { AtlasData, Endorsement, Item } from "./model";

/**
 * Priority = severity weight × impact factor × endorsement factor.
 * impact factor = 1 + downstream items (capped at IMPACT_CAP) so a finding on a
 * leaf item keeps its severity weight. Every input is shown in the Why panel.
 */
export const SEVERITY_WEIGHT: Record<GovernanceSeverity, number> = {
  critical: 8,
  high: 4,
  medium: 2,
  low: 1,
};
export const ENDORSEMENT_FACTOR: Record<Endorsement, number> = {
  certified: 2,
  promoted: 1.5,
  none: 1,
};
export const IMPACT_CAP = 10;

export interface FindingPriority {
  severityWeight: number;
  downstreamCount: number;
  impactFactor: number;
  endorsement: Endorsement | "n/a";
  endorsementFactor: number;
  score: number;
}

export interface FindingExplanation {
  priority: FindingPriority;
  evidence: string[];
  snapshotAt?: string;
  subject?: Item;
  downstream: Item[];
  recommendation: string;
}

export type FindingPriorityData = Pick<AtlasData, "items" | "edges"> & {
  workspace?: Pick<AtlasData["workspace"], "syncedAt">;
};

function subjectItemId(finding: GovernanceFinding, index: LineageIndex): string | undefined {
  if (finding.itemId) return finding.itemId;
  if (finding.target?.itemId) return finding.target.itemId;
  const edgeKey = finding.edgeKey ?? finding.target?.edgeKey;
  if (edgeKey) return index.entries.find((entry) => entry.key === edgeKey)?.edge.target;
  return undefined;
}

export function createFindingExplainer(data: FindingPriorityData) {
  const index = createLineageIndex(data.edges);
  const itemById = new Map(data.items.map((item) => [item.fabricId, item]));
  return (finding: GovernanceFinding): FindingExplanation => {
    const itemId = subjectItemId(finding, index);
    const subject = itemId ? itemById.get(itemId) : undefined;
    const downstream = itemId
      ? [...getLineageImpact(index, itemId).downstream.ids]
          .map((id) => itemById.get(id))
          .filter((item): item is Item => Boolean(item))
          .sort((left, right) => left.displayName.localeCompare(right.displayName))
      : [];
    const severityWeight = SEVERITY_WEIGHT[finding.severity];
    const impactFactor = 1 + Math.min(downstream.length, IMPACT_CAP);
    const endorsement = subject?.endorsement ?? "n/a";
    const endorsementFactor = subject ? ENDORSEMENT_FACTOR[subject.endorsement] : 1;
    return {
      priority: {
        severityWeight,
        downstreamCount: downstream.length,
        impactFactor,
        endorsement,
        endorsementFactor,
        score: severityWeight * impactFactor * endorsementFactor,
      },
      evidence: finding.evidenceIds,
      snapshotAt: data.workspace?.syncedAt,
      subject,
      downstream,
      recommendation: finding.recommendation,
    };
  };
}

/** Stable sort: highest priority first, then the existing severity order. */
export function sortByPriority<T extends GovernanceFinding>(
  findings: readonly T[],
  explain: (finding: T) => FindingExplanation,
): T[] {
  const scores = new Map(findings.map((finding) => [finding.id, explain(finding).priority.score]));
  return findings
    .map((finding, ordinal) => ({ finding, ordinal }))
    .sort(
      (left, right) =>
        (scores.get(right.finding.id) ?? 0) - (scores.get(left.finding.id) ?? 0) ||
        left.ordinal - right.ordinal,
    )
    .map(({ finding }) => finding);
}

/** P1 ≥ 16 (e.g. high × 2 downstream × certified), P2 ≥ 4, otherwise P3. */
export function priorityTier(score: number): "P1" | "P2" | "P3" {
  return score >= 16 ? "P1" : score >= 4 ? "P2" : "P3";
}

export function formatPriority(priority: FindingPriority): string {
  return `${priority.severityWeight} severity × ${priority.impactFactor} impact (1 + ${Math.min(priority.downstreamCount, IMPACT_CAP)} downstream) × ${priority.endorsementFactor} endorsement = ${priority.score}`;
}
