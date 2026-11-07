import { describe, expect, it } from "vitest";
import { groupCatalogItems, sortCatalogItems } from "./catalog-table";
import { SAMPLE_DATA, type Item } from "./model";

const base = SAMPLE_DATA.items[0];
const item = (fabricId: string, displayName: string, extra: Partial<Item> = {}): Item => ({
  ...base,
  fabricId,
  displayName,
  ...extra,
});

describe("catalog table sorting", () => {
  it("sorts names naturally without modifying the input", () => {
    const rows = [item("b", "Model 10"), item("a", "Model 2")];
    expect(sortCatalogItems(rows, "name", "asc").map((row) => row.fabricId)).toEqual(["a", "b"]);
    expect(rows.map((row) => row.fabricId)).toEqual(["b", "a"]);
  });

  it("keeps unavailable refresh metadata last in either direction", () => {
    const rows = [
      item("none", "None", { lastRefresh: undefined }),
      item("old", "Old", { lastRefresh: "2026-08-01T12:00:00Z" }),
      item("new", "New", { lastRefresh: "2026-08-02T12:00:00Z" }),
    ];
    expect(sortCatalogItems(rows, "refresh", "asc").map((row) => row.fabricId)).toEqual(["old", "new", "none"]);
    expect(sortCatalogItems(rows, "refresh", "desc").map((row) => row.fabricId)).toEqual(["new", "old", "none"]);
  });

  it("retains sorted order inside item-type groups", () => {
    const rows = sortCatalogItems([
      item("z", "Zulu", { itemType: "Lakehouse" }),
      item("r", "Report", { itemType: "Report" }),
      item("a", "Alpha", { itemType: "Lakehouse" }),
    ], "name", "asc");
    expect(groupCatalogItems(rows).find(([type]) => type === "Lakehouse")?.[1].map((row) => row.fabricId)).toEqual(["a", "z"]);
  });
});
