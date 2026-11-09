import { describe, expect, it } from "vitest";
import { parseToolArguments } from "./arguments";
import { ATLAS_MCP_TOOL_NAMES } from "./contract";

const ITEM = "c0000000-0000-4000-8000-000000000003";

describe("Atlas MCP arguments", () => {
  it("applies bounded defaults", () => {
    expect(parseToolArguments("atlas_get_known_impact", { itemId: ITEM })).toEqual({
      workspaceId: undefined,
      itemId: ITEM,
      direction: "both",
      maxDepth: 3,
      limit: 50,
    });
    expect(parseToolArguments("atlas_get_operational_incidents", undefined)).toEqual({
      workspaceId: undefined,
      includeImpact: true,
      includeHistory: true,
      limit: 10,
    });
  });

  it("normalizes workspace IDs, trims queries and de-duplicates filters", () => {
    expect(
      parseToolArguments("atlas_find_catalog_items", {
        workspaceId: "3F2B9C1E-5A6D-4E7F-8A9B-0C1D2E3F4A5B",
        query: "  sales \n model ",
        kinds: ["measure", "measure"],
        itemTypes: ["SemanticModel", "SemanticModel"],
      }),
    ).toEqual({
      workspaceId: "3f2b9c1e-5a6d-4e7f-8a9b-0c1d2e3f4a5b",
      query: "sales model",
      kinds: ["measure"],
      itemTypes: ["SemanticModel"],
      limit: 10,
    });
  });

  it.each([
    ["atlas_list_workspaces", { workspaceId: ITEM }, "Unsupported argument"],
    ["atlas_find_catalog_items", { query: "" }, "query must contain"],
    ["atlas_find_catalog_items", { query: "x".repeat(201) }, "query must contain"],
    ["atlas_find_catalog_items", { query: "x", kinds: ["principal"] }, "kinds must be"],
    ["atlas_find_catalog_items", { query: "x", itemTypes: ["Semantic Model"] }, "itemTypes"],
    ["atlas_get_known_impact", {}, "itemId is required."],
    ["atlas_get_known_impact", { itemId: "../x" }, "itemId must be"],
    ["atlas_get_known_impact", { itemId: ITEM, direction: "sideways" }, "direction must be"],
    ["atlas_get_known_impact", { itemId: ITEM, limit: 1.5 }, "limit must be"],
    ["atlas_get_operational_incidents", { includeImpact: "yes" }, "includeImpact must be"],
    ["atlas_get_snapshot_changes", { domains: ["comments"] }, "domains must be"],
    ["atlas_get_snapshot_provenance", null, "must be a JSON object"],
    ["atlas_get_snapshot_provenance", [], "must be a JSON object"],
  ] as const)("rejects invalid %s arguments", (tool, value, message) => {
    expect(() => parseToolArguments(tool, value)).toThrow(message);
  });

  it("accepts an empty object for every tool without required inputs", () => {
    for (const tool of ATLAS_MCP_TOOL_NAMES) {
      if (
        tool === "atlas_find_catalog_items" ||
        tool === "atlas_get_known_impact" ||
        tool === "atlas_explain_lineage_evidence"
      ) {
        continue;
      }
      expect(() => parseToolArguments(tool, {})).not.toThrow();
    }
  });
});
