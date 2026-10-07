import type {
  GovernanceCategory,
  GovernanceFinding,
  GovernanceSeverity,
} from "./governance";

/** One governance rule with every finding it raised in the snapshot. */
export interface FindingGroup {
  rule: string;
  label: string;
  severity: GovernanceSeverity;
  category: GovernanceCategory;
  recommendation: string;
  findings: GovernanceFinding[];
}

const RULE_LABEL: Record<string, string> = {
  "external-access": "External access",
  "broad-access": "Broad access",
  "item-only-access": "Item-only access",
  "service-principal-access": "Service principal access",
  "excess-workspace-admins": "Excess workspace administrators",
  "failing-item": "Failing items",
  "stale-item": "Stale items",
  "missing-owner": "Missing owner",
  "missing-sensitivity": "Missing sensitivity label",
  "failed-job": "Failed jobs",
  "broken-lineage": "Broken lineage relationships",
};

const SEVERITY_RANK: Record<GovernanceSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Finding ids start with their rule key (`rule:part:part`). */
export function findingRule(finding: Pick<GovernanceFinding, "id">): string {
  const separator = finding.id.indexOf(":");
  return separator > 0 ? finding.id.slice(0, separator) : finding.id;
}

export function groupFindingsByRule(
  findings: readonly GovernanceFinding[],
): FindingGroup[] {
  const groups = new Map<string, FindingGroup>();
  for (const finding of findings) {
    const rule = findingRule(finding);
    const group = groups.get(rule);
    if (!group) {
      groups.set(rule, {
        rule,
        label: RULE_LABEL[rule] ?? finding.title,
        severity: finding.severity,
        category: finding.category,
        recommendation: finding.recommendation,
        findings: [finding],
      });
      continue;
    }
    group.findings.push(finding);
    if (SEVERITY_RANK[finding.severity] < SEVERITY_RANK[group.severity]) {
      group.severity = finding.severity;
    }
  }
  return [...groups.values()];
}
