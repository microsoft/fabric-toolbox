import type {
  AtlasData,
  Edge,
  Item,
  ItemType,
  ModelTableSchema,
} from "./model";
import type { SchemaDependency } from "./schema-lineage";

export type LineageDirection = "upstream" | "downstream";

export interface LineagePath {
  ids: Set<string>;
  edgeKeys: Set<string>;
  distance: Map<string, number>;
}

export interface LineageImpact {
  upstream: LineagePath;
  downstream: LineagePath;
}

export interface IndexedLineageEdge {
  edge: Edge;
  key: string;
  ordinal: number;
}

export interface LineageIndex {
  entries: IndexedLineageEdge[];
  incoming: Map<string, IndexedLineageEdge[]>;
  outgoing: Map<string, IndexedLineageEdge[]>;
  incident: Map<string, Array<{ entry: IndexedLineageEdge; neighborId: string }>>;
  neighbors: Map<string, Set<string>>;
  incidentIds: Set<string>;
}

export interface LineageImpactItem {
  id: string;
  distance: number;
  item?: Item;
}

export interface ItemImpactReport {
  itemId: string;
  item?: Item;
  upstream: LineageImpactItem[];
  downstream: LineageImpactItem[];
  relevantEdges: Edge[];
  unresolvedEndpointIds: string[];
}

export type SchemaObjectKind = "table" | "view" | "column" | "measure";

export interface SchemaObjectRef {
  itemId: string;
  kind: SchemaObjectKind;
  name: string;
  tableName?: string;
}

export interface SchemaObjectImpactReport extends ItemImpactReport {
  object: SchemaObjectRef;
  objectExists: boolean;
  granularity: "item" | "object";
  verifiedObjectDependencies: boolean;
  objectImpact?: {
    upstream: SchemaObjectImpactEntry[];
    downstream: SchemaObjectImpactEntry[];
    relevantDependencies: SchemaDependency[];
  };
  detail: string;
}

export interface SchemaObjectImpactEntry {
  object: SchemaObjectRef;
  distance: number;
  confidence: "verified" | "inferred";
}

export interface StagedLayout {
  positions: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
  stageCount: number;
  groups: Array<{
    id: string;
    label: string;
    itemIds: string[];
    y: number;
    height: number;
  }>;
}

export const LINEAGE_STAGE_LABELS = [
  "Orchestrate",
  "Transform",
  "Store",
  "Endpoint",
  "Model",
  "Consume",
] as const;

const ITEM_STAGE: Partial<Record<ItemType, number>> = {
  DataPipeline: 0,
  Dataflow: 1,
  Notebook: 1,
  Eventstream: 0,
  UserDataFunction: 0,
  AppBackend: 5,
  Lakehouse: 2,
  Warehouse: 2,
  Datamart: 2,
  Eventhouse: 2,
  MirroredDatabase: 2,
  SQLDatabase: 2,
  SQLEndpoint: 3,
  KQLDatabase: 3,
  SemanticModel: 4,
  Ontology: 4,
  GraphModel: 4,
  Report: 5,
  Dashboard: 5,
  DataAgent: 5,
  KQLQueryset: 5,
  KQLDashboard: 5,
};

const AUTHORITATIVE_DIRECTION_RELATIONS = new Set([
  "dataflow",
  "datamart",
  "semantic model",
  "report",
  "dashboard report",
  "dashboard dataset",
]);

export function lineageEdgeKey(edge: Edge): string {
  return `${edge.source}\u0000${edge.target}\u0000${edge.relation}`;
}

export function createLineageIndex(edges: Edge[]): LineageIndex {
  const incoming = new Map<string, IndexedLineageEdge[]>();
  const outgoing = new Map<string, IndexedLineageEdge[]>();
  const incident = new Map<
    string,
    Array<{ entry: IndexedLineageEdge; neighborId: string }>
  >();
  const neighbors = new Map<string, Set<string>>();
  const incidentIds = new Set<string>();
  const entries = edges.map((edge, ordinal) => ({
    edge,
    key: lineageEdgeKey(edge),
    ordinal,
  }));

  const append = <T,>(map: Map<string, T[]>, key: string, value: T) => {
    const values = map.get(key) ?? [];
    values.push(value);
    map.set(key, values);
  };
  const connect = (source: string, target: string) => {
    const values = neighbors.get(source) ?? new Set<string>();
    values.add(target);
    neighbors.set(source, values);
  };

  for (const entry of entries) {
    const { source, target } = entry.edge;
    append(outgoing, source, entry);
    append(incoming, target, entry);
    append(incident, source, { entry, neighborId: target });
    append(incident, target, { entry, neighborId: source });
    connect(source, target);
    connect(target, source);
    incidentIds.add(source);
    incidentIds.add(target);
  }

  return {
    entries,
    incoming,
    outgoing,
    incident,
    neighbors,
    incidentIds,
  };
}

function walkLineage(
  index: LineageIndex,
  startId: string,
  direction: LineageDirection,
  maxDepth: number,
): LineagePath {
  const ids = new Set<string>();
  const edgeKeys = new Set<string>();
  const distance = new Map<string, number>();
  const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];
  const visited = new Set<string>([startId]);
  let head = 0;

  while (head < queue.length) {
    const current = queue[head++];
    if (current.depth >= maxDepth) continue;

    const entries =
      direction === "upstream"
        ? index.incoming.get(current.id) ?? []
        : index.outgoing.get(current.id) ?? [];
    for (const entry of entries) {
      const nextId =
        direction === "upstream" ? entry.edge.source : entry.edge.target;
      if (nextId === startId) continue;

      edgeKeys.add(entry.key);
      ids.add(nextId);

      const nextDepth = current.depth + 1;
      const knownDepth = distance.get(nextId);
      if (knownDepth == null || nextDepth < knownDepth) distance.set(nextId, nextDepth);

      if (!visited.has(nextId)) {
        visited.add(nextId);
        queue.push({ id: nextId, depth: nextDepth });
      }
    }
  }

  return { ids, edgeKeys, distance };
}

export function getLineageImpact(
  edgesOrIndex: Edge[] | LineageIndex,
  startId: string,
  maxDepth = Number.POSITIVE_INFINITY,
): LineageImpact {
  if (!startId) {
    const empty = (): LineagePath => ({
      ids: new Set<string>(),
      edgeKeys: new Set<string>(),
      distance: new Map<string, number>(),
    });
    return { upstream: empty(), downstream: empty() };
  }

  const depth =
    Number.isFinite(maxDepth) && maxDepth >= 0
      ? Math.floor(maxDepth)
      : maxDepth === Number.POSITIVE_INFINITY
        ? maxDepth
        : 0;
  const index = Array.isArray(edgesOrIndex)
    ? createLineageIndex(edgesOrIndex)
    : edgesOrIndex;

  return {
    upstream: walkLineage(index, startId, "upstream", depth),
    downstream: walkLineage(index, startId, "downstream", depth),
  };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function reportImpactItems(
  path: LineagePath,
  itemById: Map<string, Item>,
): LineageImpactItem[] {
  return [...path.ids]
    .map((id) => ({
      id,
      distance: path.distance.get(id) ?? Number.POSITIVE_INFINITY,
      item: itemById.get(id),
    }))
    .sort(
      (left, right) =>
        left.distance - right.distance || compareText(left.id, right.id),
    );
}

export function getItemImpactReport(
  data: Pick<AtlasData, "items" | "edges">,
  itemId: string,
  maxDepth?: number,
): ItemImpactReport;
export function getItemImpactReport(
  items: Item[],
  edges: Edge[],
  itemId: string,
  maxDepth?: number,
): ItemImpactReport;
export function getItemImpactReport(
  dataOrItems: Pick<AtlasData, "items" | "edges"> | Item[],
  itemIdOrEdges: string | Edge[],
  maxDepthOrItemId?: number | string,
  maybeMaxDepth?: number,
): ItemImpactReport {
  const data = Array.isArray(dataOrItems)
    ? {
        items: dataOrItems,
        edges: itemIdOrEdges as Edge[],
        itemId: maxDepthOrItemId as string,
        maxDepth: maybeMaxDepth,
      }
    : {
        items: dataOrItems.items,
        edges: dataOrItems.edges,
        itemId: itemIdOrEdges as string,
        maxDepth: maxDepthOrItemId as number | undefined,
      };
  const index = createLineageIndex(data.edges);
  const impact = getLineageImpact(index, data.itemId, data.maxDepth);
  const itemById = new Map(data.items.map((item) => [item.fabricId, item]));
  const relevantKeys = new Set([
    ...impact.upstream.edgeKeys,
    ...impact.downstream.edgeKeys,
  ]);
  const relevantEdges = index.entries
    .filter((entry) => relevantKeys.has(entry.key))
    .sort((left, right) => compareText(left.key, right.key))
    .map((entry) => entry.edge);
  const unresolvedEndpointIds = [
    ...new Set(
      relevantEdges
        .flatMap((edge) => [edge.source, edge.target])
        .concat(data.itemId)
        .filter((id) => !itemById.has(id)),
    ),
  ].sort(compareText);

  return {
    itemId: data.itemId,
    item: itemById.get(data.itemId),
    upstream: reportImpactItems(impact.upstream, itemById),
    downstream: reportImpactItems(impact.downstream, itemById),
    relevantEdges,
    unresolvedEndpointIds,
  };
}

export const buildItemImpactReport = getItemImpactReport;

function schemaObjectExists(
  tables: ModelTableSchema[],
  object: SchemaObjectRef,
): boolean {
  if (object.kind === "table" || object.kind === "view") {
    return tables.some((table) => {
      if (table.name !== object.name) return false;
      const isView = table.objectType?.trim().toLowerCase() === "view";
      return object.kind === "view" ? isView : !isView;
    });
  }

  if (!object.tableName) return false;
  const table = tables.find((candidate) => candidate.name === object.tableName);
  if (!table) return false;
  return object.kind === "column"
    ? table.columns.some((column) => column.name === object.name)
    : table.measures.some((measure) => measure.name === object.name);
}

export function getSchemaObjectImpactReport(
  data: Pick<AtlasData, "items" | "edges" | "schema">,
  object: SchemaObjectRef,
  options?:
    | number
    | {
        maxDepth?: number;
        dependencies?: SchemaDependency[];
      },
): SchemaObjectImpactReport {
  const maxDepth =
    typeof options === "number" ? options : options?.maxDepth;
  const itemReport = getItemImpactReport(data, object.itemId, maxDepth);
  const objectExists = schemaObjectExists(
    data.schema?.[object.itemId] ?? [],
    object,
  );
  const dependencies =
    typeof options === "object" ? options.dependencies ?? [] : [];
  const objectKey = (reference: SchemaObjectRef) =>
    [
      reference.itemId,
      reference.kind,
      reference.tableName?.trim().toLocaleLowerCase() ?? "",
      reference.name.trim().toLocaleLowerCase(),
    ].join("\u0000");
  const startKey = objectKey(object);
  const byFrom = new Map<string, SchemaDependency[]>();
  const byTo = new Map<string, SchemaDependency[]>();
  for (const dependency of dependencies) {
    const from = objectKey(dependency.from);
    const to = objectKey(dependency.to);
    byFrom.set(from, [...(byFrom.get(from) ?? []), dependency]);
    byTo.set(to, [...(byTo.get(to) ?? []), dependency]);
  }
  const walk = (direction: "upstream" | "downstream") => {
    const found = new Map<string, SchemaObjectImpactEntry>();
    const relevant = new Map<string, SchemaDependency>();
    const visited = new Set([startKey]);
    const queue: Array<{
      key: string;
      distance: number;
      confidence: "verified" | "inferred";
    }> = [
      {
        key: startKey,
        distance: 0,
        confidence: "verified" as const,
      },
    ];
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      const nextDependencies =
        direction === "upstream"
          ? byFrom.get(current.key) ?? []
          : byTo.get(current.key) ?? [];
      for (const dependency of nextDependencies) {
        const nextObject =
          direction === "upstream" ? dependency.to : dependency.from;
        const nextKey = objectKey(nextObject);
        if (nextKey === startKey) continue;
        const distance = current.distance + 1;
        const confidence =
          current.confidence === "inferred" ||
          dependency.confidence === "inferred"
            ? "inferred"
            : "verified";
        const existing = found.get(nextKey);
        if (
          !existing ||
          distance < existing.distance ||
          (distance === existing.distance &&
            confidence === "verified" &&
            existing.confidence === "inferred")
        ) {
          found.set(nextKey, {
            object: nextObject,
            distance,
            confidence,
          });
        }
        relevant.set(
          [objectKey(dependency.from), objectKey(dependency.to)].join("\u0001"),
          dependency,
        );
        if (!visited.has(nextKey)) {
          visited.add(nextKey);
          queue.push({ key: nextKey, distance, confidence });
        }
      }
    }
    return {
      entries: [...found.values()].sort(
        (left, right) =>
          left.distance - right.distance ||
          objectKey(left.object).localeCompare(objectKey(right.object)),
      ),
      relevant: [...relevant.values()],
    };
  };
  const upstream = walk("upstream");
  const downstream = walk("downstream");
  const relevantDependencies = [
    ...new Map(
      [...upstream.relevant, ...downstream.relevant].map((dependency) => [
        [
          objectKey(dependency.from),
          objectKey(dependency.to),
          dependency.confidence,
        ].join("\u0001"),
        dependency,
      ]),
    ).values(),
  ];
  const hasObjectImpact =
    objectExists &&
    (upstream.entries.length > 0 ||
      downstream.entries.length > 0 ||
      relevantDependencies.length > 0);
  const objectItems = (
    entries: SchemaObjectImpactEntry[],
  ): LineageImpactItem[] => {
    const byItem = new Map<string, LineageImpactItem>();
    for (const entry of entries) {
      if (entry.object.itemId === object.itemId) continue;
      const existing = byItem.get(entry.object.itemId);
      if (!existing || entry.distance < existing.distance) {
        byItem.set(entry.object.itemId, {
          id: entry.object.itemId,
          distance: entry.distance,
          item: data.items.find(
            (item) => item.fabricId === entry.object.itemId,
          ),
        });
      }
    }
    return [...byItem.values()].sort(
      (left, right) =>
        left.distance - right.distance ||
        left.id.localeCompare(right.id),
    );
  };
  const objectUpstreamItems = objectItems(upstream.entries);
  const objectDownstreamItems = objectItems(downstream.entries);
  const objectItemIds = new Set([
    object.itemId,
    ...objectUpstreamItems.map((entry) => entry.id),
    ...objectDownstreamItems.map((entry) => entry.id),
  ]);
  const objectRelevantEdges = itemReport.relevantEdges.filter(
    (edge) =>
      objectItemIds.has(edge.source) && objectItemIds.has(edge.target),
  );
  return {
    ...itemReport,
    ...(hasObjectImpact
      ? {
          upstream: objectUpstreamItems,
          downstream: objectDownstreamItems,
          relevantEdges: objectRelevantEdges,
          unresolvedEndpointIds: [
            ...new Set(
              objectRelevantEdges
                .flatMap((edge) => [edge.source, edge.target])
                .filter(
                  (id) =>
                    !data.items.some((item) => item.fabricId === id),
                ),
            ),
          ].sort(compareText),
        }
      : {}),
    object: { ...object },
    objectExists,
    granularity: hasObjectImpact ? "object" : "item",
    verifiedObjectDependencies:
      hasObjectImpact &&
      [...upstream.entries, ...downstream.entries].length > 0 &&
      [...upstream.entries, ...downstream.entries].every(
        (entry) => entry.confidence === "verified",
      ),
    objectImpact: hasObjectImpact
      ? {
          upstream: upstream.entries,
          downstream: downstream.entries,
          relevantDependencies,
        }
      : undefined,
    detail:
      hasObjectImpact
        ? "Object dependencies are resolved from DAX references; inferred source hops require item lineage and a unique schema match."
        : "Fabric lineage verifies dependencies at item level only; this report does not infer schema-object lineage from matching names.",
  };
}

export const buildSchemaObjectImpactReport = getSchemaObjectImpactReport;

export function itemStage(type: ItemType | string | null | undefined): number {
  return type ? ITEM_STAGE[type as ItemType] ?? 0 : 0;
}

const MODEL_INPUT_TYPES = new Set<ItemType>([
  "Lakehouse",
  "Warehouse",
  "Eventhouse",
  "KQLDatabase",
  "SQLEndpoint",
  "SQLDatabase",
  "Datamart",
  "MirroredDatabase",
  "SemanticModel",
]);

function isPreferredSourceConsumerPair(source: Item, target: Item): boolean {
  if (
    source.itemType === "Eventhouse" &&
    target.itemType === "KQLDatabase"
  ) {
    return true;
  }
  if (
    MODEL_INPUT_TYPES.has(source.itemType) &&
    (target.itemType === "Ontology" || target.itemType === "GraphModel")
  ) {
    return true;
  }
  if (
    (source.itemType === "Ontology" || source.itemType === "GraphModel") &&
    target.itemType === "DataAgent"
  ) {
    return true;
  }
  return (
    source.itemType === "KQLDatabase" &&
    (target.itemType === "KQLQueryset" ||
      target.itemType === "KQLDashboard")
  );
}

function normalizedRelation(source: Item, target: Item, relation: string): string {
  if (
    source.itemType === "DataPipeline" &&
    (target.itemType === "Notebook" || target.itemType === "Dataflow")
  ) {
    return "orchestrates";
  }
  if (
    (source.itemType === "Notebook" || source.itemType === "Dataflow") &&
    (target.itemType === "Lakehouse" || target.itemType === "Warehouse")
  ) {
    return "writes";
  }
  if (
    source.itemType === "SemanticModel" &&
    (target.itemType === "Report" || target.itemType === "Dashboard")
  ) {
    return "binds";
  }
  if (
    source.itemType === "Lakehouse" &&
    target.itemType === "SQLEndpoint"
  ) {
    return "endpoint";
  }
  if (
    source.itemType === "Eventhouse" &&
    target.itemType === "KQLDatabase"
  ) {
    return "database";
  }
  if (
    MODEL_INPUT_TYPES.has(source.itemType) &&
    target.itemType === "Ontology"
  ) {
    return "binds ontology";
  }
  if (
    MODEL_INPUT_TYPES.has(source.itemType) &&
    target.itemType === "GraphModel"
  ) {
    return "maps graph";
  }
  if (
    (source.itemType === "Ontology" || source.itemType === "GraphModel") &&
    target.itemType === "DataAgent"
  ) {
    return "grounds";
  }
  if (
    source.itemType === "KQLDatabase" &&
    target.itemType === "KQLQueryset"
  ) {
    return "queries";
  }
  if (
    source.itemType === "KQLDatabase" &&
    target.itemType === "KQLDashboard"
  ) {
    return "visualizes";
  }
  return relation || "depends on";
}

export function normalizeLineageEdges(items: Item[], edges: Edge[]): Edge[] {
  const itemById = new Map(items.map((item) => [item.fabricId, item]));
  const normalized: Edge[] = [];
  const seen = new Set<string>();

  for (const edge of edges) {
    let source = itemById.get(edge.source);
    let target = itemById.get(edge.target);
    if (!source || !target || source.fabricId === target.fabricId) continue;

    const authoritativeDirection = AUTHORITATIVE_DIRECTION_RELATIONS.has(
      edge.relation.trim().toLowerCase(),
    );
    const preferredDirection = isPreferredSourceConsumerPair(source, target);
    const preferredReverseDirection = isPreferredSourceConsumerPair(
      target,
      source,
    );
    const reverseByStage =
      !preferredDirection &&
      !preferredReverseDirection &&
      !authoritativeDirection &&
      itemStage(source.itemType) > itemStage(target.itemType);
    const reversePipeline =
      !preferredDirection &&
      !preferredReverseDirection &&
      !authoritativeDirection &&
      source.itemType === "Notebook" &&
      target.itemType === "DataPipeline";
    if (preferredReverseDirection || reverseByStage || reversePipeline) {
      [source, target] = [target, source];
    }

    const next: Edge = {
      source: source.fabricId,
      target: target.fabricId,
      relation: normalizedRelation(source, target, edge.relation),
      broken: edge.broken,
    };
    const key = lineageEdgeKey(next);
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(next);
    }
  }

  return normalized;
}

function connectedComponents(items: Item[], index: LineageIndex): string[][] {
  const components: string[][] = [];
  const visited = new Set<string>();
  for (const item of items) {
    if (visited.has(item.fabricId)) continue;
    const ids: string[] = [];
    const queue = [item.fabricId];
    visited.add(item.fabricId);
    let head = 0;
    while (head < queue.length) {
      const id = queue[head++];
      ids.push(id);
      for (const neighbor of index.neighbors.get(id) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    components.push(ids);
  }
  return components;
}

export function buildStagedLayout(
  items: Item[],
  edges: Edge[],
  options?: {
    nodeWidth?: number;
    nodeHeight?: number;
    columnGap?: number;
    rowGap?: number;
    padding?: number;
    componentGap?: number;
    focusId?: string;
  },
): StagedLayout {
  const nodeWidth = options?.nodeWidth ?? 196;
  const nodeHeight = options?.nodeHeight ?? 60;
  const columnGap = options?.columnGap ?? 230;
  const rowGap = options?.rowGap ?? 78;
  const padding = options?.padding ?? 28;
  const componentGap = options?.componentGap ?? 42;
  const itemById = new Map(items.map((item) => [item.fabricId, item]));
  const index = createLineageIndex(edges);
  const rawComponents = connectedComponents(items, index);
  const isolated = rawComponents.filter((component) => component.length === 1).flat();
  const isolatedIds = new Set(isolated);
  const components = rawComponents.filter((component) => component.length > 1);
  if (isolated.length > 0) components.push(isolated);
  components.sort((a, b) => {
    const focusDelta =
      Number(b.includes(options?.focusId ?? "")) -
      Number(a.includes(options?.focusId ?? ""));
    const isolatedDelta =
      Number(a.every((id) => isolatedIds.has(id))) -
      Number(b.every((id) => isolatedIds.has(id)));
    return focusDelta || isolatedDelta || b.length - a.length;
  });

  const layoutGroups: StagedLayout["groups"] = [];
  const positions = new Map<string, { x: number; y: number }>();
  let yCursor = padding + 34;

  components.forEach((component, componentIndex) => {
    const componentItems = component
      .map((id) => itemById.get(id))
      .filter((item): item is Item => !!item);
    const stages: Item[][] = Array.from(
      { length: LINEAGE_STAGE_LABELS.length },
      () => [],
    );
    componentItems.forEach((item) => stages[itemStage(item.itemType)].push(item));
    stages.forEach((stage) =>
      stage.sort((a, b) => a.displayName.localeCompare(b.displayName)),
    );

    const order = new Map<string, number>();
    stages.forEach((stage) =>
      stage.forEach((item, index) => order.set(item.fabricId, index)),
    );
    for (let pass = 0; pass < 2; pass += 1) {
      const indexes =
        pass === 0
          ? Array.from(
              { length: LINEAGE_STAGE_LABELS.length - 1 },
              (_, index) => index + 1,
            )
          : Array.from(
              { length: LINEAGE_STAGE_LABELS.length - 1 },
              (_, index) => LINEAGE_STAGE_LABELS.length - 2 - index,
            );
      for (const stageIndex of indexes) {
        const scores = new Map<string, number>();
        for (const item of stages[stageIndex]) {
          const neighborOrders = (index.incident.get(item.fabricId) ?? [])
            .map(({ neighborId }) => order.get(neighborId))
            .filter((value): value is number => value != null);
          scores.set(
            item.fabricId,
            neighborOrders.length === 0
              ? Number.POSITIVE_INFINITY
              : neighborOrders.reduce((sum, value) => sum + value, 0) /
                  neighborOrders.length,
          );
        }
        stages[stageIndex].sort((a, b) => {
          const delta =
            (scores.get(a.fabricId) ?? Number.POSITIVE_INFINITY) -
            (scores.get(b.fabricId) ?? Number.POSITIVE_INFINITY);
          return Number.isFinite(delta) && delta !== 0
            ? delta
            : a.displayName.localeCompare(b.displayName);
        });
        stages[stageIndex].forEach((item, index) =>
          order.set(item.fabricId, index),
        );
      }
    }

    const maxRows = Math.max(...stages.map((stage) => stage.length), 1);
    const groupHeight = Math.max(nodeHeight + 44, maxRows * rowGap + 28);
    stages.forEach((stage, stageIndex) => {
      const stageHeight = Math.max(nodeHeight, stage.length * rowGap);
      const stageTop = yCursor + 26 + Math.max(0, (groupHeight - 28 - stageHeight) / 2);
      stage.forEach((item, rowIndex) => {
        positions.set(item.fabricId, {
          x: padding + stageIndex * columnGap,
          y: stageTop + rowIndex * rowGap,
        });
      });
    });

    const semanticModel = componentItems.find(
      (item) => item.itemType === "SemanticModel",
    );
    const isIsolatedGroup =
      component.length > 1 &&
      component.every((id) => !index.incidentIds.has(id));
    const label =
      isIsolatedGroup
        ? "Unconnected items"
        : semanticModel?.displayName ??
          componentItems.find((item) => item.itemType === "Lakehouse")?.displayName ??
          componentItems[0]?.displayName ??
          `Lineage group ${componentIndex + 1}`;
    layoutGroups.push({
      id: `component-${componentIndex}`,
      label,
      itemIds: component,
      y: yCursor,
      height: groupHeight,
    });
    yCursor += groupHeight + componentGap;
  });

  return {
    positions,
    width:
      padding * 2 +
      (LINEAGE_STAGE_LABELS.length - 1) * columnGap +
      nodeWidth,
    height: Math.max(padding * 2 + nodeHeight, yCursor - componentGap + padding),
    stageCount: LINEAGE_STAGE_LABELS.length,
    groups: layoutGroups,
  };
}
