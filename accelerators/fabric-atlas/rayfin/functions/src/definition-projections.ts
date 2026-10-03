/*
 * Safe projections of Fabric item definitions, ported from the Python
 * collector (`_project_ontology_definition`, `_project_graph_definition` and
 * `_project_data_agent_definition`). Only the reviewed structural
 * `artifactMetadata` contract, Config facts and referenced item IDs are
 * produced. Raw parts, free-text descriptions, AI instructions, few-shot
 * examples, queries and any unrecognized content are never returned.
 */

export type DefinitionProjectionErrorCode =
  | "invalid-definition"
  | "response-size-exceeded"
  | "unsafe-content-rejected"
  | "projection-limit-exceeded";

export class DefinitionProjectionError extends Error {
  constructor(readonly code: DefinitionProjectionErrorCode) {
    super(`Fabric definition projection failed (${code}).`);
    this.name = "DefinitionProjectionError";
  }
}

export const DEFINITION_PROJECTION_LIMITS = {
  maxParts: 500,
  maxPartPathLength: 512,
  maxDecodedBytes: 8 * 1024 * 1024,
  maxFacts: 1_000,
  maxPropertyRecords: 500,
  maxMetadataCollection: 512,
  maxDataAgentElements: 2_048,
  maxNestingDepth: 16,
  maxMetadataText: 256,
  maxSerializedMetadata: 1_000_000,
  maxFactSection: 80,
  maxFactText: 5_000,
  maxReferenceIds: 512,
  maxIdScanNodes: 10_000,
} as const;

export type OntologyArtifactMetadata = {
  kind: "ontology";
  entities: {
    id: string;
    name: string;
    namespace?: string;
    keyPropertyIds: string[];
    displayNamePropertyId?: string;
    properties: { id: string; name: string; valueType: string; timeSeries: boolean }[];
  }[];
  relationships: {
    id: string;
    name: string;
    sourceEntityId: string;
    targetEntityId: string;
  }[];
  bindings: {
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
    propertyBindings: { sourceColumn: string; targetPropertyId: string }[];
  }[];
  contextualizations: {
    id: string;
    relationshipId: string;
    sourceItemId: string;
    sourceWorkspaceId?: string;
    sourceType?: string;
    sourceSchema?: string;
    sourceObject: string;
    sourceObjectId?: string;
    sourceKeyBindings: { sourceColumn: string; targetPropertyId: string }[];
    targetKeyBindings: { sourceColumn: string; targetPropertyId: string }[];
  }[];
};

export type GraphModelArtifactMetadata = {
  kind: "graphModel";
  dataSources: {
    name: string;
    sourceItemId: string;
    sourceWorkspaceId?: string;
    sourceObject: string;
    sourceObjectId?: string;
    sourceType?: string;
  }[];
  nodeTypes: {
    alias: string;
    labels: string[];
    primaryKeyProperties: string[];
    properties: { name: string; dataType: string }[];
  }[];
  edgeTypes: {
    alias: string;
    labels: string[];
    sourceNodeType: string;
    destinationNodeType: string;
    properties: { name: string; dataType: string }[];
  }[];
  mappings: {
    id: string;
    kind: "node" | "edge";
    typeAlias: string;
    dataSourceName: string;
    sourceItemId: string;
    sourceWorkspaceId?: string;
    sourceObject: string;
    sourceObjectId?: string;
    propertyMappings: { propertyName: string; sourceColumn: string }[];
    sourceNodeKeyColumns?: string[];
    destinationNodeKeyColumns?: string[];
  }[];
};

export type DataAgentElementArtifactMetadata = {
  id: string;
  displayName: string;
  elementType: string;
  selected: true;
  sourceArtifactId: string;
  dataType?: string;
  parentId?: string;
  parentName?: string;
  parentPath: string[];
  state?: string;
  indexState?: string;
  /**
   * Nested elements with this same shape. Typed as `unknown[]` because Rayfin
   * typegen cannot express recursive types in the generated client contract.
   */
  children: unknown[];
};

export type DataAgentArtifactMetadata = {
  kind: "dataAgent";
  sources: {
    artifactId: string;
    workspaceId?: string;
    displayName: string;
    sourceType: string;
    elements: DataAgentElementArtifactMetadata[];
    selectedElements: Omit<DataAgentElementArtifactMetadata, "selected" | "children">[];
  }[];
};

export type DefinitionArtifactMetadata =
  | OntologyArtifactMetadata
  | GraphModelArtifactMetadata
  | DataAgentArtifactMetadata;

export type DefinitionFact = { section: string; label: string; value: string };

export type DefinitionReferences = {
  sourceItemIds: string[];
  ontologyItemIds: string[];
  graphModelItemIds: string[];
};

export interface DefinitionProjection {
  metadata: DefinitionArtifactMetadata;
  facts: DefinitionFact[];
  references: DefinitionReferences;
  unknownParts: number;
  factsTruncated: boolean;
  metadataTruncated: boolean;
}

type JsonRecord = Record<string, unknown>;
type SourceMetadata = {
  itemId?: string;
  workspaceId?: string;
  sourceType?: string;
  schema?: string;
  table?: string;
  sourceObjectId?: string;
};

const LIMITS = DEFINITION_PROJECTION_LIMITS;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Defense in depth: projected names must never carry credentials or connection strings.
const SENSITIVE_TEXT = [
  /(?:password|passwd|pwd|secret|accountkey|account_key|sharedaccesskey|sharedaccesssignature|client_?secret|api_?key|access_?token|refresh_?token)\s*[=:]/i,
  /\bbearer\s+[A-Za-z0-9\-._~+/]{16,}/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /(?:^|;)\s*(?:server|data source|endpoint|accountname)\s*=\s*[^;]+;/i,
  /[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/i,
  /[?&](?:sig|sv|se|sp)=[^&\s]{8,}/i,
];

function invalid(): never {
  throw new DefinitionProjectionError("invalid-definition");
}

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Python truthiness, so `a or b` fallbacks match the collector exactly. */
function truthy(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return !!value;
}

function pyOr(...values: unknown[]): unknown {
  for (const value of values) if (truthy(value)) return value;
  return values.at(-1);
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Python `_strict_text`. */
function strictText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text || undefined;
}

/** Python `_bounded_text`. */
function boundedText(value: unknown): string | undefined {
  return strictText(value)?.slice(0, LIMITS.maxMetadataText);
}

/** Python `_normalized_id`: canonical lowercase UUIDs, other IDs verbatim. */
function normalizedId(value: unknown): string | undefined {
  const text = strictText(value);
  if (!text) return undefined;
  const hex = text.replace(/^urn:uuid:/i, "").replace(/^\{|\}$/g, "").replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) return text;
  const lower = hex.toLowerCase();
  return `${lower.slice(0, 8)}-${lower.slice(8, 12)}-${lower.slice(12, 16)}-${lower.slice(16, 20)}-${lower.slice(20)}`;
}

/** Python `_definition_identifier`; unsafe numeric IDs fail instead of losing precision. */
function definitionIdentifier(value: unknown, fallback?: unknown): string | undefined {
  const candidate = value ?? fallback;
  if (typeof candidate === "number") {
    if (!Number.isSafeInteger(candidate)) invalid();
    return normalizedId(String(candidate));
  }
  return typeof candidate === "string" ? normalizedId(candidate) : undefined;
}

function requiredIdentifier(value: unknown, fallback?: unknown): string {
  return definitionIdentifier(value, fallback) ?? invalid();
}

/** Python `_explicit_ids`, bounded against deeply nested or very large JSON. */
function explicitIds(value: unknown, fieldNames: readonly string[]): string[] {
  const expected = new Set(fieldNames.map((name) => name.toLowerCase()));
  const found = new Set<string>();
  let visited = 0;
  const visit = (node: unknown, depth: number): void => {
    visited += 1;
    if (visited > LIMITS.maxIdScanNodes || depth > 64) invalid();
    if (Array.isArray(node)) {
      for (const child of node) {
        if (child && typeof child === "object") visit(child, depth + 1);
      }
    } else if (isRecord(node)) {
      for (const [key, child] of Object.entries(node)) {
        if (expected.has(key.toLowerCase())) {
          const id = normalizedId(child);
          if (id) found.add(id);
        } else if (child && typeof child === "object") {
          visit(child, depth + 1);
        }
      }
    }
  };
  visit(value, 0);
  return [...found];
}

class FactLog {
  readonly facts: DefinitionFact[] = [];
  truncated = false;

  add(section: string, label: string, value: string | number): void {
    if (this.facts.length >= LIMITS.maxFacts) {
      this.truncated = true;
      return;
    }
    const text = String(value);
    if (strictText(section) && strictText(label) && text.trim()) {
      this.facts.push({ section, label, value: text });
    }
  }
}

interface ProjectionState {
  facts: FactLog;
  decodedBytes: number;
  unknownParts: number;
  metadataTruncated: boolean;
  sourceIds: Set<string>;
  ontologyIds: Set<string>;
  graphModelIds: Set<string>;
}

function definitionParts(response: unknown): JsonRecord[] {
  if (!isRecord(response) || !isRecord(response.definition)) invalid();
  const parts = response.definition.parts;
  if (!Array.isArray(parts) || parts.length > LIMITS.maxParts) invalid();
  return parts.map((part) => (isRecord(part) ? part : invalid()));
}

function hasControlCharacter(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

/** Validates and normalizes a part path; traversal-style paths are rejected. */
function partPath(part: JsonRecord): string {
  const path = strictText(part.path);
  if (!path || path.length > LIMITS.maxPartPathLength || hasControlCharacter(path)) {
    invalid();
  }
  const normalized = path.replace(/\\/g, "/");
  if (
    normalized.startsWith("/") ||
    normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    invalid();
  }
  return normalized;
}

/** Strict RFC 4648 base64 check in linear time; multi-megabyte payloads stay off the regex engine. */
function isStrictBase64(payload: string): boolean {
  if (payload.length % 4 !== 0) return false;
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  for (let index = 0; index < payload.length - padding; index += 1) {
    const code = payload.charCodeAt(index);
    const valid =
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      (code >= 48 && code <= 57) ||
      code === 43 ||
      code === 47;
    if (!valid) return false;
  }
  return true;
}

function decodeBase64(payload: string): Uint8Array {
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** Python `_decode_definition_json` with strict base64 and a shared decoded-size budget. */
function decodeJsonPart(part: JsonRecord, state: ProjectionState): JsonRecord {
  const payload = strictText(part.payload);
  if (!payload || part.payloadType !== "InlineBase64") invalid();
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  const decodedLength = Math.floor(payload.length / 4) * 3 - padding;
  if (state.decodedBytes + decodedLength > LIMITS.maxDecodedBytes) {
    throw new DefinitionProjectionError("response-size-exceeded");
  }
  if (!isStrictBase64(payload)) invalid();
  state.decodedBytes += decodedLength;
  let value: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(decodeBase64(payload));
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    invalid();
  }
  return isRecord(value) ? value : invalid();
}

/** Python `_safe_property_records`. */
function safePropertyRecords(values: unknown): { name: string; id?: string; valueType?: string }[] {
  const result: { name: string; id?: string; valueType?: string }[] = [];
  for (const value of list(values).slice(0, LIMITS.maxPropertyRecords)) {
    if (!isRecord(value)) continue;
    const name = strictText(value.name);
    if (!name) continue;
    const record: { name: string; id?: string; valueType?: string } = { name };
    const id = definitionIdentifier(value.id);
    const valueType = strictText(pyOr(value.valueType, value.type));
    if (id) record.id = id;
    if (valueType) record.valueType = valueType;
    result.push(record);
  }
  return result;
}

/** Python `_source_metadata`. */
function sourceMetadata(value: unknown): SourceMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const itemId = normalizedId(pyOr(value.itemId, value.artifactId, value.sourceItemId));
  const workspaceId = normalizedId(pyOr(value.workspaceId, value.sourceWorkspaceId));
  const sourceObjectId = normalizedId(pyOr(value.sourceObjectId, value.tableId, value.objectId));
  const sourceType = strictText(pyOr(value.sourceType, value.type));
  const table = strictText(pyOr(value.sourceTableName, value.tableName, value.displayName));
  const schema = strictText(pyOr(value.sourceSchema, value.schemaName));
  if (!itemId && !sourceType && !table && !schema) return undefined;
  const source: SourceMetadata = {};
  if (itemId) source.itemId = itemId;
  if (workspaceId) source.workspaceId = workspaceId;
  if (sourceType) source.sourceType = sourceType;
  if (schema) source.schema = schema;
  if (table) source.table = table;
  if (sourceObjectId) source.sourceObjectId = sourceObjectId;
  return source;
}

/** Python `_source_summary`. */
function sourceSummary(source: SourceMetadata): string {
  const qualified = [source.schema, source.table].filter(Boolean).join(".");
  return [source.sourceType, source.itemId, qualified].filter(Boolean).join(" | ");
}

/** Python `_onelake_source`; only IDs and the table path leave the OneLake URI. */
function oneLakeSource(value: unknown): SourceMetadata | undefined {
  if (!isRecord(value)) return undefined;
  let source = sourceMetadata(value);
  const properties = isRecord(value.properties) ? value.properties : {};
  const path = strictText(properties.path);
  const match = path?.match(
    /abfss:\/\/([0-9a-f-]{36})@onelake\.dfs\.fabric\.microsoft\.com\/([0-9a-f-]{36})\/(Tables|Files)\/(.*)$/i,
  );
  if (match) {
    source = { ...source };
    const workspaceId = normalizedId(match[1]);
    const itemId = normalizedId(match[2]);
    const sourceType = strictText(value.type);
    const table = strictText(match[4]);
    if (workspaceId) source.workspaceId = workspaceId;
    else delete source.workspaceId;
    if (itemId) source.itemId = itemId;
    else delete source.itemId;
    if (sourceType) source.sourceType = sourceType;
    else delete source.sourceType;
    if (table) source.table = table;
    else delete source.table;
  }
  return source;
}

function withOptionalSource<T extends object>(
  target: T,
  source: SourceMetadata,
  keys: readonly (readonly [string, keyof SourceMetadata])[],
): T {
  const result = target as Record<string, unknown>;
  for (const [targetKey, sourceKey] of keys) {
    const value = source[sourceKey];
    if (value) result[targetKey] = value;
  }
  return target;
}

/** Python `_dedupe_metadata`, flagging when the collection cap drops records. */
function dedupe<T>(values: T[], key: (value: T) => string | undefined, state: ProjectionState): T[] {
  const result: T[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const identity = key(value);
    if (!identity || seen.has(identity)) continue;
    if (result.length >= LIMITS.maxMetadataCollection) {
      state.metadataTruncated = true;
      break;
    }
    seen.add(identity);
    result.push(value);
  }
  return result;
}

/** Keeps nested metadata lists within the frontend collection bound. */
function capList<T>(values: T[], state: ProjectionState): T[] {
  if (values.length <= LIMITS.maxMetadataCollection) return values;
  state.metadataTruncated = true;
  return values.slice(0, LIMITS.maxMetadataCollection);
}

function nameOrUnknown(names: Map<string, string>, id: string | undefined): string {
  return (id !== undefined ? names.get(id) ?? id : undefined) || "unknown";
}

function projectOntology(response: unknown, state: ProjectionState): OntologyArtifactMetadata {
  const entityParts: [string, JsonRecord][] = [];
  const bindingParts: [string, string, JsonRecord][] = [];
  const relationshipParts: [string, JsonRecord][] = [];
  const contextualizationParts: [string, string, JsonRecord][] = [];
  for (const part of definitionParts(response)) {
    const path = partPath(part);
    if (path === ".platform" || path === "definition.json") continue;
    if (
      /^EntityTypes\/[^/]+\/(Documents|ResourceLinks)\/.+\.json$/i.test(path) ||
      /^EntityTypes\/[^/]+\/Overviews\/definition\.json$/i.test(path)
    ) {
      continue;
    }
    let match = /^EntityTypes\/([^/]+)\/definition\.json$/i.exec(path);
    if (match) {
      const value = decodeJsonPart(part, state);
      entityParts.push([match[1], value]);
      for (const id of explicitIds(value, [
        "graphModelId",
        "graphModelItemId",
        "generatedGraphModelId",
        "generatedGraphModelItemId",
      ])) {
        state.graphModelIds.add(id);
      }
      continue;
    }
    match = /^EntityTypes\/([^/]+)\/DataBindings\/([^/]+)\.json$/i.exec(path);
    if (match) {
      bindingParts.push([match[1], match[2], decodeJsonPart(part, state)]);
      continue;
    }
    match = /^RelationshipTypes\/([^/]+)\/definition\.json$/i.exec(path);
    if (match) {
      relationshipParts.push([match[1], decodeJsonPart(part, state)]);
      continue;
    }
    match = /^RelationshipTypes\/([^/]+)\/Contextualizations\/([^/]+)\.json$/i.exec(path);
    if (match) {
      contextualizationParts.push([match[1], match[2], decodeJsonPart(part, state)]);
      continue;
    }
    state.unknownParts += 1;
  }

  const facts = state.facts;
  const entityNames = new Map<string, string>();
  // Property references follow the first entity occurrence, which dedupe keeps.
  const entityPropertyIds = new Map<string, Set<string>>();
  const hasProperty = (entityId: string, propertyId: string) =>
    entityPropertyIds.get(entityId)?.has(propertyId) === true;
  let entities: OntologyArtifactMetadata["entities"] = [];
  for (const [pathId, value] of entityParts) {
    const entityId = requiredIdentifier(value.id, pathId);
    const name = strictText(value.name) ?? entityId;
    entityNames.set(entityId, name);
    const properties = safePropertyRecords(value.properties);
    const timeseries = safePropertyRecords(value.timeseriesProperties);
    const propertyMetadata = dedupe(
      [
        ...properties.flatMap((property) =>
          property.id
            ? [{ id: property.id, name: property.name, valueType: property.valueType ?? "Object", timeSeries: false }]
            : []),
        ...timeseries.flatMap((property) =>
          property.id
            ? [{ id: property.id, name: property.name, valueType: property.valueType ?? "Object", timeSeries: true }]
            : []),
      ],
      (property) => property.id,
      state,
    );
    const propertyIds = new Set(propertyMetadata.map((property) => property.id));
    if (!entityPropertyIds.has(entityId)) entityPropertyIds.set(entityId, propertyIds);
    const keyPropertyIds = capList(
      list(value.entityIdParts)
        .map((candidate) => definitionIdentifier(candidate))
        .filter((id): id is string => !!id && propertyIds.has(id)),
      state,
    );
    const displayNamePropertyId = definitionIdentifier(value.displayNamePropertyId);
    const entity: OntologyArtifactMetadata["entities"][number] = {
      id: entityId,
      name,
      keyPropertyIds,
      properties: propertyMetadata,
    };
    const namespace = strictText(value.namespace);
    if (namespace) entity.namespace = namespace;
    if (displayNamePropertyId && propertyIds.has(displayNamePropertyId)) {
      entity.displayNamePropertyId = displayNamePropertyId;
    }
    entities.push(entity);
    facts.add(
      "Ontology entity types",
      name,
      `id ${entityId} | ${properties.length} properties | ${timeseries.length} time-series properties`,
    );
    for (const property of properties) {
      facts.add("Ontology properties", `${name}.${property.name}`, property.valueType ?? "property");
    }
    for (const property of timeseries) {
      facts.add(
        "Ontology time-series properties",
        `${name}.${property.name}`,
        property.valueType ?? "property",
      );
    }
  }

  const keyBindings = (raw: unknown, entityId: string) =>
    capList(list(raw).flatMap((binding) => {
      if (!isRecord(binding)) return [];
      const sourceColumn = strictText(pyOr(binding.sourceColumnName, binding.sourceColumn));
      const targetPropertyId = definitionIdentifier(pyOr(binding.targetPropertyId, binding.propertyId));
      return sourceColumn && targetPropertyId && hasProperty(entityId, targetPropertyId)
        ? [{ sourceColumn, targetPropertyId }]
        : [];
    }), state);
  const sourceKeys = [
    ["sourceWorkspaceId", "workspaceId"],
    ["sourceType", "sourceType"],
    ["sourceSchema", "schema"],
    ["sourceObjectId", "sourceObjectId"],
  ] as const;

  let bindings: OntologyArtifactMetadata["bindings"] = [];
  for (const [pathEntityId, pathBindingId, value] of bindingParts) {
    const entityId = requiredIdentifier(pathEntityId);
    const bindingId = requiredIdentifier(value.id, pathBindingId);
    const configuration = isRecord(value.dataBindingConfiguration) ? value.dataBindingConfiguration : {};
    const source = sourceMetadata(configuration.sourceTableProperties);
    if (!source) continue;
    if (source.itemId) state.sourceIds.add(source.itemId);
    const propertyBindings = keyBindings(configuration.propertyBindings, entityId);
    facts.add(
      "Ontology data bindings",
      `${entityNames.get(entityId) ?? entityId}:${bindingId}`,
      `${sourceSummary(source)} | ${propertyBindings.length} property bindings`,
    );
    if (entityNames.has(entityId) && source.itemId && source.table) {
      const binding = withOptionalSource(
        {
          id: bindingId,
          entityId,
          bindingType: strictText(pyOr(configuration.dataBindingType, configuration.bindingType)) ?? "Table",
          sourceItemId: source.itemId,
          sourceObject: source.table,
          propertyBindings,
        } as OntologyArtifactMetadata["bindings"][number],
        source,
        sourceKeys,
      );
      const timestampColumn = strictText(
        pyOr(configuration.timestampColumn, configuration.timestampColumnName),
      );
      if (timestampColumn) binding.timestampColumn = timestampColumn;
      bindings.push(binding);
    }
  }

  let relationships: OntologyArtifactMetadata["relationships"] = [];
  for (const [pathId, value] of relationshipParts) {
    const relationshipId = requiredIdentifier(value.id, pathId);
    const name = strictText(value.name) ?? relationshipId;
    const sourceId = isRecord(value.source) && value.source.entityTypeId != null
      ? definitionIdentifier(value.source.entityTypeId)
      : undefined;
    const targetId = isRecord(value.target) && value.target.entityTypeId != null
      ? definitionIdentifier(value.target.entityTypeId)
      : undefined;
    facts.add(
      "Ontology relationship types",
      name,
      `${nameOrUnknown(entityNames, sourceId)} -> ${nameOrUnknown(entityNames, targetId)}`,
    );
    if (sourceId && targetId && entityNames.has(sourceId) && entityNames.has(targetId)) {
      relationships.push({ id: relationshipId, name, sourceEntityId: sourceId, targetEntityId: targetId });
    }
  }

  let contextualizations: OntologyArtifactMetadata["contextualizations"] = [];
  for (const [pathRelationshipId, pathContextualizationId, value] of contextualizationParts) {
    const relationshipId = requiredIdentifier(pathRelationshipId);
    const contextualizationId = requiredIdentifier(value.id, pathContextualizationId);
    const source = sourceMetadata(value.dataBindingTable);
    if (!source) continue;
    if (source.itemId) state.sourceIds.add(source.itemId);
    facts.add("Ontology contextualizations", `${relationshipId}:${contextualizationId}`, sourceSummary(source));
    const relationship = relationships.find((candidate) => candidate.id === relationshipId);
    if (relationship && source.itemId && source.table) {
      contextualizations.push(withOptionalSource(
        {
          id: contextualizationId,
          relationshipId,
          sourceItemId: source.itemId,
          sourceObject: source.table,
          sourceKeyBindings: keyBindings(
            pyOr(value.sourceKeyRefBindings, value.sourceKeyBindings),
            relationship.sourceEntityId,
          ),
          targetKeyBindings: keyBindings(
            pyOr(value.targetKeyRefBindings, value.targetKeyBindings),
            relationship.targetEntityId,
          ),
        } as OntologyArtifactMetadata["contextualizations"][number],
        source,
        sourceKeys,
      ));
    }
  }

  entities = dedupe(entities, (entity) => entity.id, state);
  relationships = dedupe(relationships, (relationship) => relationship.id, state);
  bindings = dedupe(bindings, (binding) => binding.id, state);
  contextualizations = dedupe(contextualizations, (value) => value.id, state);
  // Collection caps must not leave references to dropped entities or relationships.
  const keptEntities = new Set(entities.map((entity) => entity.id));
  const keptRelationships = relationships.filter(
    (relationship) => keptEntities.has(relationship.sourceEntityId) && keptEntities.has(relationship.targetEntityId),
  );
  const keptRelationshipIds = new Set(keptRelationships.map((relationship) => relationship.id));
  const keptBindings = bindings.filter((binding) => keptEntities.has(binding.entityId));
  const keptContextualizations = contextualizations.filter(
    (value) => keptRelationshipIds.has(value.relationshipId),
  );
  if (
    keptRelationships.length !== relationships.length ||
    keptBindings.length !== bindings.length ||
    keptContextualizations.length !== contextualizations.length
  ) {
    state.metadataTruncated = true;
  }
  return {
    kind: "ontology",
    entities,
    relationships: keptRelationships,
    bindings: keptBindings,
    contextualizations: keptContextualizations,
  };
}

/** Python `_safe_graph_properties`. */
function safeGraphProperties(values: unknown): { name: string; dataType: string }[] {
  return list(values)
    .slice(0, LIMITS.maxPropertyRecords)
    .flatMap((value) => {
      if (!isRecord(value)) return [];
      const name = strictText(value.name);
      return name ? [{ name, dataType: strictText(value.type) ?? "property" }] : [];
    });
}

function textList(values: unknown, state: ProjectionState): string[] {
  return capList(list(values).map(strictText).filter((value): value is string => !!value), state);
}

function projectGraph(response: unknown, state: ProjectionState): GraphModelArtifactMetadata {
  const knownPaths = new Map([
    ["graphtype.json", "graphType"],
    ["graphdefinition.json", "graphDefinition"],
    ["datasources.json", "dataSources"],
  ]);
  const known = new Map<string, JsonRecord>();
  for (const part of definitionParts(response)) {
    const lowerPath = partPath(part).toLowerCase();
    if (lowerPath === ".platform" || lowerPath === "stylingconfiguration.json") continue;
    const name = knownPaths.get(lowerPath);
    if (!name) {
      state.unknownParts += 1;
      continue;
    }
    const value = decodeJsonPart(part, state);
    known.set(name, value);
    for (const id of explicitIds(value, [
      "ontologyId",
      "ontologyItemId",
      "sourceOntologyId",
      "sourceOntologyItemId",
      "generatedFromOntologyId",
      "generatedFromOntologyItemId",
    ])) {
      state.ontologyIds.add(id);
    }
  }

  const facts = state.facts;
  const graphType = known.get("graphType") ?? {};
  const rawNodeTypes = list(graphType.nodeTypes);
  const rawEdgeTypes = list(graphType.edgeTypes);
  const declaredAliases = { node: new Set<string>(), edge: new Set<string>() };
  let nodeTypes: GraphModelArtifactMetadata["nodeTypes"] = [];
  for (const node of rawNodeTypes) {
    if (!isRecord(node)) continue;
    const alias = strictText(node.alias);
    if (!alias) continue;
    declaredAliases.node.add(alias);
    const properties = safeGraphProperties(node.properties);
    const labels = textList(node.labels, state);
    facts.add("Graph node types", alias, `${labels.join(", ") || "unlabeled"} | ${properties.length} properties`);
    for (const property of properties) {
      facts.add("Graph node properties", `${alias}.${property.name}`, property.dataType);
    }
    nodeTypes.push({
      alias,
      labels,
      primaryKeyProperties: textList(node.primaryKeyProperties, state),
      properties,
    });
  }
  let edgeTypes: GraphModelArtifactMetadata["edgeTypes"] = [];
  for (const edge of rawEdgeTypes) {
    if (!isRecord(edge)) continue;
    const alias = strictText(edge.alias);
    if (!alias) continue;
    declaredAliases.edge.add(alias);
    const sourceAlias = isRecord(edge.sourceNodeType) ? strictText(edge.sourceNodeType.alias) : undefined;
    const targetAlias = isRecord(edge.destinationNodeType) ? strictText(edge.destinationNodeType.alias) : undefined;
    const properties = safeGraphProperties(edge.properties);
    facts.add(
      "Graph edge types",
      alias,
      `${sourceAlias ?? "unknown"} -> ${targetAlias ?? "unknown"} | ${properties.length} properties`,
    );
    if (sourceAlias && targetAlias) {
      edgeTypes.push({
        alias,
        labels: textList(edge.labels, state),
        sourceNodeType: sourceAlias,
        destinationNodeType: targetAlias,
        properties,
      });
    }
  }

  const sourcesByName = new Map<string, SourceMetadata>();
  let dataSources: GraphModelArtifactMetadata["dataSources"] = [];
  for (const sourceValue of list((known.get("dataSources") ?? {}).dataSources)) {
    if (!isRecord(sourceValue)) continue;
    const name = strictText(sourceValue.name);
    const source = oneLakeSource(sourceValue);
    if (!name || !source) continue;
    sourcesByName.set(name, source);
    if (source.itemId) state.sourceIds.add(source.itemId);
    facts.add("Graph data sources", name, sourceSummary(source));
    if (source.itemId && source.table) {
      dataSources.push(withOptionalSource(
        { name, sourceItemId: source.itemId, sourceObject: source.table },
        source,
        [["sourceWorkspaceId", "workspaceId"], ["sourceObjectId", "sourceObjectId"], ["sourceType", "sourceType"]],
      ));
    }
  }

  const graphDefinition = known.get("graphDefinition") ?? {};
  let mappings: GraphModelArtifactMetadata["mappings"] = [];
  for (const [collection, section, aliasField, kind] of [
    ["nodeTables", "Graph node mappings", "nodeTypeAlias", "node"],
    ["edgeTables", "Graph edge mappings", "edgeTypeAlias", "edge"],
  ] as const) {
    for (const mapping of list(graphDefinition[collection])) {
      if (!isRecord(mapping)) continue;
      const alias = strictText(mapping[aliasField]);
      const dataSourceName = strictText(mapping.dataSourceName);
      if (!alias || !dataSourceName) continue;
      const propertyMappings = list(mapping.propertyMappings);
      facts.add(
        section,
        alias,
        `${dataSourceName} | ${Array.isArray(mapping.propertyMappings) ? propertyMappings.length : 0} property mappings`,
      );
      if (!declaredAliases[kind].has(alias)) continue;
      const typeDefinition = (kind === "node" ? rawNodeTypes : rawEdgeTypes).find(
        (candidate) => isRecord(candidate) && strictText(candidate.alias) === alias,
      ) as JsonRecord | undefined;
      const propertyNames = new Set(safeGraphProperties(typeDefinition?.properties).map((property) => property.name));
      const safeMappings = capList(propertyMappings.flatMap((propertyMapping) => {
        if (!isRecord(propertyMapping)) return [];
        const propertyName = strictText(propertyMapping.propertyName);
        const sourceColumn = strictText(propertyMapping.sourceColumn);
        return propertyName && sourceColumn && propertyNames.has(propertyName)
          ? [{ propertyName, sourceColumn }]
          : [];
      }), state);
      const mappingId = definitionIdentifier(mapping.id, `${kind}:${alias}`);
      const source = sourcesByName.get(dataSourceName);
      if (!mappingId || !source?.itemId || !source.table) continue;
      const metadata = withOptionalSource(
        {
          id: mappingId,
          kind,
          typeAlias: alias,
          dataSourceName,
          sourceItemId: source.itemId,
          sourceObject: source.table,
          propertyMappings: safeMappings,
        } as GraphModelArtifactMetadata["mappings"][number],
        source,
        [["sourceWorkspaceId", "workspaceId"], ["sourceObjectId", "sourceObjectId"]],
      );
      if (kind === "edge") {
        metadata.sourceNodeKeyColumns = textList(mapping.sourceNodeKeyColumns, state);
        metadata.destinationNodeKeyColumns = textList(mapping.destinationNodeKeyColumns, state);
      }
      mappings.push(metadata);
    }
  }

  dataSources = dedupe(dataSources, (value) => value.name, state);
  nodeTypes = dedupe(nodeTypes, (value) => value.alias, state);
  edgeTypes = dedupe(edgeTypes, (value) => value.alias, state);
  mappings = dedupe(mappings, (value) => value.id, state);
  const nodeAliases = new Set(nodeTypes.map((node) => node.alias));
  edgeTypes = edgeTypes.filter(
    (edge) => nodeAliases.has(edge.sourceNodeType) && nodeAliases.has(edge.destinationNodeType),
  );
  const edgeAliases = new Set(edgeTypes.map((edge) => edge.alias));
  mappings = mappings.filter((mapping) =>
    mapping.kind === "node" ? nodeAliases.has(mapping.typeAlias) : edgeAliases.has(mapping.typeAlias));
  return { kind: "graphModel", dataSources, nodeTypes, edgeTypes, mappings };
}

/** Python `_data_agent_source_object_kind`. */
function dataAgentSourceObjectKind(sourceType: string | undefined, elementType: string | undefined): string | undefined {
  const source = (sourceType ?? "").toLowerCase();
  const element = (elementType ?? "").toLowerCase();
  if (source === "ontology") {
    if (element === "ontology.entity" || element === "graph.nodetype") return "ontology-entity";
    if (element === "ontology.relationship" || element === "graph.edgetype") return "ontology-relationship";
    if (["ontology.property", "ontology.timeseriesproperty", "graph.property"].includes(element)) {
      return "ontology-property";
    }
  }
  if (source === "graph") {
    if (element === "graph.nodetype") return "graph-node";
    if (element === "graph.edgetype") return "graph-edge";
    if (element === "graph.property") return "graph-property";
  }
  return DATA_AGENT_ELEMENT_KINDS.get(element);
}

const DATA_AGENT_ELEMENT_KINDS = new Map([
  ["lakehouse_tables.table", "lakehouse-table"],
  ["lakehouse_tables.column", "lakehouse-table-column"],
  ["warehouse_tables.table", "warehouse-table"],
  ["warehouse_tables.column", "warehouse-table-column"],
  ["kusto.table", "kql-table"],
  ["kusto.column", "kql-table-column"],
  ["kusto.function", "kql-function"],
  ["kusto.materializedview", "kql-materialized-view"],
  ["semantic_model.table", "semantic-model-table"],
  ["semantic_model.column", "semantic-model-table-column"],
  ["semantic_model.measure", "semantic-model-measure"],
  ["mirrored_database.table", "table"],
  ["mirrored_database.column", "table-column"],
  ["graph.nodetype", "graph-node"],
  ["graph.edgetype", "graph-edge"],
  ["graph.property", "graph-property"],
]);

interface ElementContext {
  sourceName: string;
  sourceId?: string;
  sourceType: string;
  stage: string;
  budget: { count: number };
  seen: Set<string>;
}

/** Python `_selected_element_facts`, limited to facts and the metadata element tree. */
function selectedElements(
  elements: unknown,
  context: ElementContext,
  state: ProjectionState,
  parentDisplay: string,
  parentPath: string[],
  metadataElements: unknown[] | undefined,
  metadataParentId: string | undefined,
  metadataParentName: string | undefined,
  depth: number,
): void {
  if (depth > LIMITS.maxNestingDepth) {
    state.metadataTruncated = true;
    return;
  }
  for (const element of list(elements)) {
    if (!isRecord(element)) continue;
    const displayName = boundedText(pyOr(element.display_name, element.displayName));
    if (!displayName) continue;
    const elementType = strictText(element.type);
    const dataType = strictText(pyOr(element.data_type, element.dataType));
    const selected = element.is_selected === true;
    const displayPath = [parentDisplay, displayName].filter(Boolean).join(" / ");
    const elementId = definitionIdentifier(element.id);
    const sourceObjectType = dataAgentSourceObjectKind(context.sourceType, elementType);
    state.facts.add(
      "Data agent selected elements",
      `${context.sourceName}:${displayPath}`,
      `${elementType ?? "element"} | selected ${selected ? "yes" : "no"}`,
    );
    const nextParentPath = [...parentPath];
    let nextMetadataElements = metadataElements;
    let nextParentId = metadataParentId;
    let nextParentName = metadataParentName;
    if (selected && sourceObjectType) {
      context.budget.count += 1;
      if (context.budget.count > LIMITS.maxDataAgentElements) {
        state.metadataTruncated = true;
        return;
      }
      const stableId = [...nextParentPath, `${elementType}:${elementId}`].join("/");
      if (metadataElements && elementId && context.sourceId && elementType && !context.seen.has(stableId)) {
        context.seen.add(stableId);
        const metadata: DataAgentElementArtifactMetadata = {
          id: elementId,
          displayName,
          elementType,
          selected: true,
          sourceArtifactId: context.sourceId,
          parentPath: [...nextParentPath],
          children: [],
        };
        if (dataType) metadata.dataType = dataType;
        if (metadataParentId) metadata.parentId = metadataParentId;
        if (metadataParentName) metadata.parentName = metadataParentName;
        const indexState = strictText(pyOr(element.index_state, element.indexState));
        if (indexState) metadata.indexState = indexState;
        metadata.state = context.stage;
        metadataElements.push(metadata);
        nextMetadataElements = metadata.children;
        nextParentId = elementId;
        nextParentName = displayName;
      }
      nextParentPath.push(displayName);
    }
    if (Array.isArray(element.children)) {
      selectedElements(
        element.children,
        context,
        state,
        displayPath,
        nextParentPath,
        nextMetadataElements,
        nextParentId,
        nextParentName,
        depth + 1,
      );
    }
  }
}

function flattenElements(
  elements: unknown[],
): DataAgentArtifactMetadata["sources"][number]["selectedElements"] {
  return (elements as DataAgentElementArtifactMetadata[]).flatMap((element) => {
    const selected: DataAgentArtifactMetadata["sources"][number]["selectedElements"][number] = {
      id: element.id,
      displayName: element.displayName,
      elementType: element.elementType,
      sourceArtifactId: element.sourceArtifactId,
      parentPath: element.parentPath,
    };
    for (const key of ["dataType", "parentId", "parentName", "state", "indexState"] as const) {
      if (element[key]) selected[key] = element[key];
    }
    return [selected, ...flattenElements(element.children)];
  });
}

function projectDataAgent(response: unknown, state: ProjectionState): DataAgentArtifactMetadata {
  const stages = new Set<string>();
  const sources = new Map<string, DataAgentArtifactMetadata["sources"][number] & { stage: string }>();
  for (const part of definitionParts(response)) {
    const path = partPath(part);
    const lowerPath = path.toLowerCase();
    // AI instructions, few-shot examples and free-text publish descriptions are never read.
    if (
      lowerPath === ".platform" ||
      lowerPath === "dataagentv1.json" ||
      lowerPath === "files/config/data_agent.json" ||
      lowerPath === "files/config/publish_info.json" ||
      lowerPath.endsWith("/fewshots.json")
    ) {
      continue;
    }
    const stageMatch = /^Files\/Config\/(draft|published)\/stage_config\.json$/i.exec(path);
    if (stageMatch) {
      stages.add(stageMatch[1].toLowerCase());
      continue;
    }
    const sourceMatch = /^Files\/Config\/(draft|published)\/[^/]+\/datasource\.json$/i.exec(path);
    if (!sourceMatch) {
      state.unknownParts += 1;
      continue;
    }
    const stage = sourceMatch[1].toLowerCase();
    stages.add(stage);
    const value = decodeJsonPart(part, state);
    const sourceId = normalizedId(value.artifactId);
    const sourceName = boundedText(value.displayName) ?? sourceId ?? "source";
    const sourceType = strictText(value.type) ?? "unknown";
    if (sourceId) state.sourceIds.add(sourceId);
    state.facts.add(
      "Data agent sources",
      `${stage}:${sourceName}`,
      `${sourceType} | ${sourceId ?? "external source"}`,
    );
    const elements: DataAgentElementArtifactMetadata[] = [];
    if (Array.isArray(value.elements)) {
      selectedElements(
        value.elements,
        {
          sourceName: `${stage}:${sourceName}`,
          sourceId,
          sourceType,
          stage,
          budget: { count: 0 },
          seen: new Set(),
        },
        state,
        "",
        [],
        elements,
        undefined,
        undefined,
        0,
      );
    }
    if (!sourceId) continue;
    const source: DataAgentArtifactMetadata["sources"][number] & { stage: string } = {
      artifactId: sourceId,
      displayName: sourceName,
      sourceType,
      elements,
      selectedElements: flattenElements(elements),
      stage,
    };
    const workspaceId = normalizedId(value.workspaceId);
    if (workspaceId) source.workspaceId = workspaceId;
    const existing = sources.get(sourceId);
    if (!existing || (existing.stage !== "published" && stage === "published")) {
      sources.set(sourceId, source);
    }
  }
  state.facts.add("Data agent", "State", stages.has("published") ? "published" : "draft");
  let ordered: DataAgentArtifactMetadata["sources"] = [...sources.values()].map((source) => {
    const result: DataAgentArtifactMetadata["sources"][number] = {
      artifactId: source.artifactId,
      displayName: source.displayName,
      sourceType: source.sourceType,
      elements: source.elements,
      selectedElements: source.selectedElements,
    };
    if (source.workspaceId) result.workspaceId = source.workspaceId;
    return result;
  });
  if (ordered.length > LIMITS.maxMetadataCollection) {
    ordered = ordered.slice(0, LIMITS.maxMetadataCollection);
    state.metadataTruncated = true;
  }
  return { kind: "dataAgent", sources: ordered };
}

function assertSafeText(text: string, maxLength: number): void {
  if (text.length > maxLength || hasControlCharacter(text)) invalid();
  if (isCredentialLikeText(text)) {
    throw new DefinitionProjectionError("unsafe-content-rejected");
  }
}

/** True when projected text resembles credentials, bearer tokens, SAS signatures or connection strings. */
export function isCredentialLikeText(text: string): boolean {
  return SENSITIVE_TEXT.some((pattern) => pattern.test(text));
}

function assertSafeMetadata(value: unknown, depth = 0): void {
  if (depth > LIMITS.maxNestingDepth * 3) invalid();
  if (typeof value === "string") {
    assertSafeText(value, LIMITS.maxMetadataText);
  } else if (Array.isArray(value)) {
    if (value.length > LIMITS.maxDataAgentElements) invalid();
    for (const entry of value) assertSafeMetadata(entry, depth + 1);
  } else if (isRecord(value)) {
    for (const entry of Object.values(value)) assertSafeMetadata(entry, depth + 1);
  } else if (typeof value !== "boolean") {
    invalid();
  }
}

function uuidReferences(values: Set<string>): string[] {
  return [...values]
    .filter((value) => UUID.test(value))
    .sort()
    .slice(0, LIMITS.maxReferenceIds);
}

/** Projects one supported Fabric definition response; throws a fixed-code error otherwise. */
export function projectDefinition(itemType: string, response: unknown): DefinitionProjection {
  const state: ProjectionState = {
    facts: new FactLog(),
    decodedBytes: 0,
    unknownParts: 0,
    metadataTruncated: false,
    sourceIds: new Set(),
    ontologyIds: new Set(),
    graphModelIds: new Set(),
  };
  const metadata =
    itemType === "Ontology"
      ? projectOntology(response, state)
      : itemType === "GraphModel"
        ? projectGraph(response, state)
        : itemType === "DataAgent"
          ? projectDataAgent(response, state)
          : invalid();
  assertSafeMetadata(metadata);
  if (JSON.stringify(metadata).length > LIMITS.maxSerializedMetadata) {
    throw new DefinitionProjectionError("projection-limit-exceeded");
  }
  for (const fact of state.facts.facts) {
    assertSafeText(fact.section, LIMITS.maxFactSection);
    assertSafeText(fact.label, LIMITS.maxFactText);
    assertSafeText(fact.value, LIMITS.maxFactText);
  }
  return {
    metadata,
    facts: state.facts.facts,
    references: {
      sourceItemIds: uuidReferences(state.sourceIds),
      ontologyItemIds: uuidReferences(state.ontologyIds),
      graphModelItemIds: uuidReferences(state.graphModelIds),
    },
    unknownParts: state.unknownParts,
    factsTruncated: state.facts.truncated,
    metadataTruncated: state.metadataTruncated,
  };
}
