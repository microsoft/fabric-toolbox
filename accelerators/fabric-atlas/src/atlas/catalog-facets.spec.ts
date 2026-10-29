import { describe, expect, it } from "vitest";
import {
  applyCatalogFacets,
  facetSelectionFromFilters,
  facetSelectionToFilters,
  resolveItemTags,
  toggleFacetValue,
} from "./catalog-facets";
import type { GovernanceEvidence } from "./governance-evidence";
import type { Item } from "./model";

const DOMAIN = "20000000-0000-4000-8000-000000000002";
const GOLD = "20000000-0000-4000-8000-000000000011";
const KPI = "20000000-0000-4000-8000-000000000012";

function evidence(tagsReadable = true): GovernanceEvidence {
  const complete = { status: "complete" as const };
  return {
    collectedAt: "2026-10-01T00:00:00Z",
    domains: { status: complete, entries: [{ id: DOMAIN, displayName: "Rentals" }] },
    tags: tagsReadable
      ? {
          status: complete,
          entries: [
            { id: GOLD, displayName: "Gold", scope: "tenant" },
            { id: KPI, displayName: "Rentals KPI", scope: "domain", domainId: DOMAIN },
          ],
        }
      : { status: { status: "unsupported", code: "forbidden" }, entries: [] },
    tenantSettings: { status: complete, entries: [] },
    network: { status: complete },
    externalShares: { status: complete, entries: [] },
    oneLakeRoles: { status: complete, entries: [] },
  } as GovernanceEvidence;
}

function item(id: string, overrides: Partial<Item> = {}): Item {
  return {
    fabricId: id,
    displayName: id,
    itemType: "Report",
    health: "healthy",
    endorsement: "none",
    tags: [],
    ...overrides,
  } as Item;
}

const context = { workspace: { fabricDomainId: DOMAIN }, governanceEvidence: evidence() };

describe("resolveItemTags", () => {
  it("shows tenant and domain scope when the definitions are readable", () => {
    const tags = resolveItemTags(item("a", { tags: ["gold", "Rentals KPI"], tagIds: [GOLD, KPI] }), evidence());
    expect(tags.map((tag) => [tag.label, tag.hint])).toEqual([
      ["Gold", "Tenant"],
      ["Rentals KPI", "Domain: Rentals"],
    ]);
  });

  it("keeps tag names with an Unknown scope when definitions are not readable", () => {
    const tags = resolveItemTags(item("a", { tags: ["Gold"], tagIds: [GOLD] }), evidence(false));
    expect(tags).toEqual([
      { key: "gold", label: "Gold", scope: "unknown", hint: "Scope unknown: tag definitions not readable" },
    ]);
  });

  it("names a tag from its ID and flags tags missing from the definitions", () => {
    expect(resolveItemTags(item("a", { tags: [], tagIds: [KPI] }), evidence()).map((tag) => tag.label)).toEqual(["Rentals KPI"]);
    const unknown = resolveItemTags(item("a", { tags: ["Legacy"] }), evidence());
    expect(unknown[0]).toMatchObject({ scope: "unknown", hint: "Scope unknown: tag not in the collected definitions" });
    expect(resolveItemTags(item("a", { tags: [], tagIds: ["ffffffff-0000"] }), undefined)[0].label).toBe("Tag ffffffff");
  });
});

describe("applyCatalogFacets", () => {
  const items = [
    item("cert", { endorsement: "certified", sensitivity: "Confidential", tags: ["Gold"] }),
    item("promo", { endorsement: "promoted", sensitivity: "General", tags: ["Gold", "Rentals KPI"] }),
    item("master", { endorsement: "none", endorsementRaw: "MasterData", tags: [] }),
    item("blind", { sensitivityMetadataAvailable: false, endorsementMetadataAvailable: false, tagMetadataAvailable: false }),
  ];

  it("combines facets with AND and values with OR", () => {
    const either = applyCatalogFacets(items, { endorsement: ["certified", "promoted"] }, context);
    expect(either.items.map((entry) => entry.fabricId)).toEqual(["cert", "promo"]);
    const both = applyCatalogFacets(items, { endorsement: ["certified", "promoted"], label: ["general"] }, context);
    expect(both.items.map((entry) => entry.fabricId)).toEqual(["promo"]);
  });

  it("counts each value over the items matching the other facets", () => {
    const result = applyCatalogFacets(items, { tag: ["rentals kpi"] }, context);
    const count = (facet: keyof typeof result.facets, value: string) =>
      result.facets[facet].find((entry) => entry.value === value)?.count;
    expect(count("endorsement", "promoted")).toBe(1);
    expect(count("endorsement", "certified")).toBeUndefined();
    expect(count("tag", "gold")).toBe(2);
    expect(count("tag", "__none")).toBe(1);
    expect(count("tag", "unknown")).toBe(1);
    expect(count("domain", DOMAIN)).toBe(1);
    expect(result.facets.domain[0].label).toBe("Rentals");
  });

  it("reports unreadable signals as Unknown and Master data endorsements", () => {
    const { facets } = applyCatalogFacets(items, {}, context);
    expect(facets.endorsement.map((entry) => entry.label)).toEqual(
      expect.arrayContaining(["Certified", "Promoted", "Master data", "Unknown"]),
    );
    expect(facets.label.find((entry) => entry.value === "unknown")?.count).toBe(1);
    const unknownDomain = applyCatalogFacets(items, {}, { workspace: {} });
    expect(unknownDomain.facets.domain).toEqual([{ value: "unknown", label: "Unknown", count: 4 }]);
  });
});

describe("facet selection state", () => {
  it("round-trips through navigation filters and ignores invalid values", () => {
    let selection = toggleFacetValue({}, "tag", "gold");
    selection = toggleFacetValue(selection, "tag", "silver");
    selection = toggleFacetValue(selection, "tag", "gold");
    expect(selection).toEqual({ tag: ["silver"] });
    expect(facetSelectionFromFilters(facetSelectionToFilters(selection))).toEqual(selection);
    expect(facetSelectionFromFilters({ "facet.label": "general", "facet.domain": [1, ""], other: ["x"] })).toEqual({
      label: ["general"],
    });
    expect(toggleFacetValue({ tag: ["silver"] }, "tag", "silver")).toEqual({});
  });
});
