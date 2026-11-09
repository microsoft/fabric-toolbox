import { describe, expect, it } from "vitest";
import { ATLAS_FEATURE_FLAGS } from "./feature-flags";
import {
  ITEM_RELATIONS_API_VERSION,
  ITEM_RELATIONS_EVIDENCE_SCHEMA_VERSION,
  ITEM_RELATIONS_EVIDENCE_SOURCE,
  ITEM_RELATIONS_FEATURE_ID,
  ItemRelationsContractError,
  buildItemRelationsGraph,
  classifyItemRelationsFailure,
  compareItemRelationsWithLineage,
  createItemRelationsEvidence,
  describeItemRelation,
  isRetryableItemRelationsFailure,
  itemRelationsNodeKey,
  itemRelationsRequestPath,
  mergeItemRelationsEvidence,
  parseItemRelationsEvidence,
  parseItemRelationsResponse,
  recordItemRelationsFailure,
  recordItemRelationsResponse,
  type ItemRelationsDirection,
  type ItemRelationsQueryEvidence,
  type ItemRelationsRelation,
} from "./item-relations-evidence";
import { lineageEdgeKey } from "./lineage";
import type { Edge } from "./model";
import { PREVIEW_API_REGISTRY } from "./preview-api";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const EXTERNAL_WORKSPACE = "22222222-2222-4222-8222-222222222222";
const PIPELINE = "aaaaaaaa-0000-4000-8000-000000000001";
const NOTEBOOK = "aaaaaaaa-0000-4000-8000-000000000002";
const LAKEHOUSE = "aaaaaaaa-0000-4000-8000-000000000003";
const ENDPOINT = "aaaaaaaa-0000-4000-8000-000000000004";
const MODEL = "aaaaaaaa-0000-4000-8000-000000000005";
const REPORT = "aaaaaaaa-0000-4000-8000-000000000006";
const EXTERNAL_LAKEHOUSE = "bbbbbbbb-0000-4000-8000-000000000001";
const MISSING = "cccccccc-0000-4000-8000-000000000001";
const EARLIER = "2026-09-01T08:00:00.000Z";
const LATER = "2026-10-01T08:00:00.000Z";

function item(
  id: string,
  type: string,
  displayName = type,
  workspaceId = WORKSPACE,
) {
  return { id, workspaceId, type, displayName };
}

function relation(
  itemId: string,
  dependentOnItemId: string,
  relationType: string,
): ItemRelationsRelation {
  return { itemId, dependentOnItemId, relationType };
}

function complete(
  itemId: string,
  direction: ItemRelationsDirection,
  payload: unknown,
  attemptedAt = LATER,
): ItemRelationsQueryEvidence {
  const query = recordItemRelationsResponse(
    itemId,
    direction,
    attemptedAt,
    payload,
  );
  expect(query.status).toBe("complete");
  return query;
}

function evidence(
  queries: ItemRelationsQueryEvidence[],
  collectedAt = LATER,
) {
  return createItemRelationsEvidence(WORKSPACE, collectedAt, queries);
}

describe("Item Relations capability boundary", () => {
  it("stays behind the default-off Beta feature flag", () => {
    expect(PREVIEW_API_REGISTRY[ITEM_RELATIONS_FEATURE_ID].maturity).toBe(
      "beta",
    );
    expect(ATLAS_FEATURE_FLAGS[ITEM_RELATIONS_FEATURE_ID].defaultEnabled).toBe(
      false,
    );
  });

  it("builds only the documented beta request path", () => {
    expect(
      itemRelationsRequestPath(WORKSPACE.toUpperCase(), NOTEBOOK, "upstream"),
    ).toBe(
      `/v1/workspaces/${WORKSPACE}/items/${NOTEBOOK}/relations/upstream?beta=true`,
    );
    expect(() =>
      itemRelationsRequestPath("workspace", NOTEBOOK, "downstream"),
    ).toThrow(ItemRelationsContractError);
    expect(() =>
      itemRelationsRequestPath(
        WORKSPACE,
        NOTEBOOK,
        "sideways" as ItemRelationsDirection,
      ),
    ).toThrow(ItemRelationsContractError);
  });
});

describe("Item Relations response contract", () => {
  it("keeps unknown types verbatim, drops extra fields and collapses duplicates", () => {
    const parsed = parseItemRelationsResponse({
      items: [
        { ...item(LAKEHOUSE.toUpperCase(), "FutureFabricItem"), description: "x" },
        item(LAKEHOUSE, "FutureFabricItem"),
      ],
      relations: [
        relation(NOTEBOOK, LAKEHOUSE, "FutureRelation"),
        relation(NOTEBOOK, LAKEHOUSE, "futurerelation"),
      ],
      workspaces: [{ id: WORKSPACE, displayName: "Workspace", owner: "x" }],
      continuationToken: "ignored",
    });

    expect(parsed).toEqual({
      items: [item(LAKEHOUSE, "FutureFabricItem")],
      relations: [relation(NOTEBOOK, LAKEHOUSE, "FutureRelation")],
      workspaces: [{ id: WORKSPACE, displayName: "Workspace" }],
    });
  });

  it("accepts self relations and cycles as evidence", () => {
    expect(
      parseItemRelationsResponse({
        items: [item(LAKEHOUSE, "Lakehouse")],
        relations: [
          relation(NOTEBOOK, LAKEHOUSE, "Datasource"),
          relation(LAKEHOUSE, NOTEBOOK, "Datasource"),
          relation(NOTEBOOK, NOTEBOOK, "Datasource"),
        ],
        workspaces: [],
      }).relations,
    ).toHaveLength(3);
  });

  it.each([
    ["a non-object payload", "[]"],
    ["a missing relations array", { items: [], workspaces: [] }],
    ["a non-array workspaces value", { items: [], relations: [], workspaces: {} }],
    [
      "a relation endpoint that is not a UUID",
      {
        items: [],
        relations: [relation(NOTEBOOK, "lakehouse", "Datasource")],
        workspaces: [],
      },
    ],
    [
      "a blank relation type",
      {
        items: [],
        relations: [relation(NOTEBOOK, LAKEHOUSE, "  ")],
        workspaces: [],
      },
    ],
    [
      "an oversized relation type",
      {
        items: [],
        relations: [relation(NOTEBOOK, LAKEHOUSE, "x".repeat(101))],
        workspaces: [],
      },
    ],
    [
      "an item without a display name",
      {
        items: [{ id: LAKEHOUSE, workspaceId: WORKSPACE, type: "Lakehouse" }],
        relations: [],
        workspaces: [],
      },
    ],
    ["a null relation", { items: [], relations: [null], workspaces: [] }],
  ])("rejects %s", (_label, payload) => {
    expect(() => parseItemRelationsResponse(payload)).toThrow(
      ItemRelationsContractError,
    );
    expect(
      recordItemRelationsResponse(NOTEBOOK, "upstream", LATER, payload),
    ).toEqual({
      itemId: NOTEBOOK,
      direction: "upstream",
      status: "failed",
      attemptedAt: LATER,
      failureCode: "malformed-response",
    });
  });

  it("classifies API failures without reading error messages", () => {
    expect(classifyItemRelationsFailure({ status: 401 })).toBe("unauthorized");
    expect(classifyItemRelationsFailure({ status: 403 })).toBe(
      "insufficient-privileges",
    );
    expect(
      classifyItemRelationsFailure({
        status: 400,
        errorCode: "InsufficientPrivileges",
      }),
    ).toBe("insufficient-privileges");
    expect(
      classifyItemRelationsFailure({ status: 404, errorCode: "ItemNotFound" }),
    ).toBe("item-not-found");
    expect(classifyItemRelationsFailure({ status: 429 })).toBe("throttled");
    expect(classifyItemRelationsFailure({ status: 503 })).toBe("transient");
    expect(classifyItemRelationsFailure({ timedOut: true })).toBe("transient");
    expect(classifyItemRelationsFailure({ status: 400 })).toBe("failed");
    expect(isRetryableItemRelationsFailure("throttled")).toBe(true);
    expect(isRetryableItemRelationsFailure("transient")).toBe(true);
    expect(isRetryableItemRelationsFailure("not-attempted")).toBe(true);
    expect(isRetryableItemRelationsFailure("unauthorized")).toBe(false);
    expect(isRetryableItemRelationsFailure("malformed-response")).toBe(false);
  });
});

describe("Item Relations direction semantics", () => {
  it.each([
    ["Datasource", "data", "dependency-to-dependent"],
    ["Shortcut", "data", "dependency-to-dependent"],
    ["PushData", "data", "dependent-to-dependency"],
    ["Orchestration", "control", "dependent-to-dependency"],
    ["CascadeDelete", "lifecycle", "dependency-to-dependent"],
    ["Association", "association", "dependency-to-dependent"],
    ["WeakAssociation", "association", "dependency-to-dependent"],
    ["HiddenInWorkspace", "visibility", "dependency-to-dependent"],
  ] as const)("orients %s per its documented family", (type, flow, orientation) => {
    expect(describeItemRelation(type.toLowerCase())).toEqual({
      relationType: type.toLowerCase(),
      knownType: type,
      flow,
      orientation,
      directionVerified: true,
    });
  });

  it("keeps unknown relation types visible with unverified direction", () => {
    expect(describeItemRelation("FutureRelation")).toEqual({
      relationType: "FutureRelation",
      flow: "unknown",
      orientation: "dependency-to-dependent",
      directionVerified: false,
    });
  });

  it("draws source-to-consumer edges for each relation family", () => {
    const graph = buildItemRelationsGraph(
      evidence([
        complete(NOTEBOOK, "upstream", {
          items: [
            item(PIPELINE, "DataPipeline"),
            item(LAKEHOUSE, "Lakehouse"),
            item(ENDPOINT, "SQLEndpoint"),
          ],
          relations: [
            relation(NOTEBOOK, LAKEHOUSE, "PushData"),
            relation(PIPELINE, NOTEBOOK, "Orchestration"),
            relation(ENDPOINT, LAKEHOUSE, "CascadeDelete"),
            relation(MODEL, ENDPOINT, "Datasource"),
            relation(REPORT, MODEL, "FutureRelation"),
          ],
          workspaces: [],
        }),
        complete(MODEL, "downstream", {
          items: [item(REPORT, "Report")],
          relations: [],
          workspaces: [],
        }),
      ]),
    );
    const key = (id: string) => itemRelationsNodeKey(WORKSPACE, id);
    const byType = new Map(
      graph.edges.map((edge) => [edge.relation.relationType, edge]),
    );

    expect(byType.get("PushData")).toMatchObject({
      sourceKey: key(NOTEBOOK),
      targetKey: key(LAKEHOUSE),
      itemKey: key(NOTEBOOK),
      dependentOnKey: key(LAKEHOUSE),
    });
    expect(byType.get("Orchestration")).toMatchObject({
      sourceKey: key(PIPELINE),
      targetKey: key(NOTEBOOK),
    });
    expect(byType.get("CascadeDelete")).toMatchObject({
      sourceKey: key(LAKEHOUSE),
      targetKey: key(ENDPOINT),
    });
    expect(byType.get("Datasource")).toMatchObject({
      sourceKey: key(ENDPOINT),
      targetKey: key(MODEL),
    });
    expect(byType.get("FutureRelation")).toMatchObject({
      sourceKey: key(MODEL),
      targetKey: key(REPORT),
      relation: relation(REPORT, MODEL, "FutureRelation"),
      semantics: { flow: "unknown", directionVerified: false },
    });
    expect(
      graph.edges.every(
        (edge) => edge.evidenceSource === ITEM_RELATIONS_EVIDENCE_SOURCE,
      ),
    ).toBe(true);
  });
});

describe("Item Relations Preview graph", () => {
  it("uses composite IDs for cross-workspace endpoints", () => {
    const graph = buildItemRelationsGraph(
      evidence([
        complete(MODEL, "upstream", {
          items: [
            item(
              EXTERNAL_LAKEHOUSE,
              "Lakehouse",
              "Shared lakehouse",
              EXTERNAL_WORKSPACE,
            ),
          ],
          relations: [relation(MODEL, EXTERNAL_LAKEHOUSE, "Datasource")],
          workspaces: [{ id: EXTERNAL_WORKSPACE, displayName: "Shared data" }],
        }),
      ]),
      {
        workspaceName: "Analytics",
        localItems: [
          { fabricId: MODEL, displayName: "Sales model", itemType: "SemanticModel" },
        ],
      },
    );

    expect(graph.nodes).toEqual([
      {
        key: itemRelationsNodeKey(WORKSPACE, MODEL),
        id: MODEL,
        workspaceId: WORKSPACE,
        workspaceName: "Analytics",
        displayName: "Sales model",
        itemType: "SemanticModel",
        isLocal: true,
        inSnapshot: true,
        queried: true,
      },
      {
        key: itemRelationsNodeKey(EXTERNAL_WORKSPACE, EXTERNAL_LAKEHOUSE),
        id: EXTERNAL_LAKEHOUSE,
        workspaceId: EXTERNAL_WORKSPACE,
        workspaceName: "Shared data",
        displayName: "Shared lakehouse",
        itemType: "Lakehouse",
        isLocal: false,
        inSnapshot: false,
        queried: false,
      },
    ]);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({
      sourceKey: itemRelationsNodeKey(EXTERNAL_WORKSPACE, EXTERNAL_LAKEHOUSE),
      targetKey: itemRelationsNodeKey(WORKSPACE, MODEL),
      crossWorkspace: true,
    });
  });

  it("keeps unresolved relations as raw evidence", () => {
    const graph = buildItemRelationsGraph(
      evidence([
        complete(MODEL, "upstream", {
          items: [
            item(LAKEHOUSE, "Lakehouse"),
            item(LAKEHOUSE, "Lakehouse", "Copy", EXTERNAL_WORKSPACE),
          ],
          relations: [
            relation(MODEL, MISSING, "Datasource"),
            relation(MODEL, LAKEHOUSE, "Datasource"),
          ],
          workspaces: [],
        }),
      ]),
    );

    expect(graph.edges).toEqual([]);
    expect(graph.unresolved.map((entry) => [entry.relation, entry.reason])).toEqual([
      [relation(MODEL, LAKEHOUSE, "Datasource"), "ambiguous-endpoint"],
      [relation(MODEL, MISSING, "Datasource"), "missing-endpoint"],
    ]);
  });

  it("detects cycles without dropping edges", () => {
    const graph = buildItemRelationsGraph(
      evidence([
        complete(NOTEBOOK, "upstream", {
          items: [item(LAKEHOUSE, "Lakehouse"), item(MODEL, "SemanticModel")],
          relations: [
            relation(LAKEHOUSE, NOTEBOOK, "Datasource"),
            relation(MODEL, LAKEHOUSE, "Datasource"),
            relation(NOTEBOOK, MODEL, "Datasource"),
            relation(REPORT, MODEL, "Datasource"),
            relation(PIPELINE, PIPELINE, "FutureRelation"),
          ],
          workspaces: [],
        }),
        complete(PIPELINE, "downstream", {
          items: [item(REPORT, "Report")],
          relations: [],
          workspaces: [],
        }),
      ]),
    );
    const key = (id: string) => itemRelationsNodeKey(WORKSPACE, id);

    expect(graph.edges).toHaveLength(5);
    expect(graph.cycles).toEqual([
      [key(PIPELINE)],
      [key(NOTEBOOK), key(LAKEHOUSE), key(MODEL)],
    ]);
    expect(
      graph.edges
        .filter((edge) => !edge.inCycle)
        .map((edge) => edge.relation.itemId),
    ).toEqual([REPORT]);
    expect(
      graph.edges.find((edge) => edge.selfRelation)?.inCycle,
    ).toBe(true);
  });

  it("merges observations of the same relation from both directions", () => {
    const graph = buildItemRelationsGraph(
      evidence([
        complete(MODEL, "upstream", {
          items: [item(LAKEHOUSE, "Lakehouse")],
          relations: [relation(MODEL, LAKEHOUSE, "Datasource")],
          workspaces: [],
        }),
        complete(LAKEHOUSE, "downstream", {
          items: [item(MODEL, "SemanticModel")],
          relations: [relation(MODEL.toUpperCase(), LAKEHOUSE, "DATASOURCE")],
          workspaces: [],
        }),
      ]),
    );

    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].relation.relationType).toBe("Datasource");
    expect(
      graph.edges[0].observations.map((observation) => [
        observation.itemId,
        observation.direction,
      ]),
    ).toEqual([
      [MODEL, "upstream"],
      [LAKEHOUSE, "downstream"],
    ]);
  });
});

describe("Item Relations evidence envelope", () => {
  it("round-trips a versioned serialized contract", () => {
    const value = evidence([
      complete(MODEL, "upstream", {
        items: [item(LAKEHOUSE, "Lakehouse")],
        relations: [relation(MODEL, LAKEHOUSE, "Datasource")],
        workspaces: [],
      }),
      recordItemRelationsFailure(MODEL, "downstream", LATER, "throttled"),
    ]);

    expect(value).toMatchObject({
      schemaVersion: ITEM_RELATIONS_EVIDENCE_SCHEMA_VERSION,
      source: ITEM_RELATIONS_EVIDENCE_SOURCE,
      apiVersion: ITEM_RELATIONS_API_VERSION,
      workspaceId: WORKSPACE,
    });
    expect(
      parseItemRelationsEvidence(JSON.parse(JSON.stringify(value)), WORKSPACE),
    ).toEqual(value);
  });

  it.each([
    ["another schema version", { schemaVersion: 2 }],
    ["another source", { source: "fabric-scanner" }],
    ["a transport wrapper", { output: {} }],
    ["a duplicate query", { duplicate: true }],
    ["a complete query without a response", { stripResponse: true }],
    ["a failed query without a code", { stripFailureCode: true }],
  ])("rejects %s", (_label, change) => {
    const base = JSON.parse(
      JSON.stringify(
        evidence([
          complete(MODEL, "upstream", {
            items: [],
            relations: [],
            workspaces: [],
          }),
          recordItemRelationsFailure(MODEL, "downstream", LATER, "failed"),
        ]),
      ),
    );
    let value: unknown = { ...base, ...change };
    if ("output" in change) value = { output: base };
    if ("duplicate" in change) {
      value = { ...base, queries: [base.queries[0], base.queries[0]] };
    }
    if ("stripResponse" in change) {
      delete base.queries[0].response;
      delete base.queries[0].observedAt;
      value = base;
    }
    if ("stripFailureCode" in change) {
      delete base.queries[1].failureCode;
      value = base;
    }

    expect(() => parseItemRelationsEvidence(value)).toThrow(
      ItemRelationsContractError,
    );
  });

  it("rejects evidence for another workspace", () => {
    expect(() =>
      parseItemRelationsEvidence(evidence([]), EXTERNAL_WORKSPACE),
    ).toThrow(/another workspace/);
  });
});

describe("Item Relations prior-evidence preservation", () => {
  const upstream = {
    items: [item(LAKEHOUSE, "Lakehouse")],
    relations: [relation(MODEL, LAKEHOUSE, "Datasource")],
    workspaces: [],
  };
  const downstream = {
    items: [item(REPORT, "Report")],
    relations: [relation(REPORT, MODEL, "Datasource")],
    workspaces: [],
  };
  const previous = evidence(
    [
      complete(MODEL, "upstream", upstream, EARLIER),
      complete(MODEL, "downstream", downstream, EARLIER),
      complete(NOTEBOOK, "upstream", upstream, EARLIER),
    ],
    EARLIER,
  );

  it.each([
    ["authorization", recordItemRelationsFailure(MODEL, "upstream", LATER, "unauthorized")],
    ["throttling", recordItemRelationsFailure(MODEL, "upstream", LATER, "throttled")],
    ["not-attempted", recordItemRelationsFailure(MODEL, "upstream", LATER, "not-attempted")],
    ["a malformed response", recordItemRelationsResponse(MODEL, "upstream", LATER, { items: "x" })],
  ])("keeps prior evidence after %s failures", (_label, failure) => {
    const merged = mergeItemRelationsEvidence(
      previous,
      evidence([failure, complete(MODEL, "downstream", downstream)]),
    );

    expect(merged.queries[0]).toEqual({
      itemId: MODEL,
      direction: "upstream",
      status: "failed",
      attemptedAt: LATER,
      failureCode: failure.failureCode,
      observedAt: EARLIER,
      response: previous.queries[0].response,
    });
    expect(merged.queries[1].observedAt).toBe(LATER);
    expect(parseItemRelationsEvidence(merged)).toEqual(merged);

    const graph = buildItemRelationsGraph(merged);
    expect(graph.coverage).toEqual({ complete: 1, preserved: 1, failed: 0 });
    expect(
      graph.edges.map((edge) => [edge.relation.itemId, edge.preserved]),
    ).toEqual([
      [MODEL, true],
      [REPORT, false],
    ]);
  });

  it("replaces prior evidence with a complete empty response", () => {
    const merged = mergeItemRelationsEvidence(
      previous,
      evidence([
        complete(MODEL, "upstream", { items: [], relations: [], workspaces: [] }),
      ]),
    );

    expect(merged.queries).toHaveLength(1);
    expect(merged.queries[0].response?.relations).toEqual([]);
    expect(buildItemRelationsGraph(merged).edges).toEqual([]);
  });

  it("keeps a failure without invented evidence when nothing was observed before", () => {
    const failure = recordItemRelationsFailure(
      PIPELINE,
      "upstream",
      LATER,
      "insufficient-privileges",
    );
    const merged = mergeItemRelationsEvidence(previous, evidence([failure]));

    expect(merged.queries).toEqual([failure]);
    expect(buildItemRelationsGraph(merged).coverage).toEqual({
      complete: 0,
      preserved: 0,
      failed: 1,
    });
  });

  it("never merges evidence across workspaces", () => {
    const other = createItemRelationsEvidence(EXTERNAL_WORKSPACE, LATER, []);

    expect(() => mergeItemRelationsEvidence(previous, other)).toThrow(
      ItemRelationsContractError,
    );
  });
});

describe("Item Relations comparison with authoritative lineage", () => {
  it("classifies Preview edges without changing authoritative lineage", () => {
    const graph = buildItemRelationsGraph(
      evidence([
        complete(NOTEBOOK, "upstream", {
          items: [
            item(LAKEHOUSE, "Lakehouse"),
            item(PIPELINE, "DataPipeline"),
            item(ENDPOINT, "SQLEndpoint"),
            item(EXTERNAL_LAKEHOUSE, "Lakehouse", "Shared", EXTERNAL_WORKSPACE),
          ],
          relations: [
            relation(NOTEBOOK, LAKEHOUSE, "PushData"),
            relation(PIPELINE, NOTEBOOK, "Orchestration"),
            relation(ENDPOINT, LAKEHOUSE, "CascadeDelete"),
            relation(NOTEBOOK, EXTERNAL_LAKEHOUSE, "Shortcut"),
            relation(ENDPOINT, NOTEBOOK, "HiddenInWorkspace"),
            relation(MODEL, ENDPOINT, "FutureRelation"),
          ],
          workspaces: [],
        }),
        complete(MODEL, "upstream", {
          items: [],
          relations: [],
          workspaces: [],
        }),
      ]),
    );
    const authoritative: readonly Edge[] = Object.freeze([
      Object.freeze({ source: NOTEBOOK, target: LAKEHOUSE, relation: "writes" }),
      Object.freeze({ source: NOTEBOOK, target: PIPELINE, relation: "depends on" }),
      Object.freeze({ source: ENDPOINT, target: MODEL, relation: "reads" }),
      Object.freeze({ source: LAKEHOUSE, target: MODEL, relation: "Direct Lake" }),
      Object.freeze({ source: REPORT, target: ENDPOINT, relation: "reads" }),
    ]);
    const before = JSON.stringify(authoritative);

    const comparison = compareItemRelationsWithLineage(graph, authoritative);
    const status = (type: string) =>
      comparison.edges.get(
        graph.edges.find((edge) => edge.relation.relationType === type)!.id,
      );

    expect(status("PushData")).toBe("matching");
    expect(status("Orchestration")).toBe("direction-conflict");
    expect(status("CascadeDelete")).toBe("preview-only");
    expect(status("Shortcut")).toBe("cross-workspace");
    expect(status("HiddenInWorkspace")).toBe("not-lineage");
    expect(status("FutureRelation")).toBe("unverified-direction");
    expect(comparison.authoritativeOnly).toEqual([
      lineageEdgeKey(authoritative[3]),
    ]);
    expect(comparison.notCovered).toEqual([lineageEdgeKey(authoritative[4])]);
    expect(comparison.counts).toEqual({
      matching: 1,
      "direction-conflict": 1,
      "preview-only": 1,
      "unverified-direction": 1,
      "cross-workspace": 1,
      "not-lineage": 1,
      "authoritative-only": 1,
      "not-covered": 1,
    });
    expect(JSON.stringify(authoritative)).toBe(before);
  });
});
