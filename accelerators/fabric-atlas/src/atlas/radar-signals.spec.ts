import { describe, expect, it } from "vitest";
import type { GovernanceCategory, GovernanceSeverity } from "./governance";
import type { IncidentDelta } from "./observability";
import type { FindingDelta, RadarEntry, RadarRiskKind, RiskyChange } from "./radar";
import {
  groupRadarSignals,
  radarReviewHeadline,
  radarSignalOf,
} from "./radar-signals";

function riskEntry(
  id: string,
  kind: RadarRiskKind,
  severity: "critical" | "high",
): RadarEntry {
  return {
    id,
    severity,
    title: id,
    detail: `${kind} detail`,
    risk: { id, kind, severity, detail: "" } as unknown as RiskyChange,
  };
}

function findingEntry(
  id: string,
  category: GovernanceCategory,
  severity: GovernanceSeverity = "high",
): RadarEntry {
  return {
    id,
    severity,
    title: id,
    detail: "finding detail",
    delta: { finding: { id, category, severity } } as unknown as FindingDelta,
  };
}

function incidentEntry(id: string, severity: "critical" | "high"): RadarEntry {
  return {
    id,
    severity,
    title: id,
    detail: "incident detail",
    incident: {} as IncidentDelta,
  };
}

describe("groupRadarSignals", () => {
  it("groups real entries by signal with their exact counts", () => {
    const groups = groupRadarSignals([
      riskEntry("grant-a", "external-grant-added", "high"),
      riskEntry("grant-b", "external-grant-added", "high"),
      riskEntry("broken", "lineage-broken", "critical"),
      incidentEntry("failure", "high"),
    ]);

    expect(groups.map((group) => [group.id, group.entries.length])).toEqual([
      ["lineage-broken", 1],
      ["external-grant-added", 2],
      ["job-failure", 1],
    ]);
    expect(groups[0]).toMatchObject({
      title: "Lineage broken",
      summary: "1 relationship became broken",
      severity: "critical",
    });
    expect(groups[1]).toMatchObject({
      title: "New external grants",
      summary: "2 grants to external principals",
      severity: "high",
    });
    expect(groups[2]).toMatchObject({
      title: "New job failure",
      summary: "1 item failing since the last sync",
    });
  });

  it("orders groups by their most severe entry before the fixed signal order", () => {
    const groups = groupRadarSignals([
      riskEntry("grant", "external-grant-added", "high"),
      incidentEntry("observed-impact", "critical"),
      incidentEntry("inferred-impact", "high"),
      riskEntry("removed", "consumed-item-removed", "critical"),
    ]);

    expect(groups.map((group) => group.id)).toEqual([
      "consumed-item-removed",
      "job-failure",
      "external-grant-added",
    ]);
    expect(groups[1]).toMatchObject({
      severity: "critical",
      title: "New job failures",
    });
  });

  it("splits new findings by governance category", () => {
    const groups = groupRadarSignals([
      findingEntry("access-1", "access", "critical"),
      findingEntry("ops-1", "operations"),
      findingEntry("ops-2", "operations"),
    ]);

    expect(groups.map((group) => [group.id, group.title, group.summary])).toEqual([
      ["finding-access", "New access finding", "1 high-priority finding"],
      ["finding-operations", "New operations findings", "2 high-priority findings"],
    ]);
  });

  it("keeps entries without a known source visible instead of guessing a signal", () => {
    const orphan: RadarEntry = {
      id: "orphan",
      severity: "high",
      title: "Orphan",
      detail: "",
    };
    expect(radarSignalOf(orphan)).toBe("other");
    expect(groupRadarSignals([orphan])).toEqual([
      {
        id: "other",
        title: "Other review items",
        summary: "1 item to review",
        severity: "high",
        entries: [orphan],
      },
    ]);
  });
});

describe("radarReviewHeadline", () => {
  it("states the exact number of entries to review", () => {
    expect(radarReviewHeadline(0)).toBe("No change needs review");
    expect(radarReviewHeadline(1)).toBe("1 change needs review");
    expect(radarReviewHeadline(3)).toBe("3 changes need review");
  });
});
