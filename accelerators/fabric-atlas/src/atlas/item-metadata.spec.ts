import { describe, expect, it } from "vitest";
import {
  ITEM_METADATA_SCHEMA_NAME,
  MAX_DATA_AGENT_ELEMENTS,
  METADATA_OBJECT_TYPES,
  OPTIONAL_METADATA_SYNC_SECTIONS,
  isItemMetadataSchemaEntry,
  itemMetadataFor,
  itemMetadataFromSchema,
  metadataItemLineageEdges,
  metadataObjectLineageEdges,
  metadataSchemaEntry,
  projectItemMetadataToSchema,
  parseDataAgentMetadata,
  parseGraphModelMetadata,
  parseKqlDatabaseMetadata,
  parseObjectLineagePayload,
  parseOntologyMetadata,
} from "./item-metadata";
import type { ModelTableSchema } from "./model";

describe("ontology metadata", () => {
  it("keeps entities, relationships, and source bindings", () => {
    const metadata = parseOntologyMetadata({
      entityTypes: [
        {
          id: "customer",
          name: "Customer",
          entityIdParts: ["customer-id"],
          properties: [
            { id: "customer-id", name: "Customer ID", valueType: "String" },
          ],
          timeSeriesProperties: [
            { id: "seen-at", name: "Seen at", valueType: "DateTime" },
          ],
        },
        {
          id: "order",
          name: "Order",
          properties: [
            { id: "order-id", name: "Order ID", valueType: "String" },
          ],
        },
      ],
      relationshipTypes: [
        {
          id: "places",
          name: "places",
          source: { entityTypeId: "customer" },
          target: { entityTypeId: "order" },
          contextualizations: [
            {
              id: "places-binding",
              dataBindingTable: {
                workspaceId: "workspace",
                itemId: "lakehouse",
                sourceType: "LakehouseTable",
                sourceSchema: "dbo",
                sourceTableName: "Orders",
              },
              sourceKeyRefBindings: [
                {
                  sourceColumnName: "CustomerId",
                  targetPropertyId: "customer-id",
                },
              ],
              targetKeyRefBindings: [
                {
                  sourceColumnName: "OrderId",
                  targetPropertyId: "order-id",
                },
              ],
            },
          ],
        },
      ],
      dataBindings: [
        {
          id: "customer-binding",
          entityId: "customer",
          dataBindingConfiguration: {
            dataBindingType: "NonTimeSeries",
            sourceTableProperties: {
              sourceType: "LakehouseTable",
              workspaceId: "workspace",
              itemId: "lakehouse",
              sourceSchema: "dbo",
              sourceTableName: "Customers",
            },
            propertyBindings: [
              {
                sourceColumnName: "CustomerId",
                targetPropertyId: "customer-id",
              },
            ],
          },
        },
      ],
    });

    expect(metadata).toMatchObject({
      kind: "ontology",
      entities: [
        {
          id: "customer",
          keyPropertyIds: ["customer-id"],
          properties: [
            { id: "customer-id", timeSeries: false },
            { id: "seen-at", timeSeries: true },
          ],
        },
        { id: "order" },
      ],
      relationships: [
        {
          id: "places",
          sourceEntityId: "customer",
          targetEntityId: "order",
        },
      ],
      bindings: [
        {
          entityId: "customer",
          sourceItemId: "lakehouse",
          sourceObject: "Customers",
          propertyBindings: [
            {
              sourceColumn: "CustomerId",
              targetPropertyId: "customer-id",
            },
          ],
        },
      ],
      contextualizations: [
        {
          id: "places-binding",
          relationshipId: "places",
          sourceItemId: "lakehouse",
          sourceObject: "Orders",
          sourceKeyBindings: [
            {
              sourceColumn: "CustomerId",
              targetPropertyId: "customer-id",
            },
          ],
          targetKeyBindings: [
            {
              sourceColumn: "OrderId",
              targetPropertyId: "order-id",
            },
          ],
        },
      ],
    });
    expect(metadataObjectLineageEdges("ontology", metadata!)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: expect.objectContaining({
            itemId: "lakehouse",
            id: "dbo.Orders.CustomerId",
          }),
          target: expect.objectContaining({
            itemId: "ontology",
            id: "customer-id",
            parentId: "customer",
          }),
          relation: "binds source key",
          confidence: "verified",
        }),
        expect.objectContaining({
          source: expect.objectContaining({
            id: "places",
            kind: "ontologyRelationship",
          }),
          target: expect.objectContaining({
            id: "order",
            kind: "ontologyEntity",
          }),
          relation: "relationship target",
          confidence: "verified",
        }),
      ]),
    );
  });

  it("rejects raw definition payloads and duplicate identifiers", () => {
    expect(
      parseOntologyMetadata({
        entities: [],
        relationships: [],
        bindings: [],
        payload: "base64-definition",
      }),
    ).toBeUndefined();
    expect(
      parseOntologyMetadata({
        entities: [
          { id: "duplicate", name: "One", properties: [] },
          { id: "duplicate", name: "Two", properties: [] },
        ],
        relationships: [],
        bindings: [],
      }),
    ).toBeUndefined();
  });
});

describe("graph model metadata", () => {
  it("parses graph types and mappings without retaining filter values", () => {
    const metadata = parseGraphModelMetadata({
      graphType: {
        nodeTypes: [
          {
            alias: "Customer",
            labels: ["Customer"],
            primaryKeyProperties: ["CustomerId"],
            properties: [{ name: "CustomerId", type: "STRING" }],
          },
          {
            alias: "Product",
            labels: ["Product"],
            primaryKeyProperties: ["ProductId"],
            properties: [{ name: "ProductId", type: "STRING" }],
          },
        ],
        edgeTypes: [
          {
            alias: "Purchased",
            labels: ["PURCHASED"],
            sourceNodeType: { alias: "Customer" },
            destinationNodeType: { alias: "Product" },
            properties: [{ name: "Quantity", type: "INT" }],
          },
        ],
      },
      dataSources: [
        {
          name: "CustomerTable",
          itemId: "lakehouse",
          tableName: "Customers",
          type: "DeltaTable",
        },
        {
          name: "Orders",
          itemId: "lakehouse",
          tableName: "Orders",
          type: "DeltaTable",
        },
      ],
      graphDefinition: {
        nodeTables: [
          {
            id: "customer-map",
            nodeTypeAlias: "Customer",
            dataSourceName: "CustomerTable",
            propertyMappings: [
              {
                propertyName: "CustomerId",
                sourceColumn: "customer_id",
              },
            ],
          },
        ],
        edgeTables: [
          {
            id: "purchase-map",
            edgeTypeAlias: "Purchased",
            dataSourceName: "Orders",
            sourceNodeKeyColumns: ["customer_id"],
            destinationNodeKeyColumns: ["product_id"],
            propertyMappings: [],
          },
        ],
      },
    });

    expect(metadata).toMatchObject({
      kind: "graphModel",
      dataSources: [
        {
          name: "CustomerTable",
          sourceItemId: "lakehouse",
          sourceObject: "Customers",
        },
        {
          name: "Orders",
          sourceItemId: "lakehouse",
          sourceObject: "Orders",
        },
      ],
      edgeTypes: [
        {
          alias: "Purchased",
          sourceNodeType: "Customer",
          destinationNodeType: "Product",
        },
      ],
      mappings: [
        {
          kind: "node",
          typeAlias: "Customer",
          sourceItemId: "lakehouse",
          sourceObject: "Customers",
        },
        {
          kind: "edge",
          typeAlias: "Purchased",
          sourceItemId: "lakehouse",
          sourceObject: "Orders",
        },
      ],
    });
    expect(metadata?.nodeTypes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ alias: "Customer" }),
        expect.objectContaining({ alias: "Product" }),
      ]),
    );
  });

  it("rejects graph filters because they may contain business values", () => {
    expect(
      parseGraphModelMetadata({
        nodeTypes: [],
        edgeTypes: [],
        nodeTables: [
          {
            nodeTypeAlias: "Customer",
            dataSourceName: "Customers",
            propertyMappings: [],
            filter: { columnName: "Region", value: "North" },
          },
        ],
        edgeTables: [],
      }),
    ).toBeUndefined();
  });
});

describe("data agent metadata", () => {
  it("returns only selected source elements and preserves hierarchy", () => {
    const metadata = parseDataAgentMetadata({
      sources: [
        {
          artifactId: "warehouse",
          workspaceId: "workspace",
          displayName: "Sales Warehouse",
          type: "data_warehouse",
          elements: [
            {
              id: "dbo",
              display_name: "dbo",
              type: "warehouse_tables.schema",
              is_selected: true,
              children: [
                {
                  id: "sales",
                  display_name: "Sales",
                  type: "warehouse_tables.table",
                  is_selected: true,
                  children: [
                    {
                      id: "amount",
                      display_name: "Amount",
                      type: "warehouse_tables.column",
                      data_type: "decimal",
                      is_selected: true,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(metadata?.sources[0].selectedElements).toEqual([
      {
        id: "sales",
        displayName: "Sales",
        elementType: "warehouse_tables.table",
        sourceArtifactId: "warehouse",
        dataType: undefined,
        parentId: "dbo",
        parentName: "dbo",
        parentPath: ["dbo"],
        state: undefined,
        indexState: undefined,
      },
      {
        id: "amount",
        displayName: "Amount",
        elementType: "warehouse_tables.column",
        sourceArtifactId: "warehouse",
        dataType: "decimal",
        parentId: "sales",
        parentName: "Sales",
        parentPath: ["dbo", "Sales"],
        state: undefined,
        indexState: undefined,
      },
    ]);
    expect(metadata?.sources[0].elements).toMatchObject([
      {
        id: "sales",
        selected: true,
        sourceArtifactId: "warehouse",
        parentId: "dbo",
        parentName: "dbo",
        parentPath: ["dbo"],
        children: [
          {
            id: "amount",
            selected: true,
            sourceArtifactId: "warehouse",
            parentId: "sales",
            parentName: "Sales",
            parentPath: ["dbo", "Sales"],
          },
        ],
      },
    ]);
    expect(
      itemMetadataFromSchema("DataAgent", [
        metadataSchemaEntry(metadata!),
      ]),
    ).toEqual(metadata);
    const objectEdges = metadataObjectLineageEdges("agent", metadata!);
    expect(
      objectEdges.some(
        (edge) =>
          edge.source.id === "dbo" ||
          edge.target.id === "warehouse:dbo",
      ),
    ).toBe(false);
    expect(
      objectEdges.filter((edge) => edge.relation === "selected by agent"),
    ).toHaveLength(2);
  });

  it("rejects agent instructions, few shots, and unbounded element trees", () => {
    expect(
      parseDataAgentMetadata({
        sources: [],
        aiInstructions: "Answer using private sales details.",
      }),
    ).toBeUndefined();
    expect(
      parseDataAgentMetadata({
        sources: [],
        fewShots: [{ question: "Revenue?", query: "select * from Sales" }],
      }),
    ).toBeUndefined();
    expect(
      parseDataAgentMetadata({
        sources: [
          {
            artifactId: "warehouse",
            displayName: "Warehouse",
            type: "data_warehouse",
            elements: Array.from(            { length: MAX_DATA_AGENT_ELEMENTS + 1 }, (_, index) => ({
              id: String(index),
              displayName: String(index),
              type: "Table",
              isSelected: true,
            })),
          },
        ],
      }),
    ).toBeUndefined();
  });

  it("qualifies repeated field identifiers by their parent path", () => {
    const metadata = parseDataAgentMetadata({
      sources: [
        {
          artifactId: "kql",
          displayName: "Telemetry",
          type: "kusto",
          elements: [
            {
              id: "table-a",
              display_name: "TableA",
              type: "kusto.table",
              is_selected: true,
              children: [
                {
                  id: "Timestamp",
                  display_name: "Timestamp",
                  type: "kusto.column",
                  is_selected: true,
                },
              ],
            },
            {
              id: "table-b",
              display_name: "TableB",
              type: "kusto.table",
              is_selected: true,
              children: [
                {
                  id: "Timestamp",
                  display_name: "Timestamp",
                  type: "kusto.column",
                  is_selected: true,
                },
              ],
            },
          ],
        },
      ],
    });

    expect(metadata).toBeDefined();
    const timestampEdges = metadataObjectLineageEdges(
      "agent",
      metadata!,
    ).filter(
      (edge) =>
        edge.relation === "selected by agent" &&
        edge.source.name === "Timestamp",
    );
    expect(timestampEdges).toHaveLength(2);
    expect(new Set(timestampEdges.map((edge) => edge.source.id)).size).toBe(2);
  });
});

describe("KQL metadata", () => {
  it("keeps function signatures and materialized-view schemas", () => {
    expect(
      parseKqlDatabaseMetadata({
        functions: [
          {
            name: "StationHourlyLoad",
            folder: "Telemetry",
            parameters: [{ name: "stationId", type: "string" }],
            returnType: "table",
          },
        ],
        materializedViews: [
          {
            name: "HourlyLoad",
            sourceTable: "StationTelemetry",
            columns: [{ name: "Count", dataType: "long" }],
          },
        ],
      }),
    ).toMatchObject({
      kind: "kql",
      functions: [{ name: "StationHourlyLoad" }],
      materializedViews: [{ name: "HourlyLoad" }],
    });
  });

  it("rejects KQL bodies, query text, and raw result rows", () => {
    expect(
      parseKqlDatabaseMetadata({
        functions: [
          {
            name: "Unsafe",
            parameters: [],
            body: "Sales | take 10",
          },
        ],
        materializedViews: [],
      }),
    ).toBeUndefined();
    expect(
      parseKqlDatabaseMetadata({
        functions: [],
        materializedViews: [],
        rows: [{ customer: "Ada" }],
      }),
    ).toBeUndefined();
  });

  it("derives KQL metadata from existing schema rows", () => {
    const schema: ModelTableSchema[] = [
      {
        name: "StationHourlyLoad",
        objectType: "Function",
        columns: [{ name: "stationId", dataType: "string" }],
        measures: [],
      },
      {
        name: "HourlyLoad",
        objectType: "Materialized view",
        columns: [{ name: "Count", dataType: "long" }],
        measures: [],
      },
    ];

    expect(itemMetadataFromSchema("KQLDatabase", schema)).toMatchObject({
      kind: "kql",
      functions: [{ name: "StationHourlyLoad" }],
      materializedViews: [{ name: "HourlyLoad" }],
    });
  });
});

describe("schema metadata envelope", () => {
  it("round-trips through the optional schema extension and old snapshots", () => {
    const metadata = parseKqlDatabaseMetadata({
      functions: [{ name: "Health", parameters: [] }],
      materializedViews: [],
    })!;
    const schema = [metadataSchemaEntry(metadata)];

    expect(schema[0]).toMatchObject({
      name: ITEM_METADATA_SCHEMA_NAME,
      objectType: "Atlas item metadata",
      isHidden: true,
      description: JSON.stringify(metadata),
    });
    expect(isItemMetadataSchemaEntry(schema[0])).toBe(true);
    expect(
      isItemMetadataSchemaEntry({
        name: "StationHourlyLoad",
      }),
    ).toBe(false);
    expect(itemMetadataFromSchema("KQLDatabase", schema)).toEqual(metadata);
    expect(
      itemMetadataFromSchema("KQLDatabase", [
        { ...schema[0], metadata: undefined },
      ]),
    ).toEqual(metadata);
    expect(
      itemMetadataFor(
        { schema: { database: schema } },
        "database",
        "KQLDatabase",
      ),
    ).toEqual(metadata);
    expect(
      itemMetadataFromSchema("Ontology", [
        { name: "Legacy", columns: [], measures: [] },
      ]),
    ).toBeUndefined();
  });

  it("projects safe metadata into canonical schema object types", () => {
    const ontology = parseOntologyMetadata({
      entities: [
        {
          id: "customer",
          name: "Customer",
          properties: [],
        },
        {
          id: "asset",
          name: "Asset",
          properties: [
            { id: "asset-id", name: "Asset ID", valueType: "String" },
          ],
        },
      ],
      relationships: [
        {
          name: "owns",
          id: "owns",
          sourceEntityId: "customer",
          targetEntityId: "asset",
        },
      ],
      bindings: [],
    })!;

    expect(projectItemMetadataToSchema(ontology)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Asset",
          objectType: METADATA_OBJECT_TYPES.ontologyEntity,
        }),
        expect.objectContaining({
          name: "owns",
          objectType: METADATA_OBJECT_TYPES.ontologyRelationship,
        }),
        expect.objectContaining({ name: ITEM_METADATA_SCHEMA_NAME }),
      ]),
    );
    expect(OPTIONAL_METADATA_SYNC_SECTIONS).toEqual([
      "kqlSchema",
      "sqlSchema",
      "definitions",
    ]);
  });
});

describe("metadata lineage", () => {
  it("emits only declared source item edges", () => {
    const ontology = parseOntologyMetadata({
      entities: [
        {
          id: "customer",
          name: "Customer",
          properties: [
            { id: "customer-id", name: "CustomerId", valueType: "String" },
          ],
        },
      ],
      relationships: [],
      bindings: [
        {
          id: "customer-binding",
          entityId: "customer",
          sourceItemId: "lakehouse",
          sourceObject: "Customers",
          propertyBindings: [
            {
              sourceColumn: "customer_id",
              targetPropertyId: "customer-id",
            },
          ],
        },
      ],
      contextualizations: [],
    })!;

    expect(metadataItemLineageEdges("ontology", ontology)).toEqual([
      {
        source: "lakehouse",
        target: "ontology",
        relation: "binds ontology",
      },
    ]);
    expect(metadataObjectLineageEdges("ontology", ontology)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: expect.objectContaining({
            itemId: "lakehouse",
            id: "Customers.customer_id",
          }),
          target: expect.objectContaining({
            itemId: "ontology",
            id: "customer-id",
            parentId: "customer",
          }),
          relation: "binds property",
          confidence: "verified",
        }),
      ]),
    );
  });

  it("keeps graph mapping and Data Agent element IDs in lineage edges", () => {
    const graph = parseGraphModelMetadata({
      dataSources: [
        {
          name: "Customers",
          sourceItemId: "lakehouse",
          sourceObject: "dbo.Customers",
        },
      ],
      nodeTypes: [
        {
          alias: "Customer",
          labels: ["Customer"],
          primaryKeyProperties: ["CustomerId"],
          properties: [{ name: "CustomerId", type: "STRING" }],
        },
      ],
      edgeTypes: [],
      nodeTables: [
        {
          id: "customer-map",
          nodeTypeAlias: "Customer",
          dataSourceName: "Customers",
          propertyMappings: [
            {
              propertyName: "CustomerId",
              sourceColumn: "customer_id",
            },
          ],
        },
      ],
      edgeTables: [],
    })!;
    expect(metadataItemLineageEdges("graph", graph)).toEqual([
      {
        source: "lakehouse",
        target: "graph",
        relation: "maps graph",
      },
    ]);
    expect(metadataObjectLineageEdges("graph", graph)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: expect.objectContaining({
            id: "dbo.Customers.customer_id",
          }),
          target: expect.objectContaining({
            id: "Customer.CustomerId",
            parentId: "Customer",
          }),
        }),
      ]),
    );

    const agent = parseDataAgentMetadata({
      sources: [
        {
          artifactId: "graph",
          displayName: "Customer Graph",
          type: "graph",
          elements: [
            {
              id: "customer-node",
              displayName: "Customer",
              type: "graph.nodeType",
              isSelected: true,
            },
          ],
        },
      ],
    })!;
    expect(metadataItemLineageEdges("agent", agent)).toEqual([
      { source: "graph", target: "agent", relation: "grounds" },
    ]);
    expect(metadataObjectLineageEdges("agent", agent)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: expect.objectContaining({
            itemId: "graph",
            id: "graph.nodeType:customer-node",
            kind: "sourceElement",
            parentPath: [],
          }),
          target: expect.objectContaining({
            itemId: "agent",
            id: "graph:graph.nodeType:customer-node",
          }),
          relation: "selected by agent",
          confidence: "verified",
        }),
      ]),
    );
  });

  it("accepts bounded verified object-edge payloads under either field name", () => {
    const edge = {
      source: {
        itemId: "lakehouse",
        kind: "sourceField",
        id: "dbo.Customers.customer_id",
        name: "customer_id",
        parentId: "dbo.Customers",
        tableName: "Customers",
      },
      target: {
        itemId: "ontology",
        kind: "ontologyProperty",
        id: "customer-id",
        name: "CustomerId",
        parentId: "customer",
        tableName: "Customer",
      },
      relation: "binds property",
      confidence: "verified",
    };

    expect(parseObjectLineagePayload({ objectEdges: [edge] })).toEqual({
      objectEdges: [edge],
    });
    expect(
      parseObjectLineagePayload({ objectLineage: { edges: [edge] } }),
    ).toEqual({ objectEdges: [edge] });
  });

  it("normalizes UDF object-kind aliases", () => {
    expect(
      parseObjectLineagePayload({
        objectEdges: [
          {
            source: {
              itemId: "source",
              kind: "column",
              id: "source-column",
              name: "CustomerId",
              tableName: "Customers",
            },
            target: {
              itemId: "ontology",
              kind: "property",
              id: "ontology-property",
              name: "Customer ID",
              tableName: "Customer",
            },
            relation: "binds property",
            confidence: "verified",
          },
        ],
      }),
    ).toMatchObject({
      objectEdges: [
        {
          source: { kind: "sourceField" },
          target: { kind: "ontologyProperty" },
        },
      ],
    });
  });

  it("accepts complete object-edge payloads without a relation-count cap", () => {
    const edgeCount = 2_500;
    const objectEdges = Array.from(
      { length: edgeCount },
      (_, index) => ({
        source: {
          itemId: "source",
          kind: "column",
          id: `source-column-${index}`,
          name: `Source column ${index}`,
          tableName: "Customers",
        },
        target: {
          itemId: "ontology",
          kind: "property",
          id: `ontology-property-${index}`,
          name: `Ontology property ${index}`,
          tableName: "Customer",
        },
        relation: "binds property",
        confidence: "verified",
      }),
    );

    expect(parseObjectLineagePayload({ objectEdges })?.objectEdges).toHaveLength(
      edgeCount,
    );
  });

  it("rejects inferred and malformed object-edge payloads", () => {
    const inferred = {
      source: {
        itemId: "source",
        kind: "sourceObject",
        id: "dbo.Source",
        name: "Source",
      },
      target: {
        itemId: "target",
        kind: "ontologyEntity",
        id: "entity-id",
        name: "Entity",
      },
      relation: "guessed from a name",
      confidence: "inferred",
    };

    expect(parseObjectLineagePayload({ objectEdges: [inferred] })).toBeUndefined();
    expect(
      parseObjectLineagePayload({
        objectEdges: [
          {
            ...inferred,
            confidence: "verified",
            source: { ...inferred.source, id: "" },
          },
        ],
      }),
    ).toBeUndefined();
  });
});
