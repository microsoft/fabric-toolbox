import { describe, expect, it } from "vitest";
import { createFindingExplainer, formatPriority, sortByPriority } from "./finding-priority";
import type { GovernanceFinding } from "./governance";
import type { Edge, Item } from "./model";

const item = (fabricId: string, endorsement: Item["endorsement"] = "none") =>
  ({ fabricId, displayName: fabricId.toUpperCase(), endorsement }) as Item;
const edge = (source: string, target: string): Edge => ({ source, target, relation: "feeds" }) as Edge;
const finding = (id: string, severity: GovernanceFinding["severity"], itemId?: string): GovernanceFinding => ({
  id,
  severity,
  category: "metadata",
  title: id,
  detail: id,
  recommendation: `fix ${id}`,
  evidenceIds: [`item:${itemId}`],
  itemId,
});

const data = {
  workspace: { syncedAt: "2026-10-01T00:00:00Z" },
  items: [item("lh", "certified"), item("sm"), item("rpt"), item("leaf", "promoted")],
  edges: [edge("lh", "sm"), edge("sm", "rpt")],
};

describe("finding priority", () => {
  it("multiplies severity, downstream impact and endorsement", () => {
    const explain = createFindingExplainer(data);
    const lake = explain(finding("a:lh", "medium", "lh"));
    expect(lake.priority).toEqual({
      severityWeight: 2,
      downstreamCount: 2,
      impactFactor: 3,
      endorsement: "certified",
      endorsementFactor: 2,
      score: 12,
    });
    expect(lake.downstream.map((entry) => entry.fabricId)).toEqual(["rpt", "sm"]);
    expect(lake.snapshotAt).toBe("2026-10-01T00:00:00Z");
    expect(lake.recommendation).toBe("fix a:lh");
    expect(formatPriority(lake.priority)).toBe(
      "2 severity × 3 impact (1 + 2 downstream) × 2 endorsement = 12",
    );
  });

  it("keeps non-item findings at their severity weight", () => {
    const explain = createFindingExplainer(data);
    expect(explain(finding("p:x", "high")).priority).toMatchObject({ score: 4, endorsement: "n/a", downstreamCount: 0 });
  });

  it("is deterministic and sorts the queue by priority", () => {
    const explain = createFindingExplainer(data);
    const findings = [
      finding("a:leaf", "high", "leaf"),
      finding("b:lh", "medium", "lh"),
      finding("c:rpt", "high", "rpt"),
      finding("d:x", "high"),
    ];
    const sorted = sortByPriority(findings, explain).map((entry) => entry.id);
    expect(sorted).toEqual(["b:lh", "a:leaf", "c:rpt", "d:x"]);
    expect(sortByPriority(findings, createFindingExplainer(data)).map((entry) => entry.id)).toEqual(sorted);
  });
});
