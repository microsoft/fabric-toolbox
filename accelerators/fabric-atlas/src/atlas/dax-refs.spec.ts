import { describe, expect, it } from "vitest";
import { staticDaxReferences } from "../../rayfin/functions/src/powerbi-projections";
import { extractDaxRefs } from "./dax-refs";

describe("extractDaxRefs", () => {
  it("extracts qualified columns and unqualified measures in order", () => {
    expect(
      extractDaxRefs(
        "DIVIDE(SUM('Sales Data'[Net]]Amount]), [Total Revenue])",
      ),
    ).toEqual([
      {
        kind: "column",
        table: "Sales Data",
        name: "Net]Amount",
      },
      { kind: "measure", name: "Total Revenue" },
    ]);
  });

  it("ignores strings and every supported comment style", () => {
    expect(
      extractDaxRefs(`
        "show [Hidden]" &
        // [Comment A]
        -- Table[Comment B]
        /* 'Table'[Comment C] */
        Sales[Amount]
      `),
    ).toEqual([{ kind: "column", table: "Sales", name: "Amount" }]);
  });

  it("handles escaped quotes and deduplicates case-insensitively", () => {
    expect(
      extractDaxRefs(
        "'L''Équipe'[Valeur] + 'l''équipe'[valeur] + [Measure] + [measure]",
      ),
    ).toEqual([
      { kind: "column", table: "L'Équipe", name: "Valeur" },
      { kind: "measure", name: "Measure" },
    ]);
  });

  it("does not treat DAX calls as measure references", () => {
    expect(
      extractDaxRefs("CALCULATE(SUM(Sales[Amount]), FILTER(Sales, [Active]))"),
    ).toEqual([
      { kind: "column", table: "Sales", name: "Amount" },
      { kind: "measure", name: "Active" },
    ]);
  });

  it("does not treat DAX keywords as table names", () => {
    expect(
      extractDaxRefs(`
        VAR total = [Total]
        RETURN [Margin] + NOT [Inactive]
      `),
    ).toEqual([
      { kind: "measure", name: "Total" },
      { kind: "measure", name: "Margin" },
      { kind: "measure", name: "Inactive" },
    ]);
    expect(extractDaxRefs("RETURN[Total]")).toEqual([
      { kind: "measure", name: "Total" },
    ]);
  });

  it("requires an unquoted table name to touch the opening bracket", () => {
    expect(extractDaxRefs("Sales[Amount] + Sales [Margin]")).toEqual([
      { kind: "column", table: "Sales", name: "Amount" },
      { kind: "measure", name: "Margin" },
    ]);
  });

  it("keeps browser and Functions tokenization in parity", () => {
    const expressions = [
      "RETURN [Total]",
      "NOT[Inactive]",
      "Sales[Amount] + 'Sales Data'[Margin]",
      "VAR value = [Base]\nRETURN DIVIDE([Result], value)",
    ];
    for (const expression of expressions) {
      expect(
        extractDaxRefs(expression).map(({ table, name }) => ({
          ...(table ? { table } : {}),
          name,
        })),
      ).toEqual(staticDaxReferences(expression));
    }
  });

  it("continues after quoted table arguments", () => {
    expect(
      extractDaxRefs(
        "SUMX('Sales', 'Sales'[Amount]) + [Total]",
      ),
    ).toEqual([
      { kind: "column", table: "Sales", name: "Amount" },
      { kind: "measure", name: "Total" },
    ]);
  });

  it("skips malformed references without throwing", () => {
    expect(extractDaxRefs("'Broken[Value] + [Missing")).toEqual([]);
  });

  it("keeps reference offsets aligned after astral Unicode characters", () => {
    expect(extractDaxRefs(`"😀😀😀" & Sales[Amount]`)).toEqual([
      { kind: "column", table: "Sales", name: "Amount" },
    ]);
    expect(extractDaxRefs(`"😀😀😀"&Tbl[Col]`)).toEqual([
      { kind: "column", table: "Tbl", name: "Col" },
    ]);
    expect(extractDaxRefs(`"🔴🟢" & [Total]`)).toEqual([
      { kind: "measure", name: "Total" },
    ]);
  });
});
