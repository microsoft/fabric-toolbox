import { describe, expect, it } from "vitest";
import { SAMPLE_DATA, type ModelTableSchema } from "./model";
import { buildSchemaDependencies, schemaObjectKey } from "./schema-lineage";
import {
  buildSemanticModelXRay,
  xrayEvidenceMarkdown,
  xrayImpact,
  xrayObjectKey,
} from "./semantic-xray";

const MODEL = "aaaaaaaa-0000-4000-8000-000000000002";

const tables: ModelTableSchema[] = [
  {
    name: "Sales",
    columns: [
      { name: "Amount", dataType: "decimal" },
      { name: "Qty", dataType: "int64" },
    ],
    measures: [
      { name: "Total", expr: "SUM('Sales'[Amount]) -- [Ignored] in a comment" },
      { name: "Margin", expr: "[Total] * 0.2" },
      { name: "Shared", expr: "1" },
      { name: "Loop A", expr: "[Loop B] + 1" },
      { name: "Loop B", expr: "[Loop A] + 1" },
      { name: "Self", expr: "[Self]" },
      { name: "Lost", expr: "[Missing] + Unknown[Col] + Sales[Qty]" },
    ],
  },
  {
    name: "Finance",
    columns: [{ name: "Budget", dataType: "decimal" }],
    measures: [
      { name: "Shared", expr: "2" },
      { name: "Uses shared", expr: "[Shared] + 'Finance'[Budget]" },
    ],
  },
];

const key = (kind: "measure" | "column", table: string, name: string) =>
  xrayObjectKey(kind, table, name);

describe("semantic model X-Ray", () => {
  const xray = buildSemanticModelXRay(MODEL, tables);

  it("keeps every table, measure and column reachable and grouped by table", () => {
    expect(xray.tables.map((table) => [table.name, table.objectKeys.length])).toEqual([
      ["Sales", 9],
      ["Finance", 3],
    ]);
    expect(xray.measureCount).toBe(9);
    expect(xray.columnCount).toBe(3);
  });

  it("links only references that resolve to exactly one synchronized object", () => {
    expect(xray.dependsOn.get(key("measure", "Sales", "Total"))).toEqual([
      key("column", "Sales", "Amount"),
    ]);
    expect(xray.dependsOn.get(key("measure", "Sales", "Margin"))).toEqual([
      key("measure", "Sales", "Total"),
    ]);
    expect(xray.dependsOn.get(key("measure", "Finance", "Uses shared"))).toEqual([
      key("column", "Finance", "Budget"),
    ]);
    expect(
      xray.references.map((reference) => [reference.reference, reference.status]),
    ).toEqual([
      ["[Missing]", "unresolved"],
      ["'Unknown'[Col]", "unresolved"],
      ["[Shared]", "ambiguous"],
    ]);
    expect(
      xray.references.find((reference) => reference.status === "ambiguous")?.candidates,
    ).toEqual([key("measure", "Sales", "Shared"), key("measure", "Finance", "Shared")]);
  });

  it("matches the verified model-local dependencies used by Atlas lineage", () => {
    const sampleModel = SAMPLE_DATA.items.find((item) => item.itemType === "SemanticModel")!;
    const sampleTables = SAMPLE_DATA.schema?.[sampleModel.fabricId] ?? [];
    const sample = buildSemanticModelXRay(sampleModel.fabricId, sampleTables);
    const expected = buildSchemaDependencies(SAMPLE_DATA)
      .filter(
        (dependency) =>
          dependency.confidence === "verified" &&
          dependency.from.itemId === sampleModel.fabricId &&
          dependency.to.itemId === sampleModel.fabricId,
      )
      .map((dependency) => schemaObjectKey(dependency.from) + "->" + schemaObjectKey(dependency.to))
      .sort();
    const actual = [...sample.dependsOn.entries()]
      .flatMap(([from, targets]) =>
        targets.map((to) => {
          const source = sample.objects.get(from)!;
          const target = sample.objects.get(to)!;
          return (
            schemaObjectKey({ itemId: sampleModel.fabricId, kind: source.kind, tableName: source.table, name: source.name }) +
            "->" +
            schemaObjectKey({ itemId: sampleModel.fabricId, kind: target.kind, tableName: target.table, name: target.name })
          );
        }),
      )
      .sort();

    expect(sampleTables.length).toBeGreaterThan(0);
    expect(actual).toEqual(expected);
  });

  it("detects cycles and self references without breaking traversal", () => {
    expect(xray.cycles).toEqual([
      [key("measure", "Sales", "Loop A"), key("measure", "Sales", "Loop B")].sort(),
      [key("measure", "Sales", "Self")],
    ]);
    expect(xrayImpact(xray, key("measure", "Sales", "Loop A"), "dependsOn", true).keys).toEqual(
      new Set([key("measure", "Sales", "Loop B")]),
    );
  });

  it("separates direct and transitive impact in both directions", () => {
    const amount = key("column", "Sales", "Amount");
    const direct = xrayImpact(xray, amount, "usedBy", false);
    const transitive = xrayImpact(xray, amount, "usedBy", true);

    expect([...direct.keys]).toEqual([key("measure", "Sales", "Total")]);
    expect([...transitive.keys]).toEqual([
      key("measure", "Sales", "Total"),
      key("measure", "Sales", "Margin"),
    ]);
    expect(transitive.distance.get(key("measure", "Sales", "Margin"))).toBe(2);
  });

  it("states missing DAX consumers precisely in exported evidence", () => {
    const evidence = xrayEvidenceMarkdown(xray, key("measure", "Sales", "Margin"), "Sales model");

    expect(evidence).toContain("# Sales model: Sales [Margin]");
    expect(evidence).toContain("- Sales [Total] (measure, 1 hop)");
    expect(evidence).toContain("- Sales 'Sales'[Amount] (column, 2 hops)");
    expect(evidence).toContain(
      "No DAX consumers in this model. Report and visual usage is not exposed by Fabric APIs.",
    );
  });

  it("escapes labels and contains DAX expressions with embedded fences", () => {
    const unsafe = buildSemanticModelXRay(MODEL, [
      {
        name: "Sales<img>",
        columns: [],
        measures: [
          {
            name: "Unsafe",
            expr: "1\n```\n<img src=x>",
          },
        ],
      },
    ]);
    const evidence = xrayEvidenceMarkdown(
      unsafe,
      key("measure", "Sales<img>", "Unsafe"),
      "[Model](javascript:alert(1))",
    );

    expect(evidence).toContain(
      "# \\[Model\\]\\(javascript:alert\\(1\\)\\): Sales\\<img\\>",
    );
    expect(evidence).toContain("````dax\n1\n```\n<img src=x>\n````");
  });

  it("stays linear on large models", () => {
    const measures = Array.from({ length: 3_000 }, (_, index) => ({
      name: `M${index}`,
      expr: index === 0 ? "SUM(Big[Value])" : `[M${index - 1}] + 1`,
    }));
    const started = performance.now();
    const large = buildSemanticModelXRay(MODEL, [
      { name: "Big", columns: [{ name: "Value", dataType: "int64" }], measures },
    ]);
    const impact = xrayImpact(large, key("column", "Big", "Value"), "usedBy", true);

    expect(impact.keys.size).toBe(3_000);
    expect(large.cycles).toEqual([]);
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});
