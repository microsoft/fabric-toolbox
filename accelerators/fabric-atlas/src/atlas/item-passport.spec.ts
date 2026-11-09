import { describe, expect, it } from "vitest";
import type { GovernanceFinding } from "./governance";
import { itemFindings, itemPassportMarkdown, scoutItemQuestion } from "./item-passport";
import { SAMPLE_DATA, type AtlasData, type Item } from "./model";

const base: Item = {
  fabricId: "item-a",
  displayName: "Sales | Gold",
  itemType: "Lakehouse",
  health: "healthy",
  endorsement: "none",
  tags: [],
};

function data(overrides: Partial<AtlasData> = {}): AtlasData {
  return {
    ...SAMPLE_DATA,
    items: [base, { ...base, fabricId: "item-b", displayName: "Sales report", itemType: "Report" }],
    edges: [{ source: "item-a", target: "item-b", relation: "feeds" }],
    grants: [],
    jobs: [],
    principals: [],
    ...overrides,
  };
}

const finding = (id: string, severity: GovernanceFinding["severity"], itemId?: string): GovernanceFinding => ({
  id,
  severity,
  category: "metadata",
  title: `Finding ${id}`,
  detail: "",
  recommendation: "Fix it.",
  evidenceIds: [],
  itemId,
});

describe("itemFindings", () => {
  it("keeps findings that target the item, most severe first", () => {
    const result = itemFindings(
      [
        finding("low", "low", "item-a"),
        finding("other", "critical", "item-b"),
        finding("high", "high", "item-a"),
        { ...finding("target", "medium"), target: { kind: "item", itemId: "item-a" } },
      ],
      "item-a",
    );
    expect(result.map((entry) => entry.id)).toEqual(["high", "target", "low"]);
  });
});

describe("itemPassportMarkdown", () => {
  it("returns null for an unknown item", () => {
    expect(itemPassportMarkdown(data(), "missing", { findings: [] })).toBeNull();
  });

  it("writes missing evidence as not collected or none, never as zero", () => {
    const md = itemPassportMarkdown(
      data({
        items: [
          { ...base, ownerMetadataAvailable: false, sensitivityMetadataAvailable: false, tagMetadataAvailable: false },
        ],
        edges: [],
      }),
      "item-a",
      { findings: [] },
    )!;
    expect(md).toContain("- Documented owner: Not collected");
    expect(md).toContain("- Sensitivity: Not collected");
    expect(md).toContain("- Tags: Not collected");
    expect(md).toContain("## Lineage (0 upstream · 0 downstream)\n\nNone recorded.");
    expect(md).toContain("No item-level grants recorded");
    expect(md).toContain("No findings target this item.");
  });

  it("lists lineage, grants, findings and the latest jobs with escaped cells", () => {
    const md = itemPassportMarkdown(
      data({
        principals: [{ principalId: "p1", displayName: "Ana", kind: "user", workspaceRole: "Viewer" }],
        grants: [{ itemFabricId: "item-a", principalRef: "p1", accessLevel: "view", source: "directShare", flag: "external" }],
        jobs: Array.from({ length: 7 }, (_, index) => ({
          itemFabricId: "item-a",
          itemName: "Sales | Gold",
          jobType: "Refresh",
          status: "completed" as const,
          startedAt: `2026-05-0${index + 1}T00:00:00Z`,
          durationSec: 10,
        })),
      }),
      "item-a",
      { findings: [finding("f1", "high", "item-a")], generatedAt: "2026-05-10" },
    )!;
    expect(md.startsWith("# Sales | Gold — identity sheet")).toBe(true);
    expect(md).toContain("| Downstream | Sales report | Report | feeds |");
    expect(md).toContain("| Ana | view (external) | directShare |");
    expect(md).toContain("- **HIGH** — Finding f1. Fix it.");
    expect(md.match(/\| Refresh \|/g)).toHaveLength(5);
    expect(md).toContain("2026-05-07T00:00:00Z");
    expect(md).not.toContain("2026-05-02T00:00:00Z");
  });
});

describe("scoutItemQuestion", () => {
  it("names the item, its type and its Fabric ID", () => {
    expect(scoutItemQuestion(base)).toContain('Lakehouse "Sales | Gold" (Fabric ID item-a)');
  });
});
