import { describe, expect, it } from "vitest";
import {
  buildSearchIndex,
  normalizeSearchText,
  searchAtlas,
  searchIndex,
} from "./search";
import {
  parseKqlDatabaseMetadata,
  parseOntologyMetadata,
} from "./item-metadata";
import type { AtlasData } from "./model";

function data(): AtlasData {
  return {
    workspace: {
      fabricId: "workspace",
      displayName: "Finance Analytics",
      capacity: "F8",
      region: "West Europe",
    },
    items: [
      {
        fabricId: "model",
        displayName: "Revenue Model",
        itemType: "SemanticModel",
        description: "Certified finance model",
        health: "healthy",
        endorsement: "certified",
        tags: ["gold"],
      },
      {
        fabricId: "report",
        displayName: "Revenue Report",
        itemType: "Report",
        health: "healthy",
        endorsement: "none",
        tags: [],
      },
    ],
    edges: [],
    principals: [
      {
        principalId: "lea",
        displayName: "Léa Martin",
        email: "lea@example.com",
        kind: "user",
        workspaceRole: "Viewer",
      },
    ],
    grants: [],
    jobs: [
      {
        itemFabricId: "model",
        itemName: "Revenue Model",
        jobType: "Refresh",
        status: "failed",
        startedAt: "2026-08-29T20:00:00.000Z",
        durationSec: 10,
        message: "Finance gateway timeout",
      },
    ],
    config: [
      {
        itemFabricId: "model",
        section: "Storage",
        label: "Mode",
        value: "Direct Lake",
      },
    ],
    comments: [
      {
        id: "comment",
        itemFabricId: "model",
        authorId: "lea",
        authorName: "Léa Martin",
        body: "Revenue model needs review",
        createdAt: "2026-08-29T21:00:00.000Z",
      },
    ],
    syncRuns: [],
    schema: {
      model: [
        {
          name: "Sales",
          objectType: "Table",
          description: "Revenue facts",
          source: "Lakehouse",
          columns: [
            {
              name: "Gross Amount",
              dataType: "double",
              description: "Gross revenue",
            },
          ],
          measures: [
            {
              name: "Total Revenue",
              expr: "SUM(Sales[Gross Amount])",
              description: "Total gross revenue",
            },
          ],
        },
        {
          name: "Current Sales",
          objectType: "View",
          columns: [],
          measures: [],
        },
      ],
    },
  };
}

describe("global search", () => {
  it("normalizes NFKC, case, and whitespace and requires every token", () => {
    expect(normalizeSearchText("  ＲＥＶＥＮＵＥ\t MODEL ")).toBe(
      "revenue model",
    );

    const results = searchAtlas(data(), "  ＲＥＶＥＮＵＥ   MODEL ");
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.every((result) =>
        ["revenue", "model"].every((token) =>
          result.searchText.includes(token),
        ),
      ),
    ).toBe(true);
    expect(searchAtlas(data(), "revenue missing")).toEqual([]);
  });

  it("ranks an exact named target above incidental matches deterministically", () => {
    const first = searchAtlas(data(), "Revenue Model");
    const second = searchIndex(buildSearchIndex(data()), "Revenue Model");

    expect(first[0]).toMatchObject({
      kind: "item",
      title: "Revenue Model",
      target: { kind: "item", itemId: "model" },
    });
    expect(second).toEqual(first);
  });

  it("returns no results for a blank query or zero limit", () => {
    expect(searchAtlas(data(), " \t ")).toEqual([]);
    expect(searchAtlas(data(), "revenue", { limit: 0 })).toEqual([]);
  });

  it("indexes explicit schema objects and navigation targets", () => {
    const index = buildSearchIndex(data());
    expect(index.map((candidate) => candidate.kind)).toEqual(
      expect.arrayContaining([
        "workspace",
        "item",
        "table",
        "view",
        "column",
        "measure",
        "principal",
        "comment",
        "config",
        "job",
      ]),
    );

    expect(searchAtlas(data(), "gross amount")[0]).toMatchObject({
      kind: "column",
      target: {
        kind: "column",
        itemId: "model",
        tableName: "Sales",
        objectName: "Gross Amount",
      },
    });
    expect(searchAtlas(data(), "direct lake")[0]).toMatchObject({
      kind: "config",
      target: { itemId: "model", section: "Storage" },
    });
    expect(searchAtlas(data(), "gateway timeout")[0]).toMatchObject({
      kind: "job",
      target: { itemId: "model" },
    });
  });

  it("does not invent schema entries when explicit schema is absent", () => {
    const withoutSchema = { ...data(), schema: undefined };
    const kinds = buildSearchIndex(withoutSchema).map((entry) => entry.kind);

    expect(kinds).not.toEqual(
      expect.arrayContaining(["table", "view", "column", "measure"]),
    );
  });

  it("indexes new object kinds with exact Asset Catalog targets", () => {
    const value = data();
    value.items.push(
      {
        fabricId: "ontology",
        displayName: "Operations ontology",
        itemType: "Ontology",
        health: "healthy",
        endorsement: "none",
        tags: [],
      },
      {
        fabricId: "telemetry",
        displayName: "Telemetry database",
        itemType: "KQLDatabase",
        health: "healthy",
        endorsement: "none",
        tags: [],
      },
    );
    value.itemMetadata = {
      ontology: parseOntologyMetadata({
        entities: [
          {
            id: "device",
            name: "Device",
            properties: [
              { id: "device-id", name: "Device ID", valueType: "String" },
            ],
          },
        ],
        relationships: [],
        bindings: [],
        contextualizations: [],
      })!,
      telemetry: parseKqlDatabaseMetadata({
        functions: [
          {
            name: "RecentDevices",
            parameters: [{ name: "window", type: "timespan" }],
          },
        ],
        materializedViews: [],
      })!,
    };

    expect(searchAtlas(value, "Device ID")[0]).toMatchObject({
      target: {
        itemId: "ontology",
        objectId: "device/device-id",
        objectKind: "ontologyProperty",
        tableName: "Device",
      },
    });
    expect(searchAtlas(value, "RecentDevices")[0]).toMatchObject({
      target: {
        itemId: "telemetry",
        objectId: "RecentDevices",
        objectKind: "kqlFunction",
      },
    });
  });
});
