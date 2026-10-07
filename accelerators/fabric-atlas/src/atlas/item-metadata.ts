import type { AtlasData, Edge, ItemType, ModelTableSchema } from "./model";

export const ITEM_METADATA_SCHEMA_NAME = "__atlas_item_metadata_v1__";

export const OPTIONAL_METADATA_SYNC_SECTIONS = [
  "kqlSchema",
  "sqlSchema",
  "definitions",
] as const;

export const METADATA_OBJECT_TYPES = {
  kqlTable: "KQL table",
  kqlFunction: "KQL function",
  kqlMaterializedView: "KQL materialized view",
  sqlTable: "SQL table",
  sqlView: "SQL view",
  ontologyEntity: "Ontology entity",
  ontologyRelationship: "Ontology relationship",
  graphNode: "Graph node",
  graphEdge: "Graph edge",
  dataAgentSource: "Data Agent source",
} as const;

export const DATA_AGENT_LINEAGE_ELEMENT_TYPES = [
  "lakehouse_tables.table",
  "lakehouse_tables.column",
  "warehouse_tables.table",
  "warehouse_tables.column",
  "semantic_model.table",
  "semantic_model.column",
  "semantic_model.measure",
  "kusto.table",
  "kusto.column",
  "kusto.function",
  "kusto.materializedview",
  "ontology.entity",
  "graph.nodetype",
  "graph.edgetype",
] as const;

export type OptionalMetadataSyncSection =
  (typeof OPTIONAL_METADATA_SYNC_SECTIONS)[number];

export type MetadataObjectType =
  (typeof METADATA_OBJECT_TYPES)[keyof typeof METADATA_OBJECT_TYPES];

export interface OntologyPropertyMetadata {
  id: string;
  name: string;
  valueType: string;
  timeSeries: boolean;
}

export interface OntologyEntityMetadata {
  id: string;
  name: string;
  namespace?: string;
  keyPropertyIds: string[];
  displayNamePropertyId?: string;
  properties: OntologyPropertyMetadata[];
}

export interface OntologyRelationshipMetadata {
  id: string;
  name: string;
  sourceEntityId: string;
  targetEntityId: string;
}

export interface OntologyPropertyBindingMetadata {
  sourceColumn: string;
  targetPropertyId: string;
}

export interface OntologyBindingMetadata {
  id: string;
  entityId: string;
  bindingType: string;
  sourceItemId: string;
  sourceWorkspaceId?: string;
  sourceType?: string;
  sourceSchema?: string;
  sourceObject: string;
  sourceObjectId?: string;
  timestampColumn?: string;
  propertyBindings: OntologyPropertyBindingMetadata[];
}

export interface OntologyContextualizationMetadata {
  id: string;
  relationshipId: string;
  sourceItemId: string;
  sourceWorkspaceId?: string;
  sourceType?: string;
  sourceSchema?: string;
  sourceObject: string;
  sourceObjectId?: string;
  sourceKeyBindings: OntologyPropertyBindingMetadata[];
  targetKeyBindings: OntologyPropertyBindingMetadata[];
}

export interface OntologyMetadata {
  kind: "ontology";
  entities: OntologyEntityMetadata[];
  relationships: OntologyRelationshipMetadata[];
  bindings: OntologyBindingMetadata[];
  contextualizations: OntologyContextualizationMetadata[];
}

export interface GraphPropertyMetadata {
  name: string;
  dataType: string;
}

export interface GraphNodeTypeMetadata {
  alias: string;
  labels: string[];
  primaryKeyProperties: string[];
  properties: GraphPropertyMetadata[];
}

export interface GraphEdgeTypeMetadata {
  alias: string;
  labels: string[];
  sourceNodeType: string;
  destinationNodeType: string;
  properties: GraphPropertyMetadata[];
}

export interface GraphPropertyMappingMetadata {
  propertyName: string;
  sourceColumn: string;
}

export interface GraphDataSourceMetadata {
  name: string;
  sourceItemId: string;
  sourceWorkspaceId?: string;
  sourceObject: string;
  sourceObjectId?: string;
  sourceType?: string;
}

export interface GraphMappingMetadata {
  id: string;
  kind: "node" | "edge";
  typeAlias: string;
  dataSourceName: string;
  sourceItemId: string;
  sourceWorkspaceId?: string;
  sourceObject: string;
  sourceObjectId?: string;
  propertyMappings: GraphPropertyMappingMetadata[];
  sourceNodeKeyColumns?: string[];
  destinationNodeKeyColumns?: string[];
}

type ParsedGraphMappingMetadata = Omit<
  GraphMappingMetadata,
  "sourceItemId" | "sourceObject"
> & {
  sourceItemId?: string;
  sourceObject?: string;
};

function isCompleteGraphMapping(
  mapping: ParsedGraphMappingMetadata,
): mapping is GraphMappingMetadata {
  return !!mapping.sourceItemId && !!mapping.sourceObject;
}

export interface GraphModelMetadata {
  kind: "graphModel";
  dataSources: GraphDataSourceMetadata[];
  nodeTypes: GraphNodeTypeMetadata[];
  edgeTypes: GraphEdgeTypeMetadata[];
  mappings: GraphMappingMetadata[];
}

export interface DataAgentElementMetadata {
  id: string;
  displayName: string;
  elementType: string;
  selected: boolean;
  sourceArtifactId: string;
  dataType?: string;
  parentId?: string;
  parentName?: string;
  parentPath: string[];
  state?: string;
  indexState?: string;
  children: DataAgentElementMetadata[];
}

export interface DataAgentSelectedElementMetadata {
  id: string;
  displayName: string;
  elementType: string;
  sourceArtifactId: string;
  dataType?: string;
  parentId?: string;
  parentName?: string;
  parentPath: string[];
  state?: string;
  indexState?: string;
}

export interface DataAgentSourceMetadata {
  artifactId: string;
  workspaceId?: string;
  displayName: string;
  sourceType: string;
  elements: DataAgentElementMetadata[];
  selectedElements: DataAgentSelectedElementMetadata[];
}

export interface DataAgentMetadata {
  kind: "dataAgent";
  sources: DataAgentSourceMetadata[];
}

export interface KqlFunctionParameterMetadata {
  name: string;
  dataType: string;
}

export interface KqlFunctionMetadata {
  name: string;
  folder?: string;
  description?: string;
  parameters: KqlFunctionParameterMetadata[];
  returnType?: string;
}

export interface KqlColumnMetadata {
  name: string;
  dataType: string;
}

export interface KqlMaterializedViewMetadata {
  name: string;
  sourceTable?: string;
  description?: string;
  columns: KqlColumnMetadata[];
}

export interface KqlDatabaseMetadata {
  kind: "kql";
  functions: KqlFunctionMetadata[];
  materializedViews: KqlMaterializedViewMetadata[];
}

export type FabricItemMetadata =
  | OntologyMetadata
  | GraphModelMetadata
  | DataAgentMetadata
  | KqlDatabaseMetadata;

export type MetadataObjectKind =
  | "sourceObject"
  | "sourceField"
  | "sourceElement"
  | "ontologyEntity"
  | "ontologyProperty"
  | "ontologyRelationship"
  | "ontologyContextualization"
  | "graphNode"
  | "graphEdge"
  | "graphProperty"
  | "dataAgentSource"
  | "dataAgentElement"
  | "kqlFunction"
  | "kqlMaterializedView";

export interface MetadataObjectRef {
  itemId: string;
  kind: MetadataObjectKind;
  id: string;
  name: string;
  parentId?: string;
  parentPath?: string[];
  tableName?: string;
}

export interface MetadataObjectLineageEdge {
  source: MetadataObjectRef;
  target: MetadataObjectRef;
  relation: string;
  confidence: "verified";
}

export interface ObjectLineagePayload {
  objectEdges: MetadataObjectLineageEdge[];
}

const MAX_NAME_LENGTH = 256;
const MAX_DESCRIPTION_LENGTH = 512;
const MAX_COLLECTION_SIZE = 512;
export const MAX_DATA_AGENT_ELEMENTS = 2_048;
const MAX_NESTING_DEPTH = 16;
const MAX_VISITED_VALUES = 10_000;
const MAX_SERIALIZED_METADATA_LENGTH = 1_000_000;

const FORBIDDEN_CONTENT_KEYS = new Set([
  "aiinstructions",
  "body",
  "content",
  "data",
  "datasourceinstructions",
  "definition",
  "expression",
  "fewshots",
  "filter",
  "filters",
  "instances",
  "payload",
  "prompt",
  "prompts",
  "queries",
  "query",
  "question",
  "questions",
  "records",
  "rows",
  "sampledata",
  "script",
  "values",
]);

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizedKey(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function containsUnsafeContent(
  value: unknown,
  maxVisitedValues = MAX_VISITED_VALUES,
  maxArrayLength = MAX_DATA_AGENT_ELEMENTS,
): boolean {
  const ancestors = new WeakSet<object>();
  let visited = 0;

  const walk = (candidate: unknown, depth: number): boolean => {
    visited += 1;
    if (visited > maxVisitedValues || depth > MAX_NESTING_DEPTH) return true;
    if (!candidate || typeof candidate !== "object") return false;
    if (ancestors.has(candidate)) return true;
    ancestors.add(candidate);

    if (Array.isArray(candidate)) {
      if (candidate.length > maxArrayLength) return true;
      const unsafe = candidate.some((entry) => walk(entry, depth + 1));
      ancestors.delete(candidate);
      return unsafe;
    }

    const unsafe = Object.entries(candidate).some(
      ([key, entry]) =>
        FORBIDDEN_CONTENT_KEYS.has(normalizedKey(key)) ||
        walk(entry, depth + 1),
    );
    ancestors.delete(candidate);
    return unsafe;
  };

  return walk(value, 0);
}

function text(
  value: unknown,
  maxLength = MAX_NAME_LENGTH,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  const hasControlCharacter = [...normalized].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
  if (
    !normalized ||
    normalized.length > maxLength ||
    hasControlCharacter
  ) {
    return undefined;
  }
  return normalized;
}

function optionalText(
  value: unknown,
  maxLength = MAX_NAME_LENGTH,
): string | undefined | null {
  if (value == null || value === "") return undefined;
  return text(value, maxLength) ?? null;
}

function firstText(
  value: UnknownRecord,
  keys: string[],
  maxLength = MAX_NAME_LENGTH,
): string | undefined {
  for (const key of keys) {
    const parsed = text(value[key], maxLength);
    if (parsed) return parsed;
  }
  return undefined;
}

function firstRecord(
  value: UnknownRecord,
  keys: string[],
): UnknownRecord | undefined {
  for (const key of keys) {
    if (isRecord(value[key])) return value[key];
  }
  return undefined;
}

function array(
  value: UnknownRecord,
  keys: string[],
  maxLength = MAX_COLLECTION_SIZE,
): unknown[] | undefined {
  for (const key of keys) {
    if (!(key in value)) continue;
    const entries = value[key];
    return Array.isArray(entries) && entries.length <= maxLength
      ? entries
      : undefined;
  }
  return [];
}

function stringArray(
  value: unknown,
  maxLength = MAX_COLLECTION_SIZE,
): string[] | undefined {
  if (!Array.isArray(value) || value.length > maxLength) return undefined;
  const parsed = value.map((entry) => text(entry));
  return parsed.every((entry): entry is string => !!entry)
    ? parsed
    : undefined;
}

function uniqueBy<T>(
  values: T[],
  key: (value: T) => string,
): T[] | undefined {
  const keys = values.map(key);
  return new Set(keys).size === keys.length ? values : undefined;
}

function parseList<T>(
  values: unknown[] | undefined,
  parser: (value: unknown) => T | undefined,
): T[] | undefined {
  if (!values) return undefined;
  const parsed = values.map(parser);
  return parsed.every((entry): entry is T => !!entry) ? parsed : undefined;
}

function parseOntologyProperty(
  value: unknown,
  timeSeries: boolean,
): OntologyPropertyMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const name = firstText(value, ["name", "displayName"]);
  const valueType = firstText(value, ["valueType", "dataType", "type"]);
  const id = firstText(value, ["id", "propertyId"]);
  if (!id || !name || !valueType) return undefined;
  return { id, name, valueType, timeSeries };
}

function parseOntologyEntity(
  value: unknown,
): OntologyEntityMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const id = firstText(value, ["id", "entityTypeId"]);
  const name = firstText(value, ["name", "displayName"]);
  const properties = parseList(
    array(value, ["properties"]),
    (entry) => parseOntologyProperty(entry, false),
  );
  const timeSeriesProperties = parseList(
    array(value, ["timeSeriesProperties", "timeseriesProperties"]),
    (entry) => parseOntologyProperty(entry, true),
  );
  const keyPropertyIds = stringArray(
    value.keyPropertyIds ?? value.entityIdParts ?? [],
  );
  const namespace = optionalText(value.namespace);
  const displayNamePropertyId = optionalText(value.displayNamePropertyId);
  if (
    !id ||
    !name ||
    !properties ||
    !timeSeriesProperties ||
    !keyPropertyIds ||
    namespace === null ||
    displayNamePropertyId === null
  ) {
    return undefined;
  }
  const allProperties = uniqueBy(
    [...properties, ...timeSeriesProperties],
    (property) => property.id,
  );
  return allProperties
    ? {
        id,
        name,
        namespace,
        keyPropertyIds,
        displayNamePropertyId,
        properties: allProperties,
      }
    : undefined;
}

function entityReference(value: unknown): string | undefined {
  if (typeof value === "string") return text(value);
  return isRecord(value)
    ? firstText(value, ["entityTypeId", "entityId", "id"])
    : undefined;
}

function parseOntologyRelationship(
  value: unknown,
): OntologyRelationshipMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const sourceEntityId =
    firstText(value, ["sourceEntityId"]) ?? entityReference(value.source);
  const targetEntityId =
    firstText(value, ["targetEntityId"]) ?? entityReference(value.target);
  const name = firstText(value, ["name", "displayName"]);
  const id = firstText(value, ["id", "relationshipId"]);
  if (!sourceEntityId || !targetEntityId || !name || !id) {
    return undefined;
  }
  return { id, name, sourceEntityId, targetEntityId };
}

function parseOntologyPropertyBinding(
  value: unknown,
): OntologyPropertyBindingMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const sourceColumn = firstText(value, [
    "sourceColumn",
    "sourceColumnName",
  ]);
  const targetPropertyId = firstText(value, [
    "targetPropertyId",
    "propertyId",
  ]);
  return sourceColumn && targetPropertyId
    ? { sourceColumn, targetPropertyId }
    : undefined;
}

function parseOntologyBinding(
  value: unknown,
): OntologyBindingMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const configuration =
    firstRecord(value, ["dataBindingConfiguration", "configuration"]) ?? value;
  const source =
    firstRecord(configuration, [
      "source",
      "sourceTableProperties",
      "sourceProperties",
    ]) ?? configuration;
  const entityId = firstText(value, [
    "entityId",
    "entityTypeId",
    "targetEntityTypeId",
  ]);
  const bindingType =
    firstText(configuration, ["bindingType", "dataBindingType"]) ?? "Table";
  const sourceItemId = firstText(source, ["sourceItemId", "itemId", "artifactId"]);
  const sourceObject = firstText(source, [
    "sourceObject",
    "sourceTableName",
    "tableName",
    "objectName",
  ]);
  const propertyBindings = parseList(
    array(configuration, ["propertyBindings", "propertyMappings"]),
    parseOntologyPropertyBinding,
  );
  const id = firstText(value, ["id", "bindingId"]);
  const sourceWorkspaceId = optionalText(
    source.sourceWorkspaceId ?? source.workspaceId,
  );
  const sourceType = optionalText(source.sourceType);
  const sourceSchema = optionalText(
    source.sourceSchema ?? source.schemaName,
  );
  const sourceObjectId = optionalText(
    source.sourceObjectId ?? source.tableId ?? source.objectId,
  );
  const timestampColumn = optionalText(
    configuration.timestampColumn ?? configuration.timestampColumnName,
  );
  if (
    !entityId ||
    !sourceItemId ||
    !sourceObject ||
    !propertyBindings ||
    !id ||
    sourceWorkspaceId === null ||
    sourceType === null ||
    sourceSchema === null ||
    sourceObjectId === null ||
    timestampColumn === null
  ) {
    return undefined;
  }
  return {
    id,
    entityId,
    bindingType,
    sourceItemId,
    sourceWorkspaceId,
    sourceType,
    sourceSchema,
    sourceObject,
    sourceObjectId,
    timestampColumn,
    propertyBindings,
  };
}

function parseOntologyContextualization(
  value: unknown,
  inheritedRelationshipId?: string,
): OntologyContextualizationMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const source =
    firstRecord(value, ["dataBindingTable", "source", "sourceTableProperties"]) ??
    value;
  const id = firstText(value, ["id", "contextualizationId"]);
  const relationshipId =
    firstText(value, ["relationshipId", "relationshipTypeId"]) ??
    inheritedRelationshipId;
  const sourceItemId = firstText(source, [
    "sourceItemId",
    "itemId",
    "artifactId",
  ]);
  const sourceObject = firstText(source, [
    "sourceObject",
    "sourceTableName",
    "tableName",
    "objectName",
  ]);
  const sourceKeyBindings = parseList(
    array(value, ["sourceKeyBindings", "sourceKeyRefBindings"]),
    parseOntologyPropertyBinding,
  );
  const targetKeyBindings = parseList(
    array(value, ["targetKeyBindings", "targetKeyRefBindings"]),
    parseOntologyPropertyBinding,
  );
  const sourceWorkspaceId = optionalText(
    source.sourceWorkspaceId ?? source.workspaceId,
  );
  const sourceType = optionalText(source.sourceType);
  const sourceSchema = optionalText(
    source.sourceSchema ?? source.schemaName,
  );
  const sourceObjectId = optionalText(
    source.sourceObjectId ?? source.tableId ?? source.objectId,
  );
  if (
    !id ||
    !relationshipId ||
    !sourceItemId ||
    !sourceObject ||
    !sourceKeyBindings ||
    !targetKeyBindings ||
    sourceWorkspaceId === null ||
    sourceType === null ||
    sourceSchema === null ||
    sourceObjectId === null
  ) {
    return undefined;
  }
  return {
    id,
    relationshipId,
    sourceItemId,
    sourceWorkspaceId,
    sourceType,
    sourceSchema,
    sourceObject,
    sourceObjectId,
    sourceKeyBindings,
    targetKeyBindings,
  };
}

export function parseOntologyMetadata(
  value: unknown,
): OntologyMetadata | undefined {
  if (!isRecord(value) || containsUnsafeContent(value)) return undefined;
  const entities = parseList(
    array(value, ["entities", "entityTypes"]),
    parseOntologyEntity,
  );
  const relationships = parseList(
    array(value, ["relationships", "relationshipTypes"]),
    parseOntologyRelationship,
  );
  const bindings = parseList(
    array(value, ["bindings", "dataBindings"]),
    parseOntologyBinding,
  );
  const contextualizations = parseList(
    array(value, ["contextualizations"]),
    (entry) => parseOntologyContextualization(entry),
  );
  if (!entities || !relationships || !bindings || !contextualizations) {
    return undefined;
  }
  for (const rawRelationship of array(
    value,
    ["relationships", "relationshipTypes"],
  ) ?? []) {
    if (!isRecord(rawRelationship)) return undefined;
    const relationshipId = firstText(rawRelationship, [
      "id",
      "relationshipId",
    ]);
    const nested = array(rawRelationship, ["contextualizations"]);
    if (!relationshipId || !nested) return undefined;
    for (const entry of nested) {
      const parsed = parseOntologyContextualization(entry, relationshipId);
      if (!parsed) return undefined;
      contextualizations.push(parsed);
    }
  }
  const uniqueEntities = uniqueBy(entities, (entity) => entity.id);
  const uniqueRelationships = uniqueBy(
    relationships,
    (relationship) => relationship.id,
  );
  const uniqueBindings = uniqueBy(
    bindings,
    (binding) =>
      binding.id ??
      `${binding.entityId}\u0000${binding.sourceItemId}\u0000${binding.sourceObject}`,
  );
  const uniqueContextualizations = uniqueBy(
    contextualizations,
    (contextualization) => contextualization.id,
  );
  if (
    !uniqueEntities ||
    !uniqueRelationships ||
    !uniqueBindings ||
    !uniqueContextualizations
  ) {
    return undefined;
  }
  const entityById = new Map(
    uniqueEntities.map((entity) => [entity.id, entity]),
  );
  const propertyIds = (entityId: string) =>
    new Set(
      entityById
        .get(entityId)
        ?.properties.map((property) => property.id) ?? [],
    );
  if (
    uniqueEntities.some((entity) => {
      const ids = propertyIds(entity.id);
      return (
        entity.keyPropertyIds.some((id) => !ids.has(id)) ||
        (!!entity.displayNamePropertyId &&
          !ids.has(entity.displayNamePropertyId))
      );
    }) ||
    uniqueRelationships.some(
      (relationship) =>
        !entityById.has(relationship.sourceEntityId) ||
        !entityById.has(relationship.targetEntityId),
    ) ||
    uniqueBindings.some(
      (binding) =>
        !entityById.has(binding.entityId) ||
        binding.propertyBindings.some(
          (property) =>
            !propertyIds(binding.entityId).has(property.targetPropertyId),
        ),
    )
  ) {
    return undefined;
  }
  const relationshipById = new Map(
    uniqueRelationships.map((relationship) => [
      relationship.id,
      relationship,
    ]),
  );
  if (
    uniqueContextualizations.some((contextualization) => {
      const relationship = relationshipById.get(
        contextualization.relationshipId,
      );
      return (
        !relationship ||
        contextualization.sourceKeyBindings.some(
          (binding) =>
            !propertyIds(relationship.sourceEntityId).has(
              binding.targetPropertyId,
            ),
        ) ||
        contextualization.targetKeyBindings.some(
          (binding) =>
            !propertyIds(relationship.targetEntityId).has(
              binding.targetPropertyId,
            ),
        )
      );
    })
  ) {
    return undefined;
  }
  return {
    kind: "ontology",
    entities: uniqueEntities,
    relationships: uniqueRelationships,
    bindings: uniqueBindings,
    contextualizations: uniqueContextualizations,
  };
}

function parseGraphProperty(
  value: unknown,
): GraphPropertyMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const name = firstText(value, ["name", "propertyName"]);
  const dataType = firstText(value, ["dataType", "type"]);
  return name && dataType ? { name, dataType } : undefined;
}

function parseGraphNodeType(
  value: unknown,
): GraphNodeTypeMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const alias = firstText(value, ["alias", "name"]);
  const labels = stringArray(value.labels ?? []);
  const primaryKeyProperties = stringArray(
    value.primaryKeyProperties ?? value.keys ?? [],
  );
  const properties = parseList(
    array(value, ["properties"]),
    parseGraphProperty,
  );
  return alias && labels && primaryKeyProperties && properties
    ? { alias, labels, primaryKeyProperties, properties }
    : undefined;
}

function graphNodeReference(value: unknown): string | undefined {
  if (typeof value === "string") return text(value);
  return isRecord(value) ? firstText(value, ["alias", "name"]) : undefined;
}

function parseGraphEdgeType(
  value: unknown,
): GraphEdgeTypeMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const alias = firstText(value, ["alias", "name"]);
  const labels = stringArray(value.labels ?? []);
  const sourceNodeType =
    firstText(value, ["sourceNodeTypeAlias"]) ??
    graphNodeReference(value.sourceNodeType ?? value.source);
  const destinationNodeType =
    firstText(value, ["destinationNodeTypeAlias", "targetNodeTypeAlias"]) ??
    graphNodeReference(
      value.destinationNodeType ?? value.targetNodeType ?? value.target,
    );
  const properties = parseList(
    array(value, ["properties"]),
    parseGraphProperty,
  );
  return alias &&
    labels &&
    sourceNodeType &&
    destinationNodeType &&
    properties
    ? {
        alias,
        labels,
        sourceNodeType,
        destinationNodeType,
        properties,
      }
    : undefined;
}

function parseGraphPropertyMapping(
  value: unknown,
): GraphPropertyMappingMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const propertyName = firstText(value, ["propertyName", "targetProperty"]);
  const sourceColumn = firstText(value, ["sourceColumn", "sourceColumnName"]);
  return propertyName && sourceColumn
    ? { propertyName, sourceColumn }
    : undefined;
}

function parseGraphDataSource(
  value: unknown,
): GraphDataSourceMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const properties = firstRecord(value, ["properties"]) ?? value;
  const name = firstText(value, ["name", "dataSourceName"]);
  const sourceItemId = firstText(value, [
    "sourceItemId",
    "itemId",
    "artifactId",
  ]);
  const sourceObject = firstText(value, [
    "sourceObject",
    "tableName",
    "sourceTableName",
  ]) ?? firstText(properties, ["sourceObject", "tableName", "sourceTableName"]);
  const sourceWorkspaceId = optionalText(
    value.sourceWorkspaceId ?? value.workspaceId,
  );
  const sourceType = optionalText(value.sourceType ?? value.type);
  const sourceObjectId = optionalText(
    value.sourceObjectId ?? value.tableId ?? value.objectId,
  );
  if (
    !name ||
    !sourceItemId ||
    !sourceObject ||
    sourceWorkspaceId === null ||
    sourceType === null ||
    sourceObjectId === null
  ) {
    return undefined;
  }
  return {
    name,
    sourceItemId,
    sourceWorkspaceId,
    sourceObject,
    sourceObjectId,
    sourceType,
  };
}

function parseGraphMapping(
  value: unknown,
  kind: GraphMappingMetadata["kind"],
): ParsedGraphMappingMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const typeAlias = firstText(
    value,
    kind === "node"
      ? ["typeAlias", "nodeTypeAlias"]
      : ["typeAlias", "edgeTypeAlias"],
  );
  const dataSourceName = firstText(value, [
    "dataSourceName",
    "sourceName",
  ]);
  const propertyMappings = parseList(
    array(value, ["propertyMappings"]),
    parseGraphPropertyMapping,
  );
  const id = firstText(value, ["id", "mappingId"]);
  const sourceItemId = optionalText(
    value.sourceItemId ?? value.itemId ?? value.artifactId,
  );
  const sourceWorkspaceId = optionalText(
    value.sourceWorkspaceId ?? value.workspaceId,
  );
  const sourceObject = optionalText(
    value.sourceObject ?? value.tableName ?? value.sourceTableName,
  );
  const sourceObjectId = optionalText(
    value.sourceObjectId ?? value.tableId ?? value.objectId,
  );
  const sourceNodeKeyColumns =
    kind === "edge"
      ? stringArray(value.sourceNodeKeyColumns ?? [])
      : undefined;
  const destinationNodeKeyColumns =
    kind === "edge"
      ? stringArray(
          value.destinationNodeKeyColumns ??
            value.targetNodeKeyColumns ??
            [],
        )
      : undefined;
  if (
    !typeAlias ||
    !dataSourceName ||
    !propertyMappings ||
    !id ||
    sourceItemId === null ||
    sourceWorkspaceId === null ||
    sourceObject === null ||
    sourceObjectId === null ||
    (kind === "edge" &&
      (!sourceNodeKeyColumns || !destinationNodeKeyColumns))
  ) {
    return undefined;
  }
  return {
    id,
    kind,
    typeAlias,
    dataSourceName,
    sourceItemId,
    sourceWorkspaceId,
    sourceObject,
    sourceObjectId,
    propertyMappings,
    sourceNodeKeyColumns,
    destinationNodeKeyColumns,
  };
}

export function parseGraphModelMetadata(
  value: unknown,
): GraphModelMetadata | undefined {
  if (!isRecord(value) || containsUnsafeContent(value)) return undefined;
  const graphType = firstRecord(value, ["graphType"]) ?? value;
  const graphDefinition = firstRecord(value, ["graphDefinition"]) ?? value;
  const dataSources = parseList(
    array(value, ["dataSources"]),
    parseGraphDataSource,
  );
  const nodeTypes = parseList(
    array(graphType, ["nodeTypes"]),
    parseGraphNodeType,
  );
  const edgeTypes = parseList(
    array(graphType, ["edgeTypes"]),
    parseGraphEdgeType,
  );
  const nodeMappings = parseList(
    array(graphDefinition, ["nodeMappings", "nodeTables"]),
    (entry) => parseGraphMapping(entry, "node"),
  );
  const edgeMappings = parseList(
    array(graphDefinition, ["edgeMappings", "edgeTables"]),
    (entry) => parseGraphMapping(entry, "edge"),
  );
  if (
    !dataSources ||
    !nodeTypes ||
    !edgeTypes ||
    !nodeMappings ||
    !edgeMappings
  ) {
    return undefined;
  }
  const uniqueDataSources = uniqueBy(dataSources, (source) => source.name);
  if (!uniqueDataSources) return undefined;
  const dataSourceByName = new Map(
    uniqueDataSources.map((source) => [source.name, source]),
  );
  const resolvedMappings: ParsedGraphMappingMetadata[] = [
    ...nodeMappings,
    ...edgeMappings,
  ].map((mapping) => {
    const source = dataSourceByName.get(mapping.dataSourceName);
    return {
      ...mapping,
      sourceItemId: mapping.sourceItemId ?? source?.sourceItemId,
      sourceWorkspaceId:
        mapping.sourceWorkspaceId ?? source?.sourceWorkspaceId,
      sourceObject: mapping.sourceObject ?? source?.sourceObject,
      sourceObjectId:
        mapping.sourceObjectId ?? source?.sourceObjectId,
    };
  });
  const completeMappings = resolvedMappings.filter(isCompleteGraphMapping);
  if (completeMappings.length !== resolvedMappings.length) return undefined;
  const uniqueNodes = uniqueBy(nodeTypes, (node) => node.alias);
  const uniqueEdges = uniqueBy(edgeTypes, (edge) => edge.alias);
  const mappings = uniqueBy(
    completeMappings,
    (mapping) => mapping.id ?? `${mapping.kind}\u0000${mapping.typeAlias}`,
  );
  if (!uniqueNodes || !uniqueEdges || !mappings) return undefined;
  const nodeByAlias = new Map(
    uniqueNodes.map((node) => [node.alias, node]),
  );
  const edgeByAlias = new Map(
    uniqueEdges.map((edge) => [edge.alias, edge]),
  );
  if (
    uniqueEdges.some(
      (edge) =>
      !nodeByAlias.has(edge.sourceNodeType) ||
      !nodeByAlias.has(edge.destinationNodeType),
    ) ||
    mappings.some((mapping) => {
      const properties =
      mapping.kind === "node"
        ? nodeByAlias.get(mapping.typeAlias)?.properties
        : edgeByAlias.get(mapping.typeAlias)?.properties;
      const propertyNames = new Set(
      properties?.map((property) => property.name) ?? [],
      );
      return (
      !properties ||
      mapping.propertyMappings.some(
        (property) => !propertyNames.has(property.propertyName),
      )
      );
    })
  ) {
    return undefined;
  }
  return {
    kind: "graphModel",
    dataSources: uniqueDataSources,
    nodeTypes: uniqueNodes,
    edgeTypes: uniqueEdges,
    mappings,
  };
}

interface SelectedElementBudget {
  count: number;
}

const DATA_AGENT_LINEAGE_ELEMENT_TYPE_SET = new Set<string>(
  DATA_AGENT_LINEAGE_ELEMENT_TYPES,
);

function parseDataAgentElementTree(
  value: unknown,
  sourceArtifactId: string,
  parentId: string | undefined,
  parentName: string | undefined,
  parentPath: string[],
  depth: number,
  budget: SelectedElementBudget,
  selectedByContainer: boolean,
): DataAgentElementMetadata[] | undefined {
  if (!isRecord(value) || depth > MAX_NESTING_DEPTH) return undefined;
  budget.count += 1;
  if (budget.count > MAX_DATA_AGENT_ELEMENTS) return undefined;
  const id = firstText(value, ["id"]);
  const displayName = firstText(value, ["displayName", "display_name", "name"]);
  const elementType = firstText(value, ["elementType", "type"]);
  const selected =
    value.isSelected ??
    value.is_selected ??
    value.selected ??
    selectedByContainer;
  const effectiveParentId =
    firstText(value, ["parentId"]) ?? parentId;
  const effectiveParentName =
    firstText(value, ["parentName"]) ?? parentName;
  const suppliedParentPath = stringArray(
    value.parentPath,
    MAX_NESTING_DEPTH,
  );
  const effectiveParentPath =
    suppliedParentPath ?? parentPath;
  if (
    !id ||
    !displayName ||
    !elementType ||
    (selected != null && typeof selected !== "boolean")
  ) {
    return undefined;
  }
  const dataType = optionalText(value.dataType ?? value.data_type);
  const state = optionalText(value.state);
  const indexState = optionalText(value.indexState ?? value.index_state);
  if (dataType === null || state === null || indexState === null) {
    return undefined;
  }
  const children = array(value, ["children"], MAX_DATA_AGENT_ELEMENTS);
  if (!children) return undefined;
  const parsedChildren: DataAgentElementMetadata[] = [];
  for (const child of children) {
    const parsed = parseDataAgentElementTree(
      child,
      sourceArtifactId,
      id,
      displayName,
      [...effectiveParentPath, displayName],
      depth + 1,
      budget,
      selectedByContainer,
    );
    if (!parsed) return undefined;
    parsedChildren.push(...parsed);
  }
  const supported = DATA_AGENT_LINEAGE_ELEMENT_TYPE_SET.has(
    elementType.toLowerCase(),
  );
  if (!selected || !supported) return parsedChildren;
  return [
    {
      id,
      displayName,
      elementType,
      selected: true,
      sourceArtifactId,
      dataType,
      parentId: effectiveParentId,
      parentName: effectiveParentName,
      parentPath: effectiveParentPath,
      state,
      indexState,
      children: parsedChildren,
    },
  ];
}

function flattenSelectedElements(
  elements: DataAgentElementMetadata[],
): DataAgentSelectedElementMetadata[] {
  return elements.flatMap((element) => [
    ...(element.selected
      ? [
          {
            id: element.id,
            displayName: element.displayName,
            elementType: element.elementType,
            sourceArtifactId: element.sourceArtifactId,
            dataType: element.dataType,
            parentId: element.parentId,
            parentName: element.parentName,
            parentPath: element.parentPath,
            state: element.state,
            indexState: element.indexState,
          },
        ]
      : []),
    ...flattenSelectedElements(element.children),
  ]);
}

function allDataAgentElements(
  elements: DataAgentElementMetadata[],
): DataAgentElementMetadata[] {
  return elements.flatMap((element) => [
    element,
    ...allDataAgentElements(element.children),
  ]);
}

function dataAgentElementStableId(
  element: Pick<
    DataAgentSelectedElementMetadata,
    "id" | "elementType" | "parentPath"
  >,
): string {
  return [...element.parentPath, `${element.elementType}:${element.id}`].join(
    "/",
  );
}

function parseDataAgentSource(
  value: unknown,
): DataAgentSourceMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const artifactId = firstText(value, [
    "artifactId",
    "itemId",
    "sourceItemId",
  ]);
  const workspaceId = optionalText(
    value.workspaceId ?? value.sourceWorkspaceId,
  );
  const displayName = firstText(value, ["displayName", "name"]);
  const sourceType = firstText(value, ["sourceType", "type"]);
  const selectedByContainer =
    !("elements" in value) && "selectedElements" in value;
  const elements = array(
    value,
    selectedByContainer ? ["selectedElements"] : ["elements"],
    MAX_DATA_AGENT_ELEMENTS,
  );
  if (
    !artifactId ||
    !displayName ||
    !sourceType ||
    !elements ||
    workspaceId === null
  ) {
    return undefined;
  }
  const elementTree: DataAgentElementMetadata[] = [];
  const budget = { count: 0 };
  for (const element of elements) {
    const parsed = parseDataAgentElementTree(
      element,
      artifactId,
      undefined,
      undefined,
      [],
      0,
      budget,
      selectedByContainer,
    );
    if (!parsed) return undefined;
    elementTree.push(...parsed);
  }
  if (
    !uniqueBy(allDataAgentElements(elementTree), dataAgentElementStableId)
  ) {
    return undefined;
  }
  const selectedElements = flattenSelectedElements(elementTree);
  const uniqueElements = uniqueBy(
    selectedElements,
    dataAgentElementStableId,
  );
  return uniqueElements
    ? {
        artifactId,
        workspaceId,
        displayName,
        sourceType,
        elements: elementTree,
        selectedElements: uniqueElements,
      }
    : undefined;
}

export function parseDataAgentMetadata(
  value: unknown,
): DataAgentMetadata | undefined {
  if (!isRecord(value) || containsUnsafeContent(value)) return undefined;
  const sources = parseList(
    array(value, ["sources", "dataSources"]),
    parseDataAgentSource,
  );
  const uniqueSources = sources
    ? uniqueBy(sources, (source) => source.artifactId)
    : undefined;
  return uniqueSources ? { kind: "dataAgent", sources: uniqueSources } : undefined;
}

function parseKqlParameter(
  value: unknown,
): KqlFunctionParameterMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const name = firstText(value, ["name", "parameterName"]);
  const dataType = firstText(value, ["dataType", "type"]);
  return name && dataType ? { name, dataType } : undefined;
}

function parseKqlFunction(
  value: unknown,
): KqlFunctionMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const name = firstText(value, ["name", "displayName"]);
  const parameters = parseList(
    array(value, ["parameters"]),
    parseKqlParameter,
  );
  const folder = optionalText(value.folder);
  const description = optionalText(
    value.description ?? value.docString,
    MAX_DESCRIPTION_LENGTH,
  );
  const returnType = optionalText(value.returnType);
  if (
    !name ||
    !parameters ||
    folder === null ||
    description === null ||
    returnType === null
  ) {
    return undefined;
  }
  return { name, folder, description, parameters, returnType };
}

function parseKqlColumn(value: unknown): KqlColumnMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const name = firstText(value, ["name", "displayName"]);
  const dataType = firstText(value, ["dataType", "type"]);
  return name && dataType ? { name, dataType } : undefined;
}

function parseKqlMaterializedView(
  value: unknown,
): KqlMaterializedViewMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const name = firstText(value, ["name", "displayName"]);
  const sourceTable = optionalText(
    value.sourceTable ?? value.sourceTableName,
  );
  const description = optionalText(value.description, MAX_DESCRIPTION_LENGTH);
  const columns = parseList(array(value, ["columns"]), parseKqlColumn);
  if (
    !name ||
    !columns ||
    sourceTable === null ||
    description === null
  ) {
    return undefined;
  }
  return { name, sourceTable, description, columns };
}

export function parseKqlDatabaseMetadata(
  value: unknown,
): KqlDatabaseMetadata | undefined {
  if (!isRecord(value) || containsUnsafeContent(value)) return undefined;
  const functions = parseList(
    array(value, ["functions"]),
    parseKqlFunction,
  );
  const materializedViews = parseList(
    array(value, ["materializedViews"]),
    parseKqlMaterializedView,
  );
  if (!functions || !materializedViews) return undefined;
  const uniqueFunctions = uniqueBy(functions, (fn) => fn.name);
  const uniqueViews = uniqueBy(materializedViews, (view) => view.name);
  return uniqueFunctions && uniqueViews
    ? {
        kind: "kql",
        functions: uniqueFunctions,
        materializedViews: uniqueViews,
      }
    : undefined;
}

export function parseFabricItemMetadata(
  itemType: ItemType | string,
  value: unknown,
): FabricItemMetadata | undefined {
  switch (itemType) {
    case "Ontology":
      return parseOntologyMetadata(value);
    case "GraphModel":
      return parseGraphModelMetadata(value);
    case "DataAgent":
      return parseDataAgentMetadata(value);
    case "KQLDatabase":
      return parseKqlDatabaseMetadata(value);
    default:
      return undefined;
  }
}

export function metadataSchemaEntry(
  metadata: FabricItemMetadata,
): ModelTableSchema {
  const itemTypeByKind: Record<FabricItemMetadata["kind"], ItemType> = {
    ontology: "Ontology",
    graphModel: "GraphModel",
    dataAgent: "DataAgent",
    kql: "KQLDatabase",
  };
  const parsed = parseFabricItemMetadata(
    itemTypeByKind[metadata.kind],
    metadata,
  );
  if (!parsed) throw new TypeError("Invalid Fabric item metadata");
  const serialized = JSON.stringify(parsed);
  if (serialized.length > MAX_SERIALIZED_METADATA_LENGTH) {
    throw new RangeError("Fabric item metadata exceeds the safe size limit");
  }
  return {
    name: ITEM_METADATA_SCHEMA_NAME,
    objectType: "Atlas item metadata",
    description: serialized,
    isHidden: true,
    columns: [],
    measures: [],
    metadata: parsed,
  };
}

export function isItemMetadataSchemaEntry(
  table: Pick<ModelTableSchema, "name">,
): boolean {
  return table.name === ITEM_METADATA_SCHEMA_NAME;
}

export function projectItemMetadataToSchema(
  metadata: FabricItemMetadata,
): ModelTableSchema[] {
  const envelope = metadataSchemaEntry(metadata);
  switch (metadata.kind) {
    case "ontology":
      return [
        ...metadata.entities.map((entity) => ({
          name: entity.name,
          objectType: METADATA_OBJECT_TYPES.ontologyEntity,
          source: entity.namespace,
          columns: entity.properties.map((property) => ({
            name: property.name,
            dataType: property.valueType,
            description: property.timeSeries
              ? "Time-series property"
              : undefined,
          })),
          measures: [],
        })),
        ...metadata.relationships.map((relationship) => ({
          name: relationship.name,
          objectType: METADATA_OBJECT_TYPES.ontologyRelationship,
          source: `${relationship.sourceEntityId} -> ${relationship.targetEntityId}`,
          columns: [],
          measures: [],
        })),
        envelope,
      ];
    case "graphModel":
      return [
        ...metadata.nodeTypes.map((node) => ({
          name: node.alias,
          objectType: METADATA_OBJECT_TYPES.graphNode,
          description: node.labels.join(", ") || undefined,
          columns: node.properties.map((property) => ({
            name: property.name,
            dataType: property.dataType,
            description: node.primaryKeyProperties.includes(property.name)
              ? "Primary key"
              : undefined,
          })),
          measures: [],
        })),
        ...metadata.edgeTypes.map((edge) => ({
          name: edge.alias,
          objectType: METADATA_OBJECT_TYPES.graphEdge,
          source: `${edge.sourceNodeType} -> ${edge.destinationNodeType}`,
          description: edge.labels.join(", ") || undefined,
          columns: edge.properties.map((property) => ({
            name: property.name,
            dataType: property.dataType,
          })),
          measures: [],
        })),
        envelope,
      ];
    case "dataAgent":
      return [
        ...metadata.sources.map((source) => ({
          name: source.displayName,
          objectType: METADATA_OBJECT_TYPES.dataAgentSource,
          source: source.artifactId,
          description: source.sourceType,
          columns: source.selectedElements.map((element) => ({
            name: element.displayName,
            dataType: element.dataType ?? element.elementType,
            description: element.elementType,
          })),
          measures: [],
        })),
        envelope,
      ];
    case "kql":
      return [
        ...metadata.functions.map((fn) => ({
          name: fn.name,
          objectType: METADATA_OBJECT_TYPES.kqlFunction,
          description: fn.description,
          columns: fn.parameters.map((parameter) => ({
            name: parameter.name,
            dataType: parameter.dataType,
          })),
          measures: [],
        })),
        ...metadata.materializedViews.map((view) => ({
          name: view.name,
          objectType: METADATA_OBJECT_TYPES.kqlMaterializedView,
          source: view.sourceTable,
          description: view.description,
          columns: view.columns.map((column) => ({
            name: column.name,
            dataType: column.dataType,
          })),
          measures: [],
        })),
        envelope,
      ];
  }
}

function kqlMetadataFromSchema(
  tables: ModelTableSchema[],
): KqlDatabaseMetadata | undefined {
  const functions: KqlFunctionMetadata[] = [];
  const materializedViews: KqlMaterializedViewMetadata[] = [];
  for (const table of tables) {
    const objectType = table.objectType?.trim().toLowerCase();
    if (
      objectType === "function" ||
      objectType === "stored function" ||
      objectType === METADATA_OBJECT_TYPES.kqlFunction.toLowerCase()
    ) {
      functions.push({
        name: table.name,
        description: table.description,
        parameters: table.columns.map((column) => ({
          name: column.name,
          dataType: column.dataType,
        })),
      });
    } else if (
      objectType === "materialized view" ||
      objectType === "materializedview" ||
      objectType ===
        METADATA_OBJECT_TYPES.kqlMaterializedView.toLowerCase()
    ) {
      materializedViews.push({
        name: table.name,
        description: table.description,
        columns: table.columns.map((column) => ({
          name: column.name,
          dataType: column.dataType,
        })),
      });
    }
  }
  return functions.length || materializedViews.length
    ? parseKqlDatabaseMetadata({ functions, materializedViews })
    : undefined;
}

export function itemMetadataFromSchema(
  itemType: ItemType | string,
  tables: ModelTableSchema[] | undefined,
): FabricItemMetadata | undefined {
  if (!tables) return undefined;
  for (const table of tables) {
    if (!isItemMetadataSchemaEntry(table)) continue;
    if (table.metadata) {
      return parseFabricItemMetadata(itemType, table.metadata);
    }
    if (
      !table.description ||
      table.description.length > MAX_SERIALIZED_METADATA_LENGTH
    ) {
      return undefined;
    }
    try {
      return parseFabricItemMetadata(
        itemType,
        JSON.parse(table.description) as unknown,
      );
    } catch (error) {
      if (error instanceof SyntaxError) return undefined;
      throw error;
    }
  }
  return itemType === "KQLDatabase"
    ? kqlMetadataFromSchema(tables)
    : undefined;
}

export function itemMetadataFor(
  data: Pick<AtlasData, "itemMetadata" | "schema">,
  itemId: string,
  itemType: ItemType | string,
): FabricItemMetadata | undefined {
  const direct = data.itemMetadata?.[itemId];
  return direct
    ? parseFabricItemMetadata(itemType, direct)
    : itemMetadataFromSchema(itemType, data.schema?.[itemId]);
}

function uniqueItemEdges(edges: Edge[]): Edge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.source}\u0000${edge.target}\u0000${edge.relation}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function metadataItemLineageEdges(
  itemId: string,
  metadata: FabricItemMetadata,
): Edge[] {
  const sources =
    metadata.kind === "ontology"
      ? [
          ...metadata.bindings.map((binding) => binding.sourceItemId),
          ...metadata.contextualizations.map(
            (contextualization) => contextualization.sourceItemId,
          ),
        ]
      : metadata.kind === "graphModel"
        ? metadata.mappings.map((mapping) => mapping.sourceItemId)
        : metadata.kind === "dataAgent"
          ? metadata.sources.map((source) => source.artifactId)
          : [];
  const relation =
    metadata.kind === "ontology"
      ? "binds ontology"
      : metadata.kind === "graphModel"
        ? "maps graph"
        : "grounds";
  return uniqueItemEdges(
    sources
      .filter((sourceItemId) => sourceItemId !== itemId)
      .map((sourceItemId) => ({
        source: sourceItemId,
        target: itemId,
        relation,
      })),
  );
}

function metadataObjectEdgeKey(edge: MetadataObjectLineageEdge): string {
  return [
    edge.source.itemId,
    edge.source.kind,
    edge.source.id,
    edge.target.itemId,
    edge.target.kind,
    edge.target.id,
    edge.relation,
  ].join("\u0000");
}

type MetadataObjectLineageCandidate = Omit<
  MetadataObjectLineageEdge,
  "confidence"
>;

function uniqueObjectEdges(
  edges: MetadataObjectLineageCandidate[],
): MetadataObjectLineageEdge[] {
  const seen = new Set<string>();
  const verified: MetadataObjectLineageEdge[] = [];
  for (const edge of edges) {
    const next = { ...edge, confidence: "verified" as const };
    const key = metadataObjectEdgeKey(next);
    if (seen.has(key)) continue;
    seen.add(key);
    verified.push(next);
  }
  return verified;
}

function sourceObjectRef(
  itemId: string,
  objectId: string,
  objectName: string,
): MetadataObjectRef {
  return {
    itemId,
    kind: "sourceObject",
    id: objectId,
    name: objectName,
    tableName: objectName,
  };
}

function sourceFieldRef(
  itemId: string,
  objectId: string,
  objectName: string,
  fieldName: string,
): MetadataObjectRef {
  return {
    itemId,
    kind: "sourceField",
    id: `${objectId}.${fieldName}`,
    name: fieldName,
    parentId: objectId,
    tableName: objectName,
  };
}

function sourceObjectStableId(
  sourceObject: string,
  sourceSchema?: string,
  sourceObjectId?: string,
): string {
  return sourceObjectId ??
    (sourceSchema ? `${sourceSchema}.${sourceObject}` : sourceObject);
}

function ontologyObjectLineageEdges(
  itemId: string,
  metadata: OntologyMetadata,
): MetadataObjectLineageCandidate[] {
  const edges: MetadataObjectLineageCandidate[] = [];
  const entityById = new Map(
    metadata.entities.map((entity) => [entity.id, entity]),
  );
  const relationshipById = new Map(
    metadata.relationships.map((relationship) => [
      relationship.id,
      relationship,
    ]),
  );
  const entityRef = (entityId: string): MetadataObjectRef => ({
    itemId,
    kind: "ontologyEntity",
    id: entityId,
    name: entityById.get(entityId)?.name ?? entityId,
  });
  const propertyRef = (
    entityId: string,
    propertyId: string,
  ): MetadataObjectRef => ({
    itemId,
    kind: "ontologyProperty",
    id: propertyId,
    name:
      entityById
        .get(entityId)
        ?.properties.find((property) => property.id === propertyId)?.name ??
      propertyId,
    parentId: entityId,
    tableName: entityById.get(entityId)?.name,
  });

  for (const relationship of metadata.relationships) {
    const relationshipRef: MetadataObjectRef = {
      itemId,
      kind: "ontologyRelationship",
      id: relationship.id,
      name: relationship.name,
    };
    edges.push(
      {
        source: entityRef(relationship.sourceEntityId),
        target: relationshipRef,
        relation: "relationship source",
      },
      {
        source: relationshipRef,
        target: entityRef(relationship.targetEntityId),
        relation: "relationship target",
      },
    );
  }

  for (const binding of metadata.bindings) {
    const sourceObjectId = sourceObjectStableId(
      binding.sourceObject,
      binding.sourceSchema,
      binding.sourceObjectId,
    );
    edges.push({
      source: sourceObjectRef(
        binding.sourceItemId,
        sourceObjectId,
        binding.sourceObject,
      ),
      target: entityRef(binding.entityId),
      relation: "binds entity",
    });
    for (const property of binding.propertyBindings) {
      edges.push({
        source: sourceFieldRef(
          binding.sourceItemId,
          sourceObjectId,
          binding.sourceObject,
          property.sourceColumn,
        ),
        target: propertyRef(binding.entityId, property.targetPropertyId),
        relation: "binds property",
      });
    }
  }

  for (const contextualization of metadata.contextualizations) {
    const sourceObjectId = sourceObjectStableId(
      contextualization.sourceObject,
      contextualization.sourceSchema,
      contextualization.sourceObjectId,
    );
    const relationship = relationshipById.get(
      contextualization.relationshipId,
    );
    const contextualizationRef: MetadataObjectRef = {
      itemId,
      kind: "ontologyContextualization",
      id: contextualization.id,
      name: contextualization.sourceObject,
      parentId: contextualization.relationshipId,
    };
    edges.push(
      {
        source: sourceObjectRef(
          contextualization.sourceItemId,
          sourceObjectId,
          contextualization.sourceObject,
        ),
        target: contextualizationRef,
        relation: "contextualizes relationship",
      },
      {
        source: contextualizationRef,
        target: {
          itemId,
          kind: "ontologyRelationship",
          id: contextualization.relationshipId,
          name:
            relationship?.name ?? contextualization.relationshipId,
        },
        relation: "binds relationship",
      },
    );
    if (!relationship) continue;
    for (const binding of contextualization.sourceKeyBindings) {
      edges.push({
        source: sourceFieldRef(
          contextualization.sourceItemId,
          sourceObjectId,
          contextualization.sourceObject,
          binding.sourceColumn,
        ),
        target: propertyRef(
          relationship.sourceEntityId,
          binding.targetPropertyId,
        ),
        relation: "binds source key",
      });
    }
    for (const binding of contextualization.targetKeyBindings) {
      edges.push({
        source: sourceFieldRef(
          contextualization.sourceItemId,
          sourceObjectId,
          contextualization.sourceObject,
          binding.sourceColumn,
        ),
        target: propertyRef(
          relationship.targetEntityId,
          binding.targetPropertyId,
        ),
        relation: "binds target key",
      });
    }
  }
  return edges;
}

function graphObjectLineageEdges(
  itemId: string,
  metadata: GraphModelMetadata,
): MetadataObjectLineageCandidate[] {
  const edges: MetadataObjectLineageCandidate[] = [];
  const nodeByAlias = new Map(
    metadata.nodeTypes.map((node) => [node.alias, node]),
  );
  const edgeByAlias = new Map(
    metadata.edgeTypes.map((edge) => [edge.alias, edge]),
  );
  const nodeRef = (alias: string): MetadataObjectRef => ({
    itemId,
    kind: "graphNode",
    id: alias,
    name: alias,
  });
  const edgeRef = (alias: string): MetadataObjectRef => ({
    itemId,
    kind: "graphEdge",
    id: alias,
    name: alias,
  });
  for (const edge of metadata.edgeTypes) {
    edges.push(
      {
        source: nodeRef(edge.sourceNodeType),
        target: edgeRef(edge.alias),
        relation: "edge source",
      },
      {
        source: edgeRef(edge.alias),
        target: nodeRef(edge.destinationNodeType),
        relation: "edge destination",
      },
    );
  }
  for (const mapping of metadata.mappings) {
    const sourceObjectId = sourceObjectStableId(
      mapping.sourceObject,
      undefined,
      mapping.sourceObjectId,
    );
    const target =
      mapping.kind === "node"
        ? nodeRef(mapping.typeAlias)
        : edgeRef(mapping.typeAlias);
    edges.push({
      source: sourceObjectRef(
        mapping.sourceItemId,
        sourceObjectId,
        mapping.sourceObject,
      ),
      target,
      relation: mapping.kind === "node" ? "maps node" : "maps edge",
    });
    const properties =
      mapping.kind === "node"
        ? nodeByAlias.get(mapping.typeAlias)?.properties
        : edgeByAlias.get(mapping.typeAlias)?.properties;
    for (const property of mapping.propertyMappings) {
      edges.push({
        source: sourceFieldRef(
          mapping.sourceItemId,
          sourceObjectId,
          mapping.sourceObject,
          property.sourceColumn,
        ),
        target: {
          itemId,
          kind: "graphProperty",
          id: `${mapping.typeAlias}.${property.propertyName}`,
          name:
            properties?.find(
              (candidate) => candidate.name === property.propertyName,
            )?.name ?? property.propertyName,
          parentId: mapping.typeAlias,
          tableName: mapping.typeAlias,
        },
        relation: "maps property",
      });
    }
  }
  return edges;
}

function dataAgentObjectLineageEdges(
  itemId: string,
  metadata: DataAgentMetadata,
): MetadataObjectLineageCandidate[] {
  const edges: MetadataObjectLineageCandidate[] = [];
  const visit = (source: DataAgentSourceMetadata) => {
    const selectedById = new Map(
      source.selectedElements.map((element) => [element.id, element]),
    );
    const elements = allDataAgentElements(source.elements);
    for (const element of elements) {
      const stableId = dataAgentElementStableId(element);
      const tableName =
        element.elementType.toLowerCase().endsWith(".table") ||
        element.elementType.toLowerCase() === "ontology.entity"
          ? element.displayName
          : element.parentName;
      const target: MetadataObjectRef = {
        itemId,
        kind: "dataAgentElement",
        id: `${source.artifactId}:${stableId}`,
        name: element.displayName,
        parentId: element.parentId
          ? `${source.artifactId}:${element.parentId}`
          : source.artifactId,
        tableName,
      };
      edges.push({
        source: {
          itemId: source.artifactId,
          kind: "sourceElement",
          id: stableId,
          name: element.displayName,
          parentId: element.parentId,
          parentPath: element.parentPath,
          tableName,
        },
        target,
        relation: "selected by agent",
      });
      const parent = element.parentId
        ? selectedById.get(element.parentId)
        : undefined;
      if (parent) {
        edges.push({
          source: {
            itemId,
            kind: "dataAgentElement",
            id: `${source.artifactId}:${dataAgentElementStableId(parent)}`,
            name: parent.displayName,
            parentId: source.artifactId,
            tableName: element.parentName,
          },
          target,
          relation: "contains",
        });
      }
    }
  };
  for (const source of metadata.sources) {
    const sourceRef: MetadataObjectRef = {
      itemId,
      kind: "dataAgentSource",
      id: source.artifactId,
      name: source.displayName,
    };
    edges.push({
      source: sourceObjectRef(
        source.artifactId,
        source.artifactId,
        source.displayName,
      ),
      target: sourceRef,
      relation: "agent source",
    });
    visit(source);
  }
  return edges;
}

export function metadataObjectLineageEdges(
  itemId: string,
  metadata: FabricItemMetadata,
): MetadataObjectLineageEdge[] {
  const edges =
    metadata.kind === "ontology"
      ? ontologyObjectLineageEdges(itemId, metadata)
      : metadata.kind === "graphModel"
        ? graphObjectLineageEdges(itemId, metadata)
        : metadata.kind === "dataAgent"
          ? dataAgentObjectLineageEdges(itemId, metadata)
          : metadata.materializedViews.flatMap((view) =>
              view.sourceTable
                ? [
                    {
                      source: sourceObjectRef(
                        itemId,
                        view.sourceTable,
                        view.sourceTable,
                      ),
                      target: {
                        itemId,
                        kind: "kqlMaterializedView" as const,
                        id: view.name,
                        name: view.name,
                      },
                      relation: "materializes",
                    },
                  ]
                : [],
            );
  return uniqueObjectEdges(edges);
}

const METADATA_OBJECT_KINDS = new Set<MetadataObjectKind>([
  "sourceObject",
  "sourceField",
  "sourceElement",
  "ontologyEntity",
  "ontologyProperty",
  "ontologyRelationship",
  "ontologyContextualization",
  "graphNode",
  "graphEdge",
  "graphProperty",
  "dataAgentSource",
  "dataAgentElement",
  "kqlFunction",
  "kqlMaterializedView",
]);

const METADATA_OBJECT_KIND_ALIASES: Record<string, MetadataObjectKind> = {
  table: "sourceObject",
  view: "sourceObject",
  column: "sourceField",
  measure: "sourceField",
  function: "kqlFunction",
  materializedView: "kqlMaterializedView",
  entityType: "ontologyEntity",
  property: "ontologyProperty",
  timeSeriesProperty: "ontologyProperty",
  relationshipType: "ontologyRelationship",
  nodeType: "graphNode",
  edgeType: "graphEdge",
  dataSource: "dataAgentSource",
  selectedElement: "dataAgentElement",
};

function parseMetadataObjectRef(
  value: unknown,
): MetadataObjectRef | undefined {
  if (!isRecord(value)) return undefined;
  const itemId = firstText(value, ["itemId"]);
  const rawKind = firstText(value, ["kind"]);
  const kind = rawKind
    ? METADATA_OBJECT_KIND_ALIASES[rawKind] ??
      (rawKind as MetadataObjectKind)
    : undefined;
  const id = firstText(value, ["id"]);
  const name = firstText(value, ["name"]);
  const parentId = optionalText(value.parentId);
  const parentPath =
    value.parentPath == null
      ? undefined
      : stringArray(value.parentPath, MAX_NESTING_DEPTH);
  const tableName = optionalText(value.tableName);
  if (
    !itemId ||
    !kind ||
    !METADATA_OBJECT_KINDS.has(kind) ||
    !id ||
    !name ||
    parentId === null ||
    (value.parentPath != null && !parentPath) ||
    tableName === null
  ) {
    return undefined;
  }
  return {
    itemId,
    kind,
    id,
    name,
    parentId,
    parentPath,
    tableName,
  };
}

function objectLineageEntries(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return undefined;
  const direct = value.objectEdges;
  if (Array.isArray(direct)) return direct;
  const lineage = value.objectLineage;
  if (Array.isArray(lineage)) return lineage;
  if (isRecord(lineage) && Array.isArray(lineage.edges)) {
    return lineage.edges;
  }
  return undefined;
}

export function parseObjectLineagePayload(
  value: unknown,
): ObjectLineagePayload | undefined {
  if (
    containsUnsafeContent(
      value,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    )
  ) {
    return undefined;
  }
  const entries = objectLineageEntries(value);
  if (!entries) return undefined;
  const edges: MetadataObjectLineageEdge[] = [];
  for (const entry of entries) {
    if (!isRecord(entry) || entry.confidence !== "verified") {
      return undefined;
    }
    const source = parseMetadataObjectRef(entry.source);
    const target = parseMetadataObjectRef(entry.target);
    const relation = text(entry.relation);
    if (
      !source ||
      !target ||
      !relation ||
      (source.itemId === target.itemId &&
        source.kind === target.kind &&
        source.id === target.id)
    ) {
      return undefined;
    }
    edges.push({ source, target, relation, confidence: "verified" });
  }
  return { objectEdges: uniqueObjectEdges(edges) };
}
