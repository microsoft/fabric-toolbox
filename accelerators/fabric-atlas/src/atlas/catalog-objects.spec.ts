import { describe, expect, it } from "vitest";
import {
  buildCatalogObjects,
  metadataObjectImpact,
} from "./catalog-objects";
import {
  metadataObjectLineageEdges,
  parseDataAgentMetadata,
  parseGraphModelMetadata,
  parseKqlDatabaseMetadata,
  parseOntologyMetadata,
} from "./item-metadata";
import type { AtlasData, Item } from "./model";

function item(
  fabricId: string,
  itemType: Item["itemType"],
  displayName: string,
): Item {
  return {
    fabricId,
    displayName,
    itemType,
    health: "healthy",
    endorsement: "none",
    tags: [],
  };
}

function workspaceData(): AtlasData {
  const ontology = parseOntologyMetadata({
    entities: [
      {
        id: "device",
        name: "Device",
        namespace: "operations",
        properties: [
          {
            id: "device-id",
            name: "Device ID",
            valueType: "String",
          },
        ],
        timeSeriesProperties: [
          {
            id: "observed-at",
            name: "Observed at",
            valueType: "DateTime",
          },
        ],
      },
      { id: "site", name: "Site", properties: [] },
    ],
    relationships: [
      {
        id: "installed-at",
        name: "Installed at",
        sourceEntityId: "device",
        targetEntityId: "site",
      },
    ],
    bindings: [
      {
        id: "device-binding",
        entityId: "device",
        bindingType: "table",
        sourceItemId: "warehouse",
        sourceSchema: "dbo",
        sourceObject: "Devices",
        propertyBindings: [
          { sourceColumn: "DeviceId", targetPropertyId: "device-id" },
          { sourceColumn: "ObservedAt", targetPropertyId: "observed-at" },
        ],
      },
    ],
    contextualizations: [
      {
        id: "site-context",
        relationshipId: "installed-at",
        sourceItemId: "warehouse",
        sourceObject: "Installations",
        sourceKeyBindings: [
          { sourceColumn: "DeviceId", targetPropertyId: "device-id" },
        ],
        targetKeyBindings: [],
      },
    ],
  })!;
  const graph = parseGraphModelMetadata({
    graphType: {
      nodeTypes: [
        {
          alias: "Device",
          labels: ["Device"],
          primaryKeyProperties: ["DeviceId"],
          properties: [{ name: "DeviceId", type: "STRING" }],
        },
        {
          alias: "Site",
          labels: ["Site"],
          primaryKeyProperties: [],
          properties: [],
        },
      ],
      edgeTypes: [
        {
          alias: "INSTALLED_AT",
          labels: ["INSTALLED_AT"],
          sourceNodeType: { alias: "Device" },
          destinationNodeType: { alias: "Site" },
          properties: [],
        },
      ],
    },
    dataSources: [
      {
        name: "Device source",
        itemId: "warehouse",
        tableName: "Devices",
        type: "WarehouseTable",
      },
    ],
    graphDefinition: {
      nodeTables: [
        {
          id: "device-map",
          nodeTypeAlias: "Device",
          dataSourceName: "Device source",
          propertyMappings: [
            { propertyName: "DeviceId", sourceColumn: "DeviceId" },
          ],
        },
      ],
      edgeTables: [],
    },
  })!;
  const agent = parseDataAgentMetadata({
    sources: [
      {
        artifactId: "warehouse",
        displayName: "Operations warehouse",
        type: "data_warehouse",
        elements: [
          {
            id: "devices",
            display_name: "Devices",
            type: "warehouse_tables.table",
            is_selected: true,
            children: [
              {
                id: "device-id",
                display_name: "DeviceId",
                type: "warehouse_tables.column",
                data_type: "string",
                is_selected: true,
              },
              {
                id: "private-note",
                display_name: "PrivateNote",
                type: "warehouse_tables.column",
                data_type: "string",
                is_selected: false,
              },
            ],
          },
        ],
      },
    ],
  })!;
  const kql = parseKqlDatabaseMetadata({
    functions: [
      {
        name: "RecentDevices",
        parameters: [{ name: "window", type: "timespan" }],
        returnType: "table",
      },
    ],
    materializedViews: [
      {
        name: "DeviceHourly",
        sourceTable: "DeviceEvents",
        columns: [{ name: "DeviceCount", dataType: "long" }],
      },
    ],
  })!;
  const items = [
    item("warehouse", "Warehouse", "Operations warehouse"),
    item("ontology", "Ontology", "Operations ontology"),
    item("graph", "GraphModel", "Operations graph"),
    item("agent", "DataAgent", "Operations agent"),
    item("kql", "KQLDatabase", "Telemetry database"),
  ];
  return {
    workspace: {
      fabricId: "workspace",
      displayName: "Operations workspace",
      capacity: "F2",
      region: "West Europe",
    },
    items,
    edges: [],
    principals: [],
    grants: [],
    jobs: [],
    config: [],
    comments: [],
    syncRuns: [],
    schema: {
      warehouse: [
        {
          name: "Devices",
          objectType: "Table",
          columns: [{ name: "DeviceId", dataType: "varchar" }],
          measures: [],
        },
      ],
      kql: [
        {
          name: "DeviceEvents",
          objectType: "Table",
          columns: [{ name: "DeviceId", dataType: "string" }],
          measures: [],
        },
      ],
    },
    itemMetadata: { ontology, graph, agent, kql },
    objectEdges: [
      ...metadataObjectLineageEdges("ontology", ontology),
      ...metadataObjectLineageEdges("graph", graph),
      ...metadataObjectLineageEdges("agent", agent),
      ...metadataObjectLineageEdges("kql", kql),
    ],
  };
}

describe("catalog object discovery", () => {
  it("classifies full workspace metadata without exposing unselected elements", () => {
    const objects = buildCatalogObjects(workspaceData());
    const kinds = new Set(objects.map((object) => object.kind));

    expect([...kinds]).toEqual(
      expect.arrayContaining([
        "sqlTable",
        "sqlColumn",
        "kqlTable",
        "kqlFunction",
        "kqlFunctionParameter",
        "kqlMaterializedView",
        "ontologyEntity",
        "ontologyProperty",
        "ontologyTimeSeriesProperty",
        "ontologyRelationship",
        "ontologyContextualization",
        "graphNode",
        "graphEdge",
        "graphProperty",
        "graphSourceMapping",
        "dataAgentSource",
        "dataAgentElement",
      ]),
    );
    expect(objects.some((object) => object.name === "PrivateNote")).toBe(false);
    expect(JSON.stringify(objects)).not.toMatch(
      /prompt|few.?shot|filter.?value|business.?row/i,
    );
  });

  it("returns verified source-to-consumer impact for metadata objects", () => {
    const data = workspaceData();
    const property = buildCatalogObjects(data).find(
      (object) =>
        object.kind === "ontologyProperty" &&
        object.name === "Device ID",
    )!;
    const impact = metadataObjectImpact(data.objectEdges, property.metadataRef!);

    expect(impact.upstream).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "sourceField",
          name: "DeviceId",
          itemId: "warehouse",
        }),
      ]),
    );
    expect(impact.relevantEdges.length).toBeGreaterThan(0);
  });

  it("renders projected UDF schema when no metadata envelope is available", () => {
    const ontology = item("ontology", "Ontology", "Operations ontology");
    const data: AtlasData = {
      workspace: {
        fabricId: "workspace",
        displayName: "Workspace",
        capacity: "F2",
        region: "West Europe",
      },
      items: [ontology],
      edges: [],
      principals: [],
      grants: [],
      jobs: [],
      config: [],
      comments: [],
      syncRuns: [],
      schema: {
        ontology: [
          {
            name: "Device",
            objectType: "Ontology entity",
            columns: [
              {
                name: "Device ID",
                dataType: "String",
                objectType: "Ontology property",
              },
            ],
            measures: [],
          },
        ],
      },
      objectEdges: [
        {
          source: {
            itemId: "ontology",
            kind: "ontologyEntity",
            id: "device",
            name: "Device",
          },
          target: {
            itemId: "ontology",
            kind: "ontologyProperty",
            id: "device-id",
            name: "Device ID",
            tableName: "Device",
          },
          relation: "contains",
          confidence: "verified",
        },
      ],
    };

    expect(buildCatalogObjects(data)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "ontologyEntity",
          objectId: "device",
        }),
        expect.objectContaining({
          kind: "ontologyProperty",
          objectId: "device-id",
        }),
      ]),
    );
  });
});
