import { lineageEdgeKey } from "./lineage";
import type { Edge, Item } from "./model";
import type { PreviewFeatureId } from "./preview-api";

// Pure Fabric Item Relations API (Beta) evidence contract. Nothing in this
// module calls Fabric, persists rows or produces authoritative LineageEdge
// values. Callers must gate every use with the `item-relations` feature flag.

export const ITEM_RELATIONS_FEATURE_ID =
  "item-relations" satisfies PreviewFeatureId;
export const ITEM_RELATIONS_EVIDENCE_SOURCE = "fabric-item-relations-api-beta";
export const ITEM_RELATIONS_EVIDENCE_SCHEMA_VERSION = 1;
export const ITEM_RELATIONS_API_VERSION = "v1-beta";
export const ITEM_RELATIONS_DIRECTIONS = ["upstream", "downstream"] as const;

export type ItemRelationsDirection = (typeof ITEM_RELATIONS_DIRECTIONS)[number];

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RESPONSE_ENTRIES = 50_000;
const MAX_EVIDENCE_QUERIES = 10_000;
const MAX_ITEM_TYPE_LENGTH = 100;
const MAX_RELATION_TYPE_LENGTH = 100;
const MAX_DISPLAY_NAME_LENGTH = 300;
const MAX_TIMESTAMP_LENGTH = 64;

export class ItemRelationsContractError extends Error {
  readonly code = "malformed-response";

  constructor(reason: string) {
    super(`Invalid Item Relations evidence: ${reason}.`);
    this.name = "ItemRelationsContractError";
  }
}

type RecordValue = Record<string, unknown>;

function invalid(reason: string): never {
  throw new ItemRelationsContractError(reason);
}

function record(value: unknown, label: string): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid(`${label} is not an object`);
  }
  return value as RecordValue;
}

function boundedArray(
  value: unknown,
  label: string,
  maxLength = MAX_RESPONSE_ENTRIES,
): unknown[] {
  if (!Array.isArray(value) || value.length > maxLength) {
    invalid(`${label} is not a bounded array`);
  }
  return value;
}

function uuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID.test(value)) {
    invalid(`${label} is not a UUID`);
  }
  return value.toLowerCase();
}

function text(value: unknown, label: string, maxLength: number): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maxLength
  ) {
    invalid(`${label} is missing or too long`);
  }
  return value;
}

function timestamp(value: unknown, label: string): string {
  const parsed = text(value, label, MAX_TIMESTAMP_LENGTH);
  if (!Number.isFinite(Date.parse(parsed))) {
    invalid(`${label} is not a timestamp`);
  }
  return parsed;
}

function direction(value: unknown): ItemRelationsDirection {
  if (value !== "upstream" && value !== "downstream") {
    invalid("direction is not upstream or downstream");
  }
  return value;
}

/** Fabric REST path for one Beta relations query; the host is not included. */
export function itemRelationsRequestPath(
  workspaceId: string,
  itemId: string,
  queryDirection: ItemRelationsDirection,
): string {
  return (
    `/v1/workspaces/${uuid(workspaceId, "workspace ID")}` +
    `/items/${uuid(itemId, "item ID")}` +
    `/relations/${direction(queryDirection)}?beta=true`
  );
}

export interface ItemRelationsItem {
  id: string;
  workspaceId: string;
  /** Verbatim Fabric item type; future types are preserved. */
  type: string;
  displayName: string;
}

export interface ItemRelationsWorkspace {
  id: string;
  displayName: string;
}

/** Raw API edge: `itemId` depends on `dependentOnItemId`. */
export interface ItemRelationsRelation {
  itemId: string;
  dependentOnItemId: string;
  /** Verbatim Fabric relation type; future types are preserved. */
  relationType: string;
}

export interface ItemRelationsResponse {
  items: ItemRelationsItem[];
  relations: ItemRelationsRelation[];
  workspaces: ItemRelationsWorkspace[];
}

export function itemRelationsNodeKey(
  workspaceId: string,
  itemId: string,
): string {
  return `${workspaceId.toLowerCase()}:${itemId.toLowerCase()}`;
}

function rawRelationKey(relation: ItemRelationsRelation): string {
  return [
    relation.dependentOnItemId,
    relation.itemId,
    relation.relationType.toLowerCase(),
  ].join("|");
}

/**
 * Validates one Fabric `RelationsResponse` and keeps only allowlisted fields.
 * Unknown item and relation types, cross-workspace endpoints, self relations
 * and cycles are evidence, not contract violations. Exact duplicates collapse.
 */
export function parseItemRelationsResponse(
  value: unknown,
): ItemRelationsResponse {
  const response = record(value, "response");
  const items = new Map<string, ItemRelationsItem>();
  boundedArray(response.items, "items").forEach((entry, index) => {
    const raw = record(entry, `items[${index}]`);
    const item: ItemRelationsItem = {
      id: uuid(raw.id, `items[${index}].id`),
      workspaceId: uuid(raw.workspaceId, `items[${index}].workspaceId`),
      type: text(raw.type, `items[${index}].type`, MAX_ITEM_TYPE_LENGTH),
      displayName: text(
        raw.displayName,
        `items[${index}].displayName`,
        MAX_DISPLAY_NAME_LENGTH,
      ),
    };
    const key = itemRelationsNodeKey(item.workspaceId, item.id);
    if (!items.has(key)) items.set(key, item);
  });

  const relations = new Map<string, ItemRelationsRelation>();
  boundedArray(response.relations, "relations").forEach((entry, index) => {
    const raw = record(entry, `relations[${index}]`);
    const relation: ItemRelationsRelation = {
      itemId: uuid(raw.itemId, `relations[${index}].itemId`),
      dependentOnItemId: uuid(
        raw.dependentOnItemId,
        `relations[${index}].dependentOnItemId`,
      ),
      relationType: text(
        raw.relationType,
        `relations[${index}].relationType`,
        MAX_RELATION_TYPE_LENGTH,
      ),
    };
    const key = rawRelationKey(relation);
    if (!relations.has(key)) relations.set(key, relation);
  });

  const workspaces = new Map<string, ItemRelationsWorkspace>();
  boundedArray(response.workspaces, "workspaces").forEach((entry, index) => {
    const raw = record(entry, `workspaces[${index}]`);
    const workspace: ItemRelationsWorkspace = {
      id: uuid(raw.id, `workspaces[${index}].id`),
      displayName: text(
        raw.displayName,
        `workspaces[${index}].displayName`,
        MAX_DISPLAY_NAME_LENGTH,
      ),
    };
    if (!workspaces.has(workspace.id)) {
      workspaces.set(workspace.id, workspace);
    }
  });

  return {
    items: [...items.values()],
    relations: [...relations.values()],
    workspaces: [...workspaces.values()],
  };
}

export type ItemRelationsFailureCode =
  | "unauthorized"
  | "insufficient-privileges"
  | "item-not-found"
  | "throttled"
  | "transient"
  | "malformed-response"
  | "failed"
  // A collector stopped (deadline, request budget, cancellation or throttling)
  // before this query completed; prior evidence is preserved like any failure.
  | "not-attempted";

const FAILURE_CODES = new Set<ItemRelationsFailureCode>([
  "unauthorized",
  "insufficient-privileges",
  "item-not-found",
  "throttled",
  "transient",
  "malformed-response",
  "failed",
  "not-attempted",
]);

export interface ItemRelationsFailureSignal {
  status?: number;
  /** Fabric `ErrorResponse.errorCode`, never the message or body. */
  errorCode?: string;
  timedOut?: boolean;
}

export function classifyItemRelationsFailure(
  failure: ItemRelationsFailureSignal,
): ItemRelationsFailureCode {
  const errorCode = failure.errorCode?.trim().toLowerCase();
  if (errorCode === "insufficientprivileges") return "insufficient-privileges";
  if (errorCode === "itemnotfound") return "item-not-found";
  if (failure.timedOut) return "transient";
  switch (failure.status) {
    case 401:
      return "unauthorized";
    case 403:
      return "insufficient-privileges";
    case 404:
      return "item-not-found";
    case 429:
      return "throttled";
    case 408:
    case 500:
    case 502:
    case 503:
    case 504:
      return "transient";
    default:
      return "failed";
  }
}

export function isRetryableItemRelationsFailure(
  code: ItemRelationsFailureCode,
): boolean {
  return code === "throttled" || code === "transient" || code === "not-attempted";
}

function failureCode(value: unknown): ItemRelationsFailureCode {
  if (!FAILURE_CODES.has(value as ItemRelationsFailureCode)) {
    invalid("failure code is not recognized");
  }
  return value as ItemRelationsFailureCode;
}

/**
 * One root-item query. A failed query may still carry a response: that is
 * prior evidence preserved by `mergeItemRelationsEvidence`, dated by
 * `observedAt`, while `attemptedAt` records the latest failed attempt.
 */
export interface ItemRelationsQueryEvidence {
  itemId: string;
  direction: ItemRelationsDirection;
  status: "complete" | "failed";
  attemptedAt: string;
  failureCode?: ItemRelationsFailureCode;
  observedAt?: string;
  response?: ItemRelationsResponse;
}

export interface ItemRelationsEvidence {
  schemaVersion: typeof ITEM_RELATIONS_EVIDENCE_SCHEMA_VERSION;
  source: typeof ITEM_RELATIONS_EVIDENCE_SOURCE;
  apiVersion: typeof ITEM_RELATIONS_API_VERSION;
  workspaceId: string;
  collectedAt: string;
  queries: ItemRelationsQueryEvidence[];
}

function queryKey(itemId: string, queryDirection: string): string {
  return `${itemId.toLowerCase()}|${queryDirection}`;
}

/** Records a fetched payload, downgrading contract violations to a failure. */
export function recordItemRelationsResponse(
  itemId: string,
  queryDirection: ItemRelationsDirection,
  attemptedAt: string,
  payload: unknown,
): ItemRelationsQueryEvidence {
  const base = {
    itemId: uuid(itemId, "query item ID"),
    direction: direction(queryDirection),
    attemptedAt: timestamp(attemptedAt, "query attempt timestamp"),
  };
  try {
    return {
      ...base,
      status: "complete",
      observedAt: base.attemptedAt,
      response: parseItemRelationsResponse(payload),
    };
  } catch (error) {
    if (!(error instanceof ItemRelationsContractError)) throw error;
    return { ...base, status: "failed", failureCode: "malformed-response" };
  }
}

export function recordItemRelationsFailure(
  itemId: string,
  queryDirection: ItemRelationsDirection,
  attemptedAt: string,
  code: ItemRelationsFailureCode,
): ItemRelationsQueryEvidence {
  return {
    itemId: uuid(itemId, "query item ID"),
    direction: direction(queryDirection),
    status: "failed",
    attemptedAt: timestamp(attemptedAt, "query attempt timestamp"),
    failureCode: failureCode(code),
  };
}

function parseQuery(value: unknown, index: number): ItemRelationsQueryEvidence {
  const raw = record(value, `queries[${index}]`);
  const status = raw.status;
  if (status !== "complete" && status !== "failed") {
    invalid(`queries[${index}].status is not complete or failed`);
  }
  const query: ItemRelationsQueryEvidence = {
    itemId: uuid(raw.itemId, `queries[${index}].itemId`),
    direction: direction(raw.direction),
    status,
    attemptedAt: timestamp(raw.attemptedAt, `queries[${index}].attemptedAt`),
  };
  const hasResponse = raw.response !== undefined;
  const hasObservedAt = raw.observedAt !== undefined;
  if (hasResponse !== hasObservedAt) {
    invalid(`queries[${index}] response and observedAt must appear together`);
  }
  if (status === "complete") {
    if (!hasResponse || raw.failureCode !== undefined) {
      invalid(`queries[${index}] is complete without a response`);
    }
  } else {
    query.failureCode = failureCode(raw.failureCode);
  }
  if (hasResponse) {
    query.observedAt = timestamp(
      raw.observedAt,
      `queries[${index}].observedAt`,
    );
    query.response = parseItemRelationsResponse(raw.response);
  }
  return query;
}

/** Validates a serialized evidence envelope; transport wrappers are rejected. */
export function parseItemRelationsEvidence(
  value: unknown,
  expectedWorkspaceId?: string,
): ItemRelationsEvidence {
  const raw = record(value, "evidence");
  if (
    raw.schemaVersion !== ITEM_RELATIONS_EVIDENCE_SCHEMA_VERSION ||
    raw.source !== ITEM_RELATIONS_EVIDENCE_SOURCE ||
    raw.apiVersion !== ITEM_RELATIONS_API_VERSION
  ) {
    invalid("unsupported evidence contract");
  }
  const workspaceId = uuid(raw.workspaceId, "workspace ID");
  if (
    expectedWorkspaceId !== undefined &&
    workspaceId !== uuid(expectedWorkspaceId, "expected workspace ID")
  ) {
    invalid("evidence targets another workspace");
  }
  const seen = new Set<string>();
  const queries = boundedArray(
    raw.queries,
    "queries",
    MAX_EVIDENCE_QUERIES,
  ).map((entry, index) => {
    const query = parseQuery(entry, index);
    const key = queryKey(query.itemId, query.direction);
    if (seen.has(key)) invalid(`queries[${index}] is duplicated`);
    seen.add(key);
    return query;
  });
  return {
    schemaVersion: ITEM_RELATIONS_EVIDENCE_SCHEMA_VERSION,
    source: ITEM_RELATIONS_EVIDENCE_SOURCE,
    apiVersion: ITEM_RELATIONS_API_VERSION,
    workspaceId,
    collectedAt: timestamp(raw.collectedAt, "collection timestamp"),
    queries,
  };
}

export function createItemRelationsEvidence(
  workspaceId: string,
  collectedAt: string,
  queries: readonly ItemRelationsQueryEvidence[],
): ItemRelationsEvidence {
  return parseItemRelationsEvidence({
    schemaVersion: ITEM_RELATIONS_EVIDENCE_SCHEMA_VERSION,
    source: ITEM_RELATIONS_EVIDENCE_SOURCE,
    apiVersion: ITEM_RELATIONS_API_VERSION,
    workspaceId,
    collectedAt,
    queries,
  });
}

/**
 * Applies a new collection over prior evidence. Complete queries replace their
 * prior observation, including with an empty response. Failed queries
 * (authorization, throttling, transient, malformed responses or queries the
 * collector did not attempt) keep the prior response and its `observedAt`.
 * The new run defines scope: prior queries for root items that were not
 * requested again are not carried forward.
 */
export function mergeItemRelationsEvidence(
  previous: ItemRelationsEvidence | null | undefined,
  next: ItemRelationsEvidence,
): ItemRelationsEvidence {
  if (previous && previous.workspaceId !== next.workspaceId) {
    invalid("prior evidence targets another workspace");
  }
  const prior = new Map(
    (previous?.queries ?? []).map((query) => [
      queryKey(query.itemId, query.direction),
      query,
    ]),
  );
  return {
    ...next,
    queries: next.queries.map((query) => {
      if (query.status === "complete" || query.response) return query;
      const earlier = prior.get(queryKey(query.itemId, query.direction));
      if (!earlier?.response || !earlier.observedAt) return query;
      return {
        ...query,
        observedAt: earlier.observedAt,
        response: earlier.response,
      };
    }),
  };
}

export const KNOWN_ITEM_RELATION_TYPES = [
  "Datasource",
  "Shortcut",
  "PushData",
  "Orchestration",
  "CascadeDelete",
  "Association",
  "WeakAssociation",
  "HiddenInWorkspace",
] as const;

export type KnownItemRelationType = (typeof KNOWN_ITEM_RELATION_TYPES)[number];

export type ItemRelationFlow =
  | "data"
  | "control"
  | "lifecycle"
  | "association"
  | "visibility"
  | "unknown";

/**
 * `dependency-to-dependent` draws `dependentOnItemId -> itemId`;
 * `dependent-to-dependency` draws `itemId -> dependentOnItemId`.
 */
export type ItemRelationOrientation =
  | "dependency-to-dependent"
  | "dependent-to-dependency";

export interface ItemRelationSemantics {
  relationType: string;
  knownType?: KnownItemRelationType;
  flow: ItemRelationFlow;
  orientation: ItemRelationOrientation;
  /** False when the type is undocumented and the raw dependency orientation is used. */
  directionVerified: boolean;
}

// Orientation follows the Fabric RelationType definitions so that drawn edges
// run from source/provider/parent to consumer/target/child.
const RELATION_SEMANTICS: Record<
  KnownItemRelationType,
  Pick<ItemRelationSemantics, "flow" | "orientation">
> = {
  // The dependent item reads from the dependency.
  Datasource: { flow: "data", orientation: "dependency-to-dependent" },
  Shortcut: { flow: "data", orientation: "dependency-to-dependent" },
  // The dependent item writes data into the dependency.
  PushData: { flow: "data", orientation: "dependent-to-dependency" },
  // The dependent item orchestrates the dependency.
  Orchestration: { flow: "control", orientation: "dependent-to-dependency" },
  // The dependency is the parent whose deletion also deletes the dependent
  // item, which matches scanner evidence such as Lakehouse -> SQL endpoint.
  CascadeDelete: {
    flow: "lifecycle",
    orientation: "dependency-to-dependent",
  },
  Association: {
    flow: "association",
    orientation: "dependency-to-dependent",
  },
  WeakAssociation: {
    flow: "association",
    orientation: "dependency-to-dependent",
  },
  // The dependent item is hidden in the workspace under the dependency.
  HiddenInWorkspace: {
    flow: "visibility",
    orientation: "dependency-to-dependent",
  },
};

const KNOWN_BY_LOWER_CASE = new Map(
  KNOWN_ITEM_RELATION_TYPES.map((type) => [type.toLowerCase(), type]),
);

export function describeItemRelation(
  relationType: string,
): ItemRelationSemantics {
  const knownType = KNOWN_BY_LOWER_CASE.get(relationType.trim().toLowerCase());
  if (!knownType) {
    return {
      relationType,
      flow: "unknown",
      orientation: "dependency-to-dependent",
      directionVerified: false,
    };
  }
  return {
    relationType,
    knownType,
    ...RELATION_SEMANTICS[knownType],
    directionVerified: true,
  };
}

export interface ItemRelationsNode {
  /** Composite `workspaceId:itemId` key; item IDs alone are not unique keys. */
  key: string;
  id: string;
  workspaceId: string;
  workspaceName?: string;
  displayName?: string;
  itemType?: string;
  isLocal: boolean;
  inSnapshot: boolean;
  queried: boolean;
}

export interface ItemRelationsObservation {
  itemId: string;
  direction: ItemRelationsDirection;
  observedAt: string;
  preserved: boolean;
}

/** Preview evidence edge. It is never an authoritative `Edge`/`LineageEdge`. */
export interface ItemRelationsGraphEdge {
  id: string;
  evidenceSource: typeof ITEM_RELATIONS_EVIDENCE_SOURCE;
  relation: ItemRelationsRelation;
  semantics: ItemRelationSemantics;
  itemKey: string;
  dependentOnKey: string;
  sourceKey: string;
  targetKey: string;
  crossWorkspace: boolean;
  selfRelation: boolean;
  inCycle: boolean;
  /** True when every observation was carried forward from earlier evidence. */
  preserved: boolean;
  observations: ItemRelationsObservation[];
}

export interface ItemRelationsUnresolvedRelation {
  relation: ItemRelationsRelation;
  reason: "missing-endpoint" | "ambiguous-endpoint";
  observations: ItemRelationsObservation[];
}

export interface ItemRelationsGraph {
  workspaceId: string;
  nodes: ItemRelationsNode[];
  edges: ItemRelationsGraphEdge[];
  unresolved: ItemRelationsUnresolvedRelation[];
  /** Strongly connected node-key groups, including self relations. */
  cycles: string[][];
  coverage: { complete: number; preserved: number; failed: number };
}

export interface ItemRelationsGraphOptions {
  localItems?: readonly Pick<Item, "fabricId" | "displayName" | "itemType">[];
  workspaceName?: string;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stronglyConnectedComponents(
  nodeKeys: readonly string[],
  edges: readonly Pick<ItemRelationsGraphEdge, "sourceKey" | "targetKey">[],
): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = adjacency.get(edge.sourceKey) ?? [];
    targets.push(edge.targetKey);
    adjacency.set(edge.sourceKey, targets);
  }
  const indexes = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  let nextIndex = 0;
  const visit = (key: string) => {
    indexes.set(key, nextIndex);
    lowLinks.set(key, nextIndex);
    nextIndex += 1;
    stack.push(key);
    onStack.add(key);
  };

  // Iterative Tarjan keeps large or cyclic graphs off the call stack.
  for (const root of nodeKeys) {
    if (indexes.has(root)) continue;
    visit(root);
    const frames = [{ key: root, next: 0 }];
    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      const neighbors = adjacency.get(frame.key) ?? [];
      if (frame.next < neighbors.length) {
        const neighbor = neighbors[frame.next];
        frame.next += 1;
        if (!indexes.has(neighbor)) {
          visit(neighbor);
          frames.push({ key: neighbor, next: 0 });
        } else if (onStack.has(neighbor)) {
          lowLinks.set(
            frame.key,
            Math.min(lowLinks.get(frame.key)!, indexes.get(neighbor)!),
          );
        }
        continue;
      }
      frames.pop();
      const parent = frames[frames.length - 1];
      if (parent) {
        lowLinks.set(
          parent.key,
          Math.min(lowLinks.get(parent.key)!, lowLinks.get(frame.key)!),
        );
      }
      if (lowLinks.get(frame.key) === indexes.get(frame.key)) {
        const component: string[] = [];
        let member: string | undefined;
        do {
          member = stack.pop();
          if (member === undefined) break;
          onStack.delete(member);
          component.push(member);
        } while (member !== frame.key);
        components.push(component.sort(compareText));
      }
    }
  }
  return components;
}

/**
 * Builds the Preview graph from every query that carries a response,
 * including preserved prior evidence. Local snapshot names and types win for
 * local items; API values are used verbatim for everything else.
 */
export function buildItemRelationsGraph(
  evidence: ItemRelationsEvidence,
  options: ItemRelationsGraphOptions = {},
): ItemRelationsGraph {
  const workspaceId = evidence.workspaceId.toLowerCase();
  const workspaceNames = new Map<string, string>();
  const nodes = new Map<string, ItemRelationsNode>();
  const workspacesByItemId = new Map<string, Set<string>>();
  const relations = new Map<
    string,
    { relation: ItemRelationsRelation; observations: ItemRelationsObservation[] }
  >();
  const coverage = { complete: 0, preserved: 0, failed: 0 };

  const node = (nodeWorkspaceId: string, itemId: string) => {
    const key = itemRelationsNodeKey(nodeWorkspaceId, itemId);
    let current = nodes.get(key);
    if (!current) {
      current = {
        key,
        id: itemId.toLowerCase(),
        workspaceId: nodeWorkspaceId.toLowerCase(),
        isLocal: nodeWorkspaceId.toLowerCase() === workspaceId,
        inSnapshot: false,
        queried: false,
      };
      nodes.set(key, current);
    }
    const workspaces = workspacesByItemId.get(current.id) ?? new Set();
    workspaces.add(current.workspaceId);
    workspacesByItemId.set(current.id, workspaces);
    return current;
  };

  for (const item of options.localItems ?? []) {
    const local = node(workspaceId, item.fabricId);
    local.inSnapshot = true;
    local.displayName = item.displayName;
    local.itemType = item.itemType;
  }

  for (const query of evidence.queries) {
    if (!query.response || !query.observedAt) {
      coverage.failed += 1;
      continue;
    }
    const preserved = query.status === "failed";
    if (preserved) coverage.preserved += 1;
    else coverage.complete += 1;
    node(workspaceId, query.itemId).queried = true;
    for (const workspace of query.response.workspaces) {
      if (!workspaceNames.has(workspace.id)) {
        workspaceNames.set(workspace.id, workspace.displayName);
      }
    }
    for (const item of query.response.items) {
      const related = node(item.workspaceId, item.id);
      if (!related.inSnapshot) {
        related.displayName ??= item.displayName;
        related.itemType ??= item.type;
      }
    }
    const observation: ItemRelationsObservation = {
      itemId: query.itemId,
      direction: query.direction,
      observedAt: query.observedAt,
      preserved,
    };
    for (const relation of query.response.relations) {
      const key = rawRelationKey(relation);
      const entry = relations.get(key) ?? { relation, observations: [] };
      entry.observations.push(observation);
      relations.set(key, entry);
    }
  }

  if (options.workspaceName && !workspaceNames.has(workspaceId)) {
    workspaceNames.set(workspaceId, options.workspaceName);
  }
  for (const current of nodes.values()) {
    current.workspaceName = workspaceNames.get(current.workspaceId);
  }

  const resolve = (itemId: string) => {
    const workspaces = workspacesByItemId.get(itemId);
    if (!workspaces || workspaces.size === 0) return "missing-endpoint";
    if (workspaces.size > 1) return "ambiguous-endpoint";
    return itemRelationsNodeKey([...workspaces][0], itemId);
  };

  const edges: ItemRelationsGraphEdge[] = [];
  const unresolved: ItemRelationsUnresolvedRelation[] = [];
  for (const { relation, observations } of relations.values()) {
    const itemKey = resolve(relation.itemId);
    const dependentOnKey = resolve(relation.dependentOnItemId);
    const failure = [itemKey, dependentOnKey].find(
      (value): value is ItemRelationsUnresolvedRelation["reason"] =>
        value === "missing-endpoint" || value === "ambiguous-endpoint",
    );
    if (failure) {
      unresolved.push({ relation, reason: failure, observations });
      continue;
    }
    const semantics = describeItemRelation(relation.relationType);
    const forward = semantics.orientation === "dependency-to-dependent";
    const sourceKey = forward ? dependentOnKey : itemKey;
    const targetKey = forward ? itemKey : dependentOnKey;
    edges.push({
      id: `${dependentOnKey}>${itemKey}|${relation.relationType.toLowerCase()}`,
      evidenceSource: ITEM_RELATIONS_EVIDENCE_SOURCE,
      relation,
      semantics,
      itemKey,
      dependentOnKey,
      sourceKey,
      targetKey,
      crossWorkspace:
        !nodes.get(sourceKey)!.isLocal || !nodes.get(targetKey)!.isLocal,
      selfRelation: sourceKey === targetKey,
      inCycle: false,
      preserved: observations.every((observation) => observation.preserved),
      observations,
    });
  }

  const nodeKeys = [...nodes.keys()].sort(compareText);
  edges.sort((left, right) => compareText(left.id, right.id));
  const componentByKey = new Map<string, string[]>();
  for (const component of stronglyConnectedComponents(nodeKeys, edges)) {
    for (const key of component) componentByKey.set(key, component);
  }
  const cycles = new Set<string[]>();
  for (const edge of edges) {
    const component = componentByKey.get(edge.sourceKey);
    if (
      component &&
      component === componentByKey.get(edge.targetKey) &&
      (component.length > 1 || edge.selfRelation)
    ) {
      edge.inCycle = true;
      cycles.add(component);
    }
  }

  return {
    workspaceId,
    nodes: nodeKeys.map((key) => nodes.get(key)!),
    edges,
    unresolved: unresolved.sort((left, right) =>
      compareText(rawRelationKey(left.relation), rawRelationKey(right.relation)),
    ),
    cycles: [...cycles].sort((left, right) => compareText(left[0], right[0])),
    coverage,
  };
}

export type ItemRelationsComparisonStatus =
  | "matching"
  | "direction-conflict"
  | "preview-only"
  | "unverified-direction"
  | "cross-workspace"
  | "not-lineage";

export interface ItemRelationsLineageComparison {
  /** Preview edge ID to comparison status. */
  edges: ReadonlyMap<string, ItemRelationsComparisonStatus>;
  /** `lineageEdgeKey` values with Preview coverage but no Preview edge. */
  authoritativeOnly: string[];
  /** `lineageEdgeKey` values whose endpoints have no Preview evidence. */
  notCovered: string[];
  counts: Record<
    ItemRelationsComparisonStatus | "authoritative-only" | "not-covered",
    number
  >;
}

function endpointPair(sourceId: string, targetId: string): string {
  return `${sourceId.toLowerCase()}|${targetId.toLowerCase()}`;
}

/**
 * Compares Preview evidence with normalized authoritative item lineage
 * without changing either input. Missing Preview evidence is reported as
 * `notCovered`, never as absence of an authoritative edge.
 */
export function compareItemRelationsWithLineage(
  graph: ItemRelationsGraph,
  authoritativeEdges: readonly Edge[],
): ItemRelationsLineageComparison {
  const nodes = new Map(graph.nodes.map((node) => [node.key, node]));
  const authoritativePairs = new Set(
    authoritativeEdges.map((edge) => endpointPair(edge.source, edge.target)),
  );
  const previewPairs = new Set<string>();
  const statuses = new Map<string, ItemRelationsComparisonStatus>();
  const counts: ItemRelationsLineageComparison["counts"] = {
    matching: 0,
    "direction-conflict": 0,
    "preview-only": 0,
    "unverified-direction": 0,
    "cross-workspace": 0,
    "not-lineage": 0,
    "authoritative-only": 0,
    "not-covered": 0,
  };
  const assign = (id: string, status: ItemRelationsComparisonStatus) => {
    statuses.set(id, status);
    counts[status] += 1;
  };

  for (const edge of graph.edges) {
    if (edge.semantics.flow === "visibility") {
      assign(edge.id, "not-lineage");
      continue;
    }
    if (edge.crossWorkspace) {
      assign(edge.id, "cross-workspace");
      continue;
    }
    const source = nodes.get(edge.sourceKey)!.id;
    const target = nodes.get(edge.targetKey)!.id;
    previewPairs.add(endpointPair(source, target));
    previewPairs.add(endpointPair(target, source));
    const forward = authoritativePairs.has(endpointPair(source, target));
    const reverse = authoritativePairs.has(endpointPair(target, source));
    if (!edge.semantics.directionVerified) {
      assign(edge.id, forward || reverse ? "unverified-direction" : "preview-only");
    } else if (forward) {
      assign(edge.id, "matching");
    } else if (reverse) {
      assign(edge.id, "direction-conflict");
    } else {
      assign(edge.id, "preview-only");
    }
  }

  const queried = new Set(
    graph.nodes
      .filter((node) => node.isLocal && node.queried)
      .map((node) => node.id),
  );
  const authoritativeOnly: string[] = [];
  const notCovered: string[] = [];
  for (const edge of authoritativeEdges) {
    if (previewPairs.has(endpointPair(edge.source, edge.target))) continue;
    if (
      queried.has(edge.source.toLowerCase()) ||
      queried.has(edge.target.toLowerCase())
    ) {
      authoritativeOnly.push(lineageEdgeKey(edge));
    } else {
      notCovered.push(lineageEdgeKey(edge));
    }
  }
  counts["authoritative-only"] = authoritativeOnly.length;
  counts["not-covered"] = notCovered.length;
  return { edges: statuses, authoritativeOnly, notCovered, counts };
}
