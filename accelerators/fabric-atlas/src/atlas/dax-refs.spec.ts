import { describe, expect, it } from "vitest";
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
});
