import { describe, expect, it } from "vitest";
import type { GovernanceFinding } from "./governance";
import { findingRule, groupFindingsByRule } from "./finding-groups";

function finding(id: string, severity: GovernanceFinding["severity"]): GovernanceFinding {
  return {
    id,
    severity,
    category: "access",
    title: `Title ${id}`,
    detail: "Detail",
    recommendation: `Fix ${findingRule({ id })}`,
    evidenceIds: [],
  };
}

describe("finding groups", () => {
  it("groups findings by rule, keeps first-seen order and raises severity to the highest instance", () => {
    const groups = groupFindingsByRule([
      finding("external-access:item-a:principal", "high"),
      finding("service-principal-access:item-a:svc", "medium"),
      finding("service-principal-access:item-b:svc", "medium"),
      finding("failing-item:item-c", "critical"),
      finding("stale-item:item-d", "medium"),
      finding("custom-rule", "low"),
    ]);

    expect(groups.map((group) => [group.label, group.findings.length])).toEqual([
      ["External access", 1],
      ["Service principal access", 2],
      ["Failing items", 1],
      ["Stale items", 1],
      ["Title custom-rule", 1],
    ]);
    expect(groups[1].recommendation).toBe("Fix service-principal-access");
  });

  it("uses the most severe instance for the group severity", () => {
    const [group] = groupFindingsByRule([
      finding("broken-lineage:a", "low"),
      finding("broken-lineage:b", "critical"),
    ]);
    expect(group.severity).toBe("critical");
  });
});
