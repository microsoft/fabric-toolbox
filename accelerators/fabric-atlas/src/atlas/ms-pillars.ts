import { findingRule } from "./finding-groups";
import type { GovernanceCategory } from "./governance";
import type { PosturePillar } from "./posture";

/**
 * The three OneLake catalog governance pillars (Govern tab). Atlas keeps its
 * own finer-grained pillars; this static mapping only lets a reader align
 * Atlas evidence with the vocabulary used in the Fabric portal.
 */
export type MicrosoftGovernancePillar = "health" | "protect" | "trust";

export const MICROSOFT_PILLAR_LABEL: Record<MicrosoftGovernancePillar, string> =
  {
    health: "Health",
    protect: "Protect",
    trust: "Trust",
  };

export const MICROSOFT_PILLAR_DESCRIPTION: Record<
  MicrosoftGovernancePillar,
  string
> = {
  health: "Operational reliability: refreshes, runs and freshness.",
  protect: "Who can access data and how it is classified.",
  trust: "Whether people can find, understand and rely on the data.",
};

const POSTURE_TO_MICROSOFT: Record<PosturePillar, MicrosoftGovernancePillar> = {
  documentation: "trust",
  ownership: "trust",
  lineage: "trust",
  sensitivity: "protect",
  access: "protect",
  operations: "health",
};

const CATEGORY_TO_MICROSOFT: Record<
  GovernanceCategory,
  MicrosoftGovernancePillar
> = {
  access: "protect",
  metadata: "trust",
  lineage: "trust",
  operations: "health",
};

/** Rules whose category is metadata but whose intent is protection. */
const PROTECT_RULES = new Set([
  "missing-sensitivity",
  "certified-missing-sensitivity",
  "domain-default-label-missing",
  "domain-default-label-below",
]);

export function microsoftPillarForPosture(
  pillar: PosturePillar,
): MicrosoftGovernancePillar {
  return POSTURE_TO_MICROSOFT[pillar];
}

export function microsoftPillarForFinding(finding: {
  id: string;
  category: GovernanceCategory;
}): MicrosoftGovernancePillar {
  return PROTECT_RULES.has(findingRule(finding))
    ? "protect"
    : CATEGORY_TO_MICROSOFT[finding.category];
}
