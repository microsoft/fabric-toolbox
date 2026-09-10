import {
  METADATA_OBJECT_TYPES,
  itemMetadataFor,
  type MetadataObjectKind,
  type MetadataObjectLineageEdge,
  type MetadataObjectRef,
} from "./item-metadata";
import {
  schemaFor,
  type AtlasData,
  type Item,
  type ItemType,
  type ModelColumn,
  type ModelMeasure,
  type ModelTableSchema,
} from "./model";

export const ASSET_OBJECT_KINDS = [
  "table",
  "view",
  "column",
  "measure",
  "kqlTable",
  "kqlColumn",
  "kqlFunction",
  "kqlFunctionParameter",
  "kqlMaterializedView",
  "sqlTable",
  "sqlView",
  "sqlColumn",
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
] as const;

export type AssetObjectKind = (typeof ASSET_OBJECT_KINDS)[number];

export interface CatalogObject {
  id: string;
  objectId: string;
  itemFabricId: string;
  itemName: string;
  itemType: ItemType;
  kind: AssetObjectKind;
  name: string;
  tableName?: string;
  parentName?: string;
  dataType?: string;
  source?: string;
  sourceItemId?: string;
  sourceItemName?: string;
  description?: string;
  isHidden?: boolean;
  expression?: string;
  details: Record<string, unknown>;
  metadataRef?: MetadataObjectRef;
}

const PROJECTED_METADATA_TYPES = new Set(
  Object.values(METADATA_OBJECT_TYPES).map((value) => value.toLowerCase()),
);

const SQL_ITEM_TYPES = new Set<ItemType>([
  "Warehouse",
  "SQLEndpoint",
  "SQLDatabase",
  "Datamart",
]);

const KIND_LABELS: Record<AssetObjectKind, string> = {
  table: "Table",
  view: "View",
  column: "Column",
  measure: "Measure / KPI",
  kqlTable: "KQL table",
  kqlColumn: "KQL column",
  kqlFunction: "KQL function",
  kqlFunctionParameter: "KQL function parameter",
  kqlMaterializedView: "KQL materialized view",
  sqlTable: "SQL table",
  sqlView: "SQL view",
  sqlColumn: "SQL column",
  ontologyEntity: "Ontology entity",
  ontologyProperty: "Ontology property",
  ontologyTimeSeriesProperty: "Ontology time-series property",
  ontologyRelationship: "Ontology relationship",
  ontologyContextualization: "Ontology contextualization",
  graphNode: "Graph node type",
  graphEdge: "Graph edge type",
  graphProperty: "Graph property",
  graphSourceMapping: "Graph source mapping",
  dataAgentSource: "Data Agent source",
  dataAgentElement: "Data Agent selected source element",
};

const METADATA_KIND_LABELS: Record<MetadataObjectKind, string> = {
  sourceObject: "Source object",
  sourceField: "Source field",
  sourceElement: "Source element",
  ontologyEntity: "Ontology entity",
  ontologyProperty: "Ontology property",
  ontologyRelationship: "Ontology relationship",
  ontologyContextualization: "Ontology contextualization",
  graphNode: "Graph node type",
  graphEdge: "Graph edge type",
  graphProperty: "Graph property",
  dataAgentSource: "Data Agent source",
  dataAgentElement: "Data Agent selected element",
  kqlFunction: "KQL function",
  kqlMaterializedView: "KQL materialized view",
};

export function assetObjectKindLabel(kind: AssetObjectKind): string {
  return KIND_LABELS[kind];
}

export function metadataObjectKindLabel(kind: MetadataObjectKind): string {
  return METADATA_KIND_LABELS[kind];
}

export function isAssetObjectKind(value: string): value is AssetObjectKind {
  return (ASSET_OBJECT_KINDS as readonly string[]).includes(value);
}

export function isMetadataAssetKind(kind: AssetObjectKind): boolean {
  return !["table", "view", "column", "measure"].includes(kind);
}

export function catalogObjectKey(
  itemId: string,
  kind: AssetObjectKind,
  objectId: string,
): string {
  return [itemId, kind, objectId].map(encodeURIComponent).join("::");
}

function clean(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result || undefined;
}

function sourceItemName(
  itemsById: ReadonlyMap<string, Item>,
  itemId: string | undefined,
): string | undefined {
  return itemId ? itemsById.get(itemId)?.displayName : undefined;
}

function schemaTableKind(
  itemType: ItemType,
  table: ModelTableSchema,
): AssetObjectKind {
  const objectType = table.objectType?.trim().toLowerCase() ?? "";
  if (objectType === METADATA_OBJECT_TYPES.kqlFunction.toLowerCase()) {
    return "kqlFunction";
  }
  if (
    objectType === METADATA_OBJECT_TYPES.kqlMaterializedView.toLowerCase()
  ) {
    return "kqlMaterializedView";
  }
  if (objectType === METADATA_OBJECT_TYPES.ontologyEntity.toLowerCase()) {
    return "ontologyEntity";
  }
  if (
    objectType === METADATA_OBJECT_TYPES.ontologyRelationship.toLowerCase()
  ) {
    return "ontologyRelationship";
  }
  if (objectType === METADATA_OBJECT_TYPES.graphNode.toLowerCase()) {
    return "graphNode";
  }
  if (objectType === METADATA_OBJECT_TYPES.graphEdge.toLowerCase()) {
    return "graphEdge";
  }
  if (objectType === METADATA_OBJECT_TYPES.dataAgentSource.toLowerCase()) {
    return "dataAgentSource";
  }
  const isView = objectType.includes("view");
  if (itemType === "KQLDatabase") {
    return isView ? "kqlMaterializedView" : "kqlTable";
  }
  if (SQL_ITEM_TYPES.has(itemType)) return isView ? "sqlView" : "sqlTable";
  return isView ? "view" : "table";
}

function schemaColumnKind(
  itemType: ItemType,
  tableKind: AssetObjectKind,
  column: ModelColumn,
): AssetObjectKind {
  const objectType = column.objectType?.trim().toLowerCase();
  if (objectType === "ontology property") return "ontologyProperty";
  if (objectType === "ontology time-series property") {
    return "ontologyTimeSeriesProperty";
  }
  if (objectType === "graph property") return "graphProperty";
  if (objectType === "data agent selected element") {
    return "dataAgentElement";
  }
  if (itemType === "KQLDatabase") {
    return tableKind === "kqlFunction"
      ? "kqlFunctionParameter"
      : "kqlColumn";
  }
  return SQL_ITEM_TYPES.has(itemType) ? "sqlColumn" : "column";
}

function metadataKindForAsset(
  kind: AssetObjectKind,
): MetadataObjectKind | undefined {
  const mapping: Partial<Record<AssetObjectKind, MetadataObjectKind>> = {
    table: "sourceObject",
    view: "sourceObject",
    column: "sourceField",
    measure: "sourceField",
    kqlTable: "sourceObject",
    kqlColumn: "sourceField",
    kqlFunction: "kqlFunction",
    kqlMaterializedView: "kqlMaterializedView",
    sqlTable: "sourceObject",
    sqlView: "sourceObject",
    sqlColumn: "sourceField",
    ontologyEntity: "ontologyEntity",
    ontologyProperty: "ontologyProperty",
    ontologyTimeSeriesProperty: "ontologyProperty",
    ontologyRelationship: "ontologyRelationship",
    ontologyContextualization: "ontologyContextualization",
    graphNode: "graphNode",
    graphEdge: "graphEdge",
    graphProperty: "graphProperty",
    dataAgentSource: "dataAgentSource",
    dataAgentElement: "dataAgentElement",
  };
  return mapping[kind];
}

function matchingMetadataRef(
  data: Pick<AtlasData, "objectEdges">,
  itemId: string,
  kind: AssetObjectKind,
  name: string,
  tableName?: string,
): MetadataObjectRef | undefined {
  const metadataKind = metadataKindForAsset(kind);
  if (!metadataKind) return undefined;
  const references = (data.objectEdges ?? []).flatMap((edge) => [
    edge.source,
    edge.target,
  ]);
  return references.find(
    (reference) =>
      reference.itemId === itemId &&
      reference.kind === metadataKind &&
      reference.name === name &&
      (!tableName || reference.tableName === tableName),
  );
}

function schemaTableValue(table: ModelTableSchema): Record<string, unknown> {
  return {
    rows: table.rows,
    objectType: clean(table.objectType),
    source: clean(table.source),
    description: clean(table.description),
    isHidden: table.isHidden,
  };
}

function schemaColumnValue(column: ModelColumn): Record<string, unknown> {
  return {
    dataType: clean(column.dataType),
    description: clean(column.description),
    isHidden: column.isHidden,
  };
}

function schemaMeasureValue(measure: ModelMeasure): Record<string, unknown> {
  return {
    expression: clean(measure.expr),
    description: clean(measure.description),
    isHidden: measure.isHidden,
  };
}

function dataAgentElementStableId(element: {
  id: string;
  elementType: string;
  parentPath: string[];
}): string {
  return [...element.parentPath, `${element.elementType}:${element.id}`].join(
    "/",
  );
}

function metadataReference(
  itemId: string,
  kind: MetadataObjectKind,
  id: string,
  name: string,
  options: {
    parentId?: string;
    parentPath?: string[];
    tableName?: string;
  } = {},
): MetadataObjectRef {
  return { itemId, kind, id, name, ...options };
}

export function buildCatalogObjects(
  data: Pick<
    AtlasData,
    "items" | "schema" | "itemMetadata" | "objectEdges" | "config"
  >,
  options: { includeConfigTables?: boolean } = {},
): CatalogObject[] {
  const result: CatalogObject[] = [];
  const seen = new Set<string>();
  const itemsById = new Map(data.items.map((item) => [item.fabricId, item]));
  const add = (
    item: Item,
    object: Omit<CatalogObject, "id" | "itemFabricId" | "itemName" | "itemType">,
  ) => {
    const id = catalogObjectKey(item.fabricId, object.kind, object.objectId);
    if (seen.has(id)) return;
    seen.add(id);
    result.push({
      ...object,
      id,
      itemFabricId: item.fabricId,
      itemName: item.displayName,
      itemType: item.itemType,
    });
  };

  for (const item of data.items) {
    const metadata =
      data.itemMetadata?.[item.fabricId] ??
      itemMetadataFor(data, item.fabricId, item.itemType);
    for (const table of schemaFor(data, item.fabricId) ?? []) {
      const normalizedObjectType =
        table.objectType?.trim().toLowerCase() ?? "";
      if (
        (metadata &&
          PROJECTED_METADATA_TYPES.has(normalizedObjectType)) ||
        (metadata?.kind === "kql" &&
          ["function", "stored function", "materialized view", "materializedview"].includes(
            normalizedObjectType,
          ))
      ) {
        continue;
      }
      const tableKind = schemaTableKind(item.itemType, table);
      const tableRef = matchingMetadataRef(
        data,
        item.fabricId,
        tableKind,
        table.name,
      );
      const tableObjectId = tableRef?.id ?? table.name;
      add(item, {
        objectId: tableObjectId,
        kind: tableKind,
        name: table.name,
        dataType: clean(table.objectType),
        source: clean(table.source),
        description: clean(table.description),
        isHidden: table.isHidden,
        details: schemaTableValue(table),
        metadataRef: tableRef,
      });
      for (const column of table.columns) {
        const columnKind = schemaColumnKind(
          item.itemType,
          tableKind,
          column,
        );
        const columnRef = matchingMetadataRef(
          data,
          item.fabricId,
          columnKind,
          column.name,
          table.name,
        );
        add(item, {
          objectId: columnRef?.id ?? `${tableObjectId}/${column.name}`,
          kind: columnKind,
          name: column.name,
          tableName: table.name,
          parentName: table.name,
          dataType: column.dataType,
          description: clean(column.description),
          isHidden: column.isHidden,
          details: schemaColumnValue(column),
          metadataRef: columnRef,
        });
      }
      for (const measure of table.measures) {
        add(item, {
          objectId: `${tableObjectId}/${measure.name}`,
          kind: "measure",
          name: measure.name,
          tableName: table.name,
          parentName: table.name,
          description: clean(measure.description),
          isHidden: measure.isHidden,
          expression: clean(measure.expr),
          details: schemaMeasureValue(measure),
        });
      }
    }

    if (!metadata) continue;
    if (metadata.kind === "ontology") {
      const entityById = new Map(
        metadata.entities.map((entity) => [entity.id, entity]),
      );
      for (const entity of metadata.entities) {
        const bindings = metadata.bindings.filter(
          (binding) => binding.entityId === entity.id,
        );
        add(item, {
          objectId: entity.id,
          kind: "ontologyEntity",
          name: entity.name,
          source: clean(entity.namespace),
          sourceItemId: bindings[0]?.sourceItemId,
          sourceItemName: sourceItemName(
            itemsById,
            bindings[0]?.sourceItemId,
          ),
          details: {
            namespace: clean(entity.namespace),
            keyPropertyIds: [...entity.keyPropertyIds],
            displayNamePropertyId: clean(entity.displayNamePropertyId),
            sourceBindings: bindings.map((binding) => ({
              sourceItemId: binding.sourceItemId,
              sourceSchema: clean(binding.sourceSchema),
              sourceObject: binding.sourceObject,
              bindingType: binding.bindingType,
            })),
          },
          metadataRef: metadataReference(
            item.fabricId,
            "ontologyEntity",
            entity.id,
            entity.name,
          ),
        });
        for (const property of entity.properties) {
          const binding = bindings
            .flatMap((candidate) =>
              candidate.propertyBindings.map((propertyBinding) => ({
                candidate,
                propertyBinding,
              })),
            )
            .find(
              ({ propertyBinding }) =>
                propertyBinding.targetPropertyId === property.id,
            );
          const kind = property.timeSeries
            ? "ontologyTimeSeriesProperty"
            : "ontologyProperty";
          add(item, {
            objectId: `${entity.id}/${property.id}`,
            kind,
            name: property.name,
            tableName: entity.name,
            parentName: entity.name,
            dataType: property.valueType,
            source: binding?.propertyBinding.sourceColumn,
            sourceItemId: binding?.candidate.sourceItemId,
            sourceItemName: sourceItemName(
              itemsById,
              binding?.candidate.sourceItemId,
            ),
            details: {
              valueType: property.valueType,
              timeSeries: property.timeSeries,
              sourceColumn: binding?.propertyBinding.sourceColumn,
              sourceObject: binding?.candidate.sourceObject,
              sourceSchema: clean(binding?.candidate.sourceSchema),
            },
            metadataRef: metadataReference(
              item.fabricId,
              "ontologyProperty",
              property.id,
              property.name,
              { parentId: entity.id, tableName: entity.name },
            ),
          });
        }
      }
      for (const relationship of metadata.relationships) {
        add(item, {
          objectId: relationship.id,
          kind: "ontologyRelationship",
          name: relationship.name,
          source: `${entityById.get(relationship.sourceEntityId)?.name ?? relationship.sourceEntityId} to ${entityById.get(relationship.targetEntityId)?.name ?? relationship.targetEntityId}`,
          details: {
            sourceEntityId: relationship.sourceEntityId,
            targetEntityId: relationship.targetEntityId,
          },
          metadataRef: metadataReference(
            item.fabricId,
            "ontologyRelationship",
            relationship.id,
            relationship.name,
          ),
        });
      }
      for (const contextualization of metadata.contextualizations) {
        const relationship = metadata.relationships.find(
          (candidate) => candidate.id === contextualization.relationshipId,
        );
        add(item, {
          objectId: contextualization.id,
          kind: "ontologyContextualization",
          name: contextualization.sourceObject,
          parentName: relationship?.name ?? contextualization.relationshipId,
          source: clean(contextualization.sourceSchema)
            ? `${contextualization.sourceSchema}.${contextualization.sourceObject}`
            : contextualization.sourceObject,
          sourceItemId: contextualization.sourceItemId,
          sourceItemName: sourceItemName(
            itemsById,
            contextualization.sourceItemId,
          ),
          details: {
            relationshipId: contextualization.relationshipId,
            sourceItemId: contextualization.sourceItemId,
            sourceSchema: clean(contextualization.sourceSchema),
            sourceObject: contextualization.sourceObject,
            sourceKeyColumns: contextualization.sourceKeyBindings.map(
              (binding) => binding.sourceColumn,
            ),
            targetKeyColumns: contextualization.targetKeyBindings.map(
              (binding) => binding.sourceColumn,
            ),
          },
          metadataRef: metadataReference(
            item.fabricId,
            "ontologyContextualization",
            contextualization.id,
            contextualization.sourceObject,
            { parentId: contextualization.relationshipId },
          ),
        });
      }
    } else if (metadata.kind === "graphModel") {
      const mappingsByType = new Map<string, typeof metadata.mappings>();
      for (const mapping of metadata.mappings) {
        mappingsByType.set(mapping.typeAlias, [
          ...(mappingsByType.get(mapping.typeAlias) ?? []),
          mapping,
        ]);
      }
      for (const node of metadata.nodeTypes) {
        const mappings = mappingsByType.get(node.alias) ?? [];
        add(item, {
          objectId: node.alias,
          kind: "graphNode",
          name: node.alias,
          description: node.labels.join(", ") || undefined,
          source: mappings[0]?.sourceObject,
          sourceItemId: mappings[0]?.sourceItemId,
          sourceItemName: sourceItemName(
            itemsById,
            mappings[0]?.sourceItemId,
          ),
          details: {
            labels: [...node.labels],
            primaryKeyProperties: [...node.primaryKeyProperties],
          },
          metadataRef: metadataReference(
            item.fabricId,
            "graphNode",
            node.alias,
            node.alias,
          ),
        });
        for (const property of node.properties) {
          const mapping = mappings
            .flatMap((candidate) =>
              candidate.propertyMappings.map((propertyMapping) => ({
                candidate,
                propertyMapping,
              })),
            )
            .find(
              ({ propertyMapping }) =>
                propertyMapping.propertyName === property.name,
            );
          add(item, {
            objectId: `${node.alias}/${property.name}`,
            kind: "graphProperty",
            name: property.name,
            tableName: node.alias,
            parentName: node.alias,
            dataType: property.dataType,
            source: mapping?.propertyMapping.sourceColumn,
            sourceItemId: mapping?.candidate.sourceItemId,
            sourceItemName: sourceItemName(
              itemsById,
              mapping?.candidate.sourceItemId,
            ),
            details: {
              dataType: property.dataType,
              primaryKey: node.primaryKeyProperties.includes(property.name),
              sourceColumn: mapping?.propertyMapping.sourceColumn,
              sourceObject: mapping?.candidate.sourceObject,
            },
            metadataRef: metadataReference(
              item.fabricId,
              "graphProperty",
              `${node.alias}.${property.name}`,
              property.name,
              { parentId: node.alias, tableName: node.alias },
            ),
          });
        }
      }
      for (const edge of metadata.edgeTypes) {
        const mappings = mappingsByType.get(edge.alias) ?? [];
        add(item, {
          objectId: edge.alias,
          kind: "graphEdge",
          name: edge.alias,
          description: edge.labels.join(", ") || undefined,
          source: `${edge.sourceNodeType} to ${edge.destinationNodeType}`,
          sourceItemId: mappings[0]?.sourceItemId,
          sourceItemName: sourceItemName(
            itemsById,
            mappings[0]?.sourceItemId,
          ),
          details: {
            labels: [...edge.labels],
            sourceNodeType: edge.sourceNodeType,
            destinationNodeType: edge.destinationNodeType,
          },
          metadataRef: metadataReference(
            item.fabricId,
            "graphEdge",
            edge.alias,
            edge.alias,
          ),
        });
        for (const property of edge.properties) {
          const mapping = mappings
            .flatMap((candidate) =>
              candidate.propertyMappings.map((propertyMapping) => ({
                candidate,
                propertyMapping,
              })),
            )
            .find(
              ({ propertyMapping }) =>
                propertyMapping.propertyName === property.name,
            );
          add(item, {
            objectId: `${edge.alias}/${property.name}`,
            kind: "graphProperty",
            name: property.name,
            tableName: edge.alias,
            parentName: edge.alias,
            dataType: property.dataType,
            source: mapping?.propertyMapping.sourceColumn,
            sourceItemId: mapping?.candidate.sourceItemId,
            sourceItemName: sourceItemName(
              itemsById,
              mapping?.candidate.sourceItemId,
            ),
            details: {
              dataType: property.dataType,
              sourceColumn: mapping?.propertyMapping.sourceColumn,
              sourceObject: mapping?.candidate.sourceObject,
            },
            metadataRef: metadataReference(
              item.fabricId,
              "graphProperty",
              `${edge.alias}.${property.name}`,
              property.name,
              { parentId: edge.alias, tableName: edge.alias },
            ),
          });
        }
      }
      for (const mapping of metadata.mappings) {
        add(item, {
          objectId: mapping.id,
          kind: "graphSourceMapping",
          name: mapping.dataSourceName,
          parentName: mapping.typeAlias,
          source: mapping.sourceObject,
          sourceItemId: mapping.sourceItemId,
          sourceItemName: sourceItemName(itemsById, mapping.sourceItemId),
          details: {
            mappingKind: mapping.kind,
            targetType: mapping.typeAlias,
            sourceItemId: mapping.sourceItemId,
            sourceObject: mapping.sourceObject,
            propertyMappings: mapping.propertyMappings.map(
              (propertyMapping) => ({
                propertyName: propertyMapping.propertyName,
                sourceColumn: propertyMapping.sourceColumn,
              }),
            ),
          },
        });
      }
    } else if (metadata.kind === "dataAgent") {
      for (const source of metadata.sources) {
        add(item, {
          objectId: source.artifactId,
          kind: "dataAgentSource",
          name: source.displayName,
          dataType: source.sourceType,
          source: source.artifactId,
          sourceItemId: source.artifactId,
          sourceItemName:
            sourceItemName(itemsById, source.artifactId) ??
            source.displayName,
          details: {
            artifactId: source.artifactId,
            workspaceId: clean(source.workspaceId),
            sourceType: source.sourceType,
            selectedElementCount: source.selectedElements.length,
          },
          metadataRef: metadataReference(
            item.fabricId,
            "dataAgentSource",
            source.artifactId,
            source.displayName,
          ),
        });
        for (const element of source.selectedElements) {
          const stableId = dataAgentElementStableId(element);
          const tableName =
            element.elementType.toLowerCase().endsWith(".table") ||
            element.elementType.toLowerCase() === "ontology.entity"
              ? element.displayName
              : element.parentName;
          add(item, {
            objectId: `${source.artifactId}:${stableId}`,
            kind: "dataAgentElement",
            name: element.displayName,
            tableName,
            parentName:
              element.parentName ??
              element.parentPath.at(-1) ??
              source.displayName,
            dataType: clean(element.dataType) ?? element.elementType,
            source: element.parentPath.join(" / ") || source.displayName,
            sourceItemId: source.artifactId,
            sourceItemName:
              sourceItemName(itemsById, source.artifactId) ??
              source.displayName,
            details: {
              elementType: element.elementType,
              dataType: clean(element.dataType),
              parentPath: [...element.parentPath],
              sourceArtifactId: source.artifactId,
            },
            metadataRef: metadataReference(
              item.fabricId,
              "dataAgentElement",
              `${source.artifactId}:${stableId}`,
              element.displayName,
              {
                parentId: element.parentId
                  ? `${source.artifactId}:${element.parentId}`
                  : source.artifactId,
                parentPath: [...element.parentPath],
                tableName,
              },
            ),
          });
        }
      }
    } else {
      for (const fn of metadata.functions) {
        add(item, {
          objectId: fn.name,
          kind: "kqlFunction",
          name: fn.name,
          dataType: clean(fn.returnType),
          source: clean(fn.folder),
          description: clean(fn.description),
          details: {
            folder: clean(fn.folder),
            description: clean(fn.description),
            returnType: clean(fn.returnType),
            parameters: fn.parameters.map((parameter) => ({
              name: parameter.name,
              dataType: parameter.dataType,
            })),
          },
          metadataRef: metadataReference(
            item.fabricId,
            "kqlFunction",
            fn.name,
            fn.name,
          ),
        });
        for (const parameter of fn.parameters) {
          add(item, {
            objectId: `${fn.name}/${parameter.name}`,
            kind: "kqlFunctionParameter",
            name: parameter.name,
            tableName: fn.name,
            parentName: fn.name,
            dataType: parameter.dataType,
            details: { dataType: parameter.dataType },
          });
        }
      }
      for (const view of metadata.materializedViews) {
        add(item, {
          objectId: view.name,
          kind: "kqlMaterializedView",
          name: view.name,
          source: clean(view.sourceTable),
          description: clean(view.description),
          details: {
            sourceTable: clean(view.sourceTable),
            description: clean(view.description),
          },
          metadataRef: metadataReference(
            item.fabricId,
            "kqlMaterializedView",
            view.name,
            view.name,
          ),
        });
        for (const column of view.columns) {
          add(item, {
            objectId: `${view.name}/${column.name}`,
            kind: "kqlColumn",
            name: column.name,
            tableName: view.name,
            parentName: view.name,
            dataType: column.dataType,
            details: { dataType: column.dataType },
          });
        }
      }
    }
  }

  if (options.includeConfigTables) {
    for (const entry of data.config) {
      if (entry.section !== "Tables") continue;
      const item = itemsById.get(entry.itemFabricId);
      if (!item) continue;
      add(item, {
        objectId: entry.label,
        kind: schemaTableKind(item.itemType, {
          name: entry.label,
          columns: [],
          measures: [],
        }),
        name: entry.label,
        details: {},
      });
    }
  }

  return result.sort(
    (left, right) =>
      left.itemName.localeCompare(right.itemName) ||
      assetObjectKindLabel(left.kind).localeCompare(
        assetObjectKindLabel(right.kind),
      ) ||
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id),
  );
}

export function findCatalogObject(
  data: Pick<
    AtlasData,
    "items" | "schema" | "itemMetadata" | "objectEdges" | "config"
  >,
  reference: {
    itemId: string;
    kind: AssetObjectKind;
    objectId?: string;
    name?: string;
    tableName?: string;
  },
): CatalogObject | undefined {
  return buildCatalogObjects(data).find(
    (object) =>
      object.itemFabricId === reference.itemId &&
      object.kind === reference.kind &&
      (reference.objectId
        ? object.objectId === reference.objectId
        : object.name === reference.name &&
          (!reference.tableName ||
            object.tableName === reference.tableName ||
            object.parentName === reference.tableName)),
  );
}

export function metadataObjectRefKey(reference: MetadataObjectRef): string {
  return [
    reference.itemId,
    reference.kind,
    reference.id,
    reference.parentId ?? "",
  ].join("\u0000");
}

export function verifiedMetadataEdgesForItem(
  edges: readonly MetadataObjectLineageEdge[] | undefined,
  itemId: string,
): MetadataObjectLineageEdge[] {
  return (edges ?? []).filter(
    (edge) =>
      edge.confidence === "verified" &&
      (edge.source.itemId === itemId || edge.target.itemId === itemId),
  );
}

export function metadataObjectImpact(
  edges: readonly MetadataObjectLineageEdge[] | undefined,
  subject: MetadataObjectRef,
): {
  upstream: MetadataObjectRef[];
  downstream: MetadataObjectRef[];
  relevantEdges: MetadataObjectLineageEdge[];
} {
  const verified = (edges ?? []).filter(
    (edge) => edge.confidence === "verified",
  );
  const incoming = new Map<string, MetadataObjectLineageEdge[]>();
  const outgoing = new Map<string, MetadataObjectLineageEdge[]>();
  for (const edge of verified) {
    const sourceKey = metadataObjectRefKey(edge.source);
    const targetKey = metadataObjectRefKey(edge.target);
    outgoing.set(sourceKey, [...(outgoing.get(sourceKey) ?? []), edge]);
    incoming.set(targetKey, [...(incoming.get(targetKey) ?? []), edge]);
  }
  const walk = (direction: "upstream" | "downstream") => {
    const start = metadataObjectRefKey(subject);
    const visited = new Set([start]);
    const queue = [subject];
    const objects = new Map<string, MetadataObjectRef>();
    const relevant = new Map<string, MetadataObjectLineageEdge>();
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      const candidates =
        direction === "upstream"
          ? incoming.get(metadataObjectRefKey(current)) ?? []
          : outgoing.get(metadataObjectRefKey(current)) ?? [];
      for (const edge of candidates) {
        const next =
          direction === "upstream" ? edge.source : edge.target;
        const key = metadataObjectRefKey(next);
        relevant.set(
          [
            metadataObjectRefKey(edge.source),
            metadataObjectRefKey(edge.target),
            edge.relation,
          ].join("\u0001"),
          edge,
        );
        if (visited.has(key)) continue;
        visited.add(key);
        objects.set(key, next);
        queue.push(next);
      }
    }
    return { objects: [...objects.values()], edges: [...relevant.values()] };
  };
  const upstream = walk("upstream");
  const downstream = walk("downstream");
  return {
    upstream: upstream.objects,
    downstream: downstream.objects,
    relevantEdges: [
      ...new Map(
        [...upstream.edges, ...downstream.edges].map((edge) => [
          [
            metadataObjectRefKey(edge.source),
            metadataObjectRefKey(edge.target),
            edge.relation,
          ].join("\u0001"),
          edge,
        ]),
      ).values(),
    ],
  };
}
