import { describe, expect, it } from "vitest";
import {
  analyzeBreakingChanges,
  breakingChangeBrief,
  severityFor,
} from "./breaking-changes";
import type { ModelTableSchema } from "./model";
import { fixtureItem, fixtureSnapshot } from "@/test/snapshot-fixtures";

const LAKEHOUSE = "aaaaaaaa-0000-4000-8000-000000000001";
const MODEL = "aaaaaaaa-0000-4000-8000-000000000002";
const REPORT = "aaaaaaaa-0000-4000-8000-000000000003";
const NOTEBOOK = "aaaaaaaa-0000-4000-8000-000000000004";
const WAREHOUSE = "aaaaaaaa-0000-4000-8000-000000000005";
const DASHBOARD = "aaaaaaaa-0000-4000-8000-000000000006";

function salesSchema(
  overrides: { amount?: boolean; qtyType?: string; margin?: string } = {},
): Record<string, ModelTableSchema[]> {
  return {
    [MODEL]: [
      {
        name: "Sales",
        columns: [
          ...(overrides.amount === false ? [] : [{ name: "Amount", dataType: "decimal" }]),
          { name: "Qty", dataType: overrides.qtyType ?? "int64" },
        ],
        measures: [
          { name: "Total", expr: "SUM('Sales'[Amount])" },
          { name: "Units", expr: "SUM(Sales[Qty])" },
          { name: "Margin", expr: overrides.margin ?? "[Total] * 0.2" },
        ],
      },
    ],
  };
}

const items = [
  fixtureItem(LAKEHOUSE, "Lakehouse", "Sales lakehouse"),
  fixtureItem(MODEL, "SemanticModel", "Sales model", { ownerName: "Ana" }),
  fixtureItem(REPORT, "Report", "Sales report"),
  fixtureItem(DASHBOARD, "Dashboard", "Sales dashboard"),
  fixtureItem(NOTEBOOK, "Notebook", "Load"),
  fixtureItem(WAREHOUSE, "Warehouse", "Finance warehouse"),
];

const before = fixtureSnapshot("old", "2026-09-01T08:00:00.000Z", {
  items,
  edges: [
    { source: LAKEHOUSE, target: MODEL, relation: "Direct Lake" },
    { source: MODEL, target: REPORT, relation: "binds" },
    { source: REPORT, target: DASHBOARD, relation: "dashboard report" },
    { source: NOTEBOOK, target: LAKEHOUSE, relation: "writes" },
    { source: LAKEHOUSE, target: WAREHOUSE, relation: "shortcut" },
  ],
  schema: salesSchema(),
  grants: [
    { itemFabricId: MODEL, principalRef: "ana@contoso.com", accessLevel: "owner", source: "itemOwner" },
  ],
  jobs: [
    {
      itemFabricId: MODEL,
      itemName: "Sales model",
      jobType: "Refresh",
      status: "failed",
      startedAt: "2026-08-31T08:00:00.000Z",
      durationSec: 30,
    },
  ],
});

const after = fixtureSnapshot("new", "2026-10-01T08:00:00.000Z", {
  items: items
    .filter((item) => item.fabricId !== NOTEBOOK)
    .map((item) => (item.fabricId === MODEL ? { ...item, ownerName: undefined } : item)),
  edges: [
    { source: LAKEHOUSE, target: MODEL, relation: "Direct Lake" },
    { source: MODEL, target: REPORT, relation: "binds" },
    { source: REPORT, target: DASHBOARD, relation: "dashboard report" },
    { source: WAREHOUSE, target: LAKEHOUSE, relation: "shortcut" },
  ],
  schema: salesSchema({ amount: false, qtyType: "string", margin: "[Total] * 0.25" }),
  jobs: [
    {
      itemFabricId: MODEL,
      itemName: "Sales model",
      jobType: "Refresh",
      status: "completed",
      startedAt: "2026-10-01T07:00:00.000Z",
      durationSec: 25,
    },
  ],
});

describe("breaking change guard", () => {
  const analysis = analyzeBreakingChanges(before, after);
  const byKind = (kind: string) =>
    analysis.candidates.filter((candidate) => candidate.kind === kind);

  it("classifies removals, type changes and expression changes from snapshot evidence", () => {
    expect(byKind("column-removed")[0]).toMatchObject({
      domain: "schema",
      object: { kind: "column", table: "Sales", name: "Amount" },
      before: { dataType: "decimal" },
      after: undefined,
      dependentObjects: [
        { itemId: MODEL, kind: "measure", table: "Sales", name: "Total", confidence: "verified" },
      ],
    });
    expect(byKind("column-type-changed")[0]).toMatchObject({
      object: { name: "Qty" },
      before: "int64",
      after: "string",
    });
    expect(byKind("measure-expression-changed")[0]).toMatchObject({
      object: { name: "Margin" },
      before: "[Total] * 0.2",
      after: "[Total] * 0.25",
    });
  });

  it("reads downstream impact from the earlier snapshot", () => {
    expect(byKind("column-removed")[0].downstream.map((entry) => [entry.name, entry.distance])).toEqual([
      ["Sales report", 1],
      ["Sales dashboard", 2],
    ]);
    expect(byKind("column-removed")[0]).toMatchObject({ score: 4, severity: "high" });
    expect(byKind("column-type-changed")[0]).toMatchObject({ score: 3, severity: "high" });
  });

  it("pairs reversed lineage and folds a removed item's own changes into one candidate", () => {
    expect(byKind("lineage-reversed")).toHaveLength(1);
    expect(byKind("lineage-reversed")[0]).toMatchObject({
      title: "Lineage direction reversed: Sales lakehouse → Finance warehouse",
      changeIds: [expect.any(String), expect.any(String)],
    });
    expect(byKind("lineage-removed")).toEqual([]);
    expect(byKind("item-removed")[0]).toMatchObject({
      item: { name: "Load", type: "Notebook" },
      downstream: expect.arrayContaining([
        expect.objectContaining({ name: "Sales lakehouse", distance: 1 }),
      ]),
    });
  });

  it("flags ownership loss only where consumers depend on the item", () => {
    expect(byKind("owner-removed")[0]).toMatchObject({
      item: { name: "Sales model" },
      before: { ownerName: "Ana" },
    });
    expect(byKind("owner-access-removed")[0]).toMatchObject({
      item: { name: "Sales model" },
      domain: "access",
    });
  });

  it("orders candidates deterministically by severity and score", () => {
    const again = analyzeBreakingChanges(before, after);
    expect(again.candidates.map((candidate) => candidate.id)).toEqual(
      analysis.candidates.map((candidate) => candidate.id),
    );
    const severities = analysis.candidates.map((candidate) => candidate.severity);
    expect(severities).toEqual([...severities].sort((left, right) =>
      ["high", "medium", "low"].indexOf(left) - ["high", "medium", "low"].indexOf(right),
    ));
    expect([severityFor(1), severityFor(2), severityFor(3), severityFor(4)]).toEqual([
      "low",
      "medium",
      "high",
      "high",
    ]);
  });

  it("exports a review brief without claiming report visual impact", () => {
    const brief = breakingChangeBrief(byKind("column-removed")[0], before, after);

    expect(brief).toContain("# Column removed: Sales.Amount");
    expect(brief).toContain("Compared snapshots: old (2026-09-01T08:00:00.000Z) → new");
    expect(brief).toContain('"dataType": "decimal"');
    expect(brief).toContain("- Sales report (Report), 1 hop");
    expect(brief).toContain("- Refresh: completed at 2026-10-01T07:00:00.000Z");
    expect(brief).toContain("Report visual field usage is not exposed by Fabric APIs");
  });

  it("contains Markdown control characters in labels and evidence values", () => {
    const candidate = structuredClone(byKind("column-removed")[0]);
    candidate.title = "[Removed](javascript:alert(1))<img>";
    candidate.before = "before\n```\nafter";

    const brief = breakingChangeBrief(candidate, before, after);

    expect(brief).toContain(
      "# \\[Removed\\]\\(javascript:alert\\(1\\)\\)\\<img\\>",
    );
    expect(brief).toContain("````\nbefore\n```\nafter\n````");
  });

  it("returns no candidates for identical snapshots", () => {
    expect(analyzeBreakingChanges(before, before).candidates).toEqual([]);
  });
});
