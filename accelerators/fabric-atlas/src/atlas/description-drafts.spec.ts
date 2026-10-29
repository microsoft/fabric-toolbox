import { describe, expect, it } from "vitest";
import { draftObjectDescriptions } from "./description-drafts";

describe("draftObjectDescriptions", () => {
  it("drafts undocumented measures first, skips documented and hidden objects", () => {
    const drafts = draftObjectDescriptions([
      {
        name: "rentals",
        columns: [
          { name: "revenue_chf", dataType: "double" },
          { name: "station_id", dataType: "string", isHidden: true },
          { name: "region", dataType: "string", description: "Sales region." },
        ],
        measures: [
          { name: "Total Revenue", expr: "SUM(rentals[revenue_chf])" },
          { name: "Documented", expr: "1", description: "Already described." },
        ],
      },
    ]);
    expect(drafts.map((draft) => draft.target)).toEqual(["[Total Revenue]", "rentals[revenue_chf]", "rentals"]);
    expect(drafts[0].text).toBe("Sum of revenue in CHF in rentals.");
  });
});
