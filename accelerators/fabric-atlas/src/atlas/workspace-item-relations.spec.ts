// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { FabricRestError, fabricApiUrl } from "../../rayfin/functions/src/fabric-rest";
import { SYNCHRONIZER_AUTHORITY_ID } from "../../rayfin/functions/src/synchronizer-gate";
import type { AppFunctionsSchema } from "../../rayfin/functions/src/types";
import {
  collectWorkspaceItemRelations,
  validateCollectItemRelationsInput,
  workspaceCollectItemRelations,
  type CollectItemRelationsDependencies,
  type ItemRelationsEvidenceEnvelope,
} from "../../rayfin/functions/src/workspace-item-relations";
import {
  buildItemRelationsGraph,
  itemRelationsRequestPath,
  mergeItemRelationsEvidence,
  parseItemRelationsEvidence,
  type ItemRelationsDirection,
  type ItemRelationsEvidence,
} from "./item-relations-evidence";

const WS = "11111111-1111-4111-8111-111111111111";
const OTHER_WS = "22222222-2222-4222-8222-222222222222";
const MODEL = "33333333-3333-4333-8333-333333333333";
const LAKEHOUSE = "44444444-4444-4444-8444-444444444444";
const REPORT = "55555555-5555-4555-8555-555555555555";
const EXTERNAL = "66666666-6666-4666-8666-666666666666";
const PIPELINE = "77777777-7777-4777-8777-777777777777";
const CORRELATION = "88888888-8888-4888-8888-888888888888";
const TOKEN = "fixture-fabric-token";
const ATTEMPTED_AT = "2026-10-02T11:00:00.000Z";
const FABRIC = "https://api.fabric.microsoft.com";

type CollectContext = Parameters<typeof workspaceCollectItemRelations>[0];
type Handler = (init?: RequestInit) => Response | Promise<Response>;
type Routes = Record<string, Handler | Handler[]>;

function url(itemId: string, direction: ItemRelationsDirection): string {
  return `${FABRIC}${itemRelationsRequestPath(WS, itemId, direction)}`;
}

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function upstream() {
  return {
    items: [
      { id: LAKEHOUSE.toUpperCase(), workspaceId: WS, type: "Lakehouse", displayName: "Sales lakehouse", description: "private item description" },
      { id: MODEL, workspaceId: WS, type: "SemanticModel", displayName: "Sales model" },
    ],
    relations: [
      { itemId: MODEL, dependentOnItemId: LAKEHOUSE, relationType: "Datasource", privateField: "private" },
    ],
    workspaces: [{ id: WS, displayName: "Atlas fixture", capacityId: "private-capacity" }],
  };
}

function downstream() {
  return {
    items: [
      { id: REPORT, workspaceId: WS, type: "Report", displayName: "Sales report" },
      { id: EXTERNAL, workspaceId: OTHER_WS, type: "FutureFabricThing", displayName: "External consumer" },
      { id: REPORT, workspaceId: WS, type: "Report", displayName: "Duplicate report" },
    ],
    relations: [
      { itemId: REPORT, dependentOnItemId: MODEL, relationType: "Datasource" },
      { itemId: EXTERNAL, dependentOnItemId: MODEL, relationType: "FutureRelation" },
      { itemId: MODEL, dependentOnItemId: MODEL, relationType: "WeakAssociation" },
      { itemId: MODEL, dependentOnItemId: REPORT, relationType: "Datasource" },
      { itemId: REPORT, dependentOnItemId: MODEL, relationType: "datasource" },
    ],
    workspaces: [
      { id: WS, displayName: "Atlas fixture" },
      { id: OTHER_WS, displayName: "Partner workspace" },
    ],
  };
}

function empty() {
  return { items: [], relations: [], workspaces: [] };
}

function routes(overrides: Routes = {}): Routes {
  return {
    [url(MODEL, "upstream")]: () => json(upstream()),
    [url(MODEL, "downstream")]: () => json(downstream()),
    [url(PIPELINE, "upstream")]: () => json(empty()),
    [url(PIPELINE, "downstream")]: () => json(empty()),
    ...overrides,
  };
}

function fabricFetch(table: Routes) {
  const calls = new Map<string, number>();
  return vi.fn<typeof fetch>(async (input, init) => {
    const target = String(input);
    const route = table[target];
    if (!route) throw new Error(`Unexpected fixture URL ${target}`);
    const count = calls.get(target) ?? 0;
    calls.set(target, count + 1);
    const handler = Array.isArray(route) ? route[Math.min(count, route.length - 1)] : route;
    return handler(init);
  });
}

function collect(
  table: Routes,
  itemIds: string[] = [MODEL, PIPELINE],
  options: Omit<CollectItemRelationsDependencies, "fetch"> = {},
) {
  const fetchImpl = fabricFetch(table);
  const sleep = options.sleep ?? vi.fn(async () => undefined);
  const result = collectWorkspaceItemRelations(
    TOKEN,
    { workspaceId: WS, correlationId: null, itemIds },
    { wallClock: () => Date.parse(ATTEMPTED_AT), ...options, fetch: fetchImpl, sleep },
  );
  return { result, fetchImpl, sleep };
}

function urls(fetchImpl: ReturnType<typeof fabricFetch>): string[] {
  return fetchImpl.mock.calls.map(([input]) => String(input));
}

function query(envelope: ItemRelationsEvidenceEnvelope, itemId: string, direction: ItemRelationsDirection) {
  const found = envelope.queries.find(
    (candidate) => candidate.itemId === itemId && candidate.direction === direction,
  );
  return { status: found?.status, failureCode: found?.failureCode };
}

function context(findById: () => Promise<unknown>, token: () => string = () => TOKEN): CollectContext {
  return {
    getDataClient: () => ({
      SynchronizerAuthority: { findById, create: vi.fn().mockRejectedValue(new Error("denied")) },
    }),
    Tokens: {
      get Fabric() {
        return token();
      },
    },
  } as unknown as CollectContext;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("workspaceCollectItemRelations contract", () => {
  it("binds the Fabric audience with a flat typed root-item batch", () => {
    const metadata = JSON.parse(
      readFileSync(resolve("rayfin", "functions", "runtimemetadata.json"), "utf8"),
    ) as { functions: { functionName: string; contextAudiences: string[]; delegateParameters: Record<string, unknown>[] }[] };
    const fn = metadata.functions.find((candidate) => candidate.functionName === "workspaceCollectItemRelations");
    expect(fn?.contextAudiences).toEqual(["Fabric"]);
    expect(fn?.delegateParameters).toEqual([
      expect.objectContaining({ name: "ctx", type: "RayfinContext<AtlasSchema, AudienceType.Fabric>" }),
      expect.objectContaining({ name: "protocolVersion", type: "1" }),
      expect.objectContaining({ name: "workspaceId", type: "SyncUuidInput" }),
      // A custom alias bypasses the SDK's coercing array converter; the strict validator owns it.
      expect.objectContaining({ name: "itemIds", type: "ItemRelationsRootItemIdsInput", hasDefault: false }),
      expect.objectContaining({ name: "correlationId", type: "SyncUuidInput | null", hasDefault: true }),
    ]);
  });

  it("generates exact client types assignable to the pure evidence contract", () => {
    expectTypeOf<AppFunctionsSchema["workspaceCollectItemRelations"]["input"]>().toEqualTypeOf<{
      protocolVersion: 1;
      workspaceId: string;
      itemIds: string[];
      correlationId: string | null;
    }>();
    expectTypeOf<AppFunctionsSchema["workspaceCollectItemRelations"]["output"]>()
      .toEqualTypeOf<ItemRelationsEvidenceEnvelope>();
    expectTypeOf<ItemRelationsEvidenceEnvelope>().toExtend<ItemRelationsEvidence>();
  });
});

describe("workspaceCollectItemRelations input validation", () => {
  it("accepts a bounded unique batch and normalizes UUID case", () => {
    expect(validateCollectItemRelationsInput(1, WS.toUpperCase(), [MODEL.toUpperCase(), PIPELINE], null)).toEqual({
      workspaceId: WS,
      correlationId: null,
      itemIds: [MODEL, PIPELINE],
    });
  });

  it.each([
    ["string protocol", "1", [MODEL], null],
    ["empty batch", 1, [], null],
    ["oversized batch", 1, Array.from({ length: 17 }, (_, index) => `${String(index % 9 + 1).repeat(8)}-1111-4111-8111-${String(index).padStart(12, "0")}`), null],
    ["duplicate roots", 1, [MODEL, MODEL.toUpperCase()], null],
    ["a URL", 1, [`${FABRIC}/v1/workspaces/${WS}/items/${MODEL}`], null],
    ["a non-RFC UUID", 1, ["11111111-1111-1111-1111-111111111111"], null],
    ["a non-array batch", 1, MODEL, null],
    ["an empty correlation", 1, [MODEL], ""],
  ])("rejects %s with a fixed message", (_name, protocolVersion, itemIds, correlationId) => {
    expect(() => validateCollectItemRelationsInput(protocolVersion, WS, itemIds, correlationId)).toThrow(
      "Use protocolVersion 1, a strict workspace UUID, 1-16 unique root item UUIDs and a strict correlation UUID or null.",
    );
  });
});

describe("workspaceCollectItemRelations authorization", () => {
  it("fails closed before reading the token or calling Fabric", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const token = vi.fn(() => TOKEN);
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      workspaceCollectItemRelations(
        context(vi.fn().mockRejectedValue(new Error("policy denied")), token),
        1,
        WS,
        [MODEL],
        null,
        { fetch: fetchImpl },
      ),
    ).rejects.toThrow("Item Relations collection requires the configured Atlas administrator.");
    expect(token).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns a fixed error when the declared Fabric token is unavailable", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const failure = workspaceCollectItemRelations(
      context(
        async () => ({ id: SYNCHRONIZER_AUTHORITY_ID, createdAt: new Date() }),
        () => {
          throw new Error(`binding failed for ${TOKEN}`);
        },
      ),
      1,
      WS,
      [MODEL],
      null,
      { fetch: fetchImpl },
    );
    await expect(failure).rejects.toThrow("The Fabric application token was unavailable.");
    await expect(failure).rejects.not.toThrow(TOKEN);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("runs the sentinel gate before the first relations request", async () => {
    const order: string[] = [];
    const fetchImpl = fabricFetch(routes());
    fetchImpl.mockImplementationOnce(async () => {
      order.push("fabric");
      return json(upstream());
    });
    const envelope = await workspaceCollectItemRelations(
      context(async () => {
        order.push("gate");
        return { id: SYNCHRONIZER_AUTHORITY_ID, createdAt: new Date() };
      }),
      1,
      WS,
      [MODEL],
      CORRELATION,
      { fetch: fetchImpl, sleep: async () => undefined },
    );
    expect(order.slice(0, 2)).toEqual(["gate", "fabric"]);
    expect(envelope.correlationId).toBe(CORRELATION);
  });
});

describe("workspaceCollectItemRelations evidence", () => {
  it("queries both directions on fixed Beta paths and returns raw dependency evidence", async () => {
    const { result, fetchImpl } = collect(routes());
    const envelope = await result;

    expect(urls(fetchImpl)).toEqual([
      url(MODEL, "upstream"),
      url(MODEL, "downstream"),
      url(PIPELINE, "upstream"),
      url(PIPELINE, "downstream"),
    ]);
    expect(urls(fetchImpl).every((target) => new URL(target).search === "?beta=true")).toBe(true);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init).toMatchObject({
        method: "GET",
        redirect: "manual",
        headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
      });
    }

    expect(envelope).toMatchObject({
      schemaVersion: 1,
      source: "fabric-item-relations-api-beta",
      apiVersion: "v1-beta",
      workspaceId: WS,
      collectedAt: ATTEMPTED_AT,
      authoritative: false,
    });
    expect(envelope).not.toHaveProperty("stopReason");
    expect(envelope).not.toHaveProperty("correlationId");
    expect(envelope.queries[0]).toEqual({
      itemId: MODEL,
      direction: "upstream",
      status: "complete",
      attemptedAt: ATTEMPTED_AT,
      observedAt: ATTEMPTED_AT,
      response: {
        items: [
          { id: LAKEHOUSE, workspaceId: WS, type: "Lakehouse", displayName: "Sales lakehouse" },
          { id: MODEL, workspaceId: WS, type: "SemanticModel", displayName: "Sales model" },
        ],
        relations: [{ itemId: MODEL, dependentOnItemId: LAKEHOUSE, relationType: "Datasource" }],
        workspaces: [{ id: WS, displayName: "Atlas fixture" }],
      },
    });
    expect(envelope.queries[1].response).toEqual({
      items: [
        { id: REPORT, workspaceId: WS, type: "Report", displayName: "Sales report" },
        { id: EXTERNAL, workspaceId: OTHER_WS, type: "FutureFabricThing", displayName: "External consumer" },
      ],
      relations: [
        { itemId: REPORT, dependentOnItemId: MODEL, relationType: "Datasource" },
        { itemId: EXTERNAL, dependentOnItemId: MODEL, relationType: "FutureRelation" },
        { itemId: MODEL, dependentOnItemId: MODEL, relationType: "WeakAssociation" },
        { itemId: MODEL, dependentOnItemId: REPORT, relationType: "Datasource" },
      ],
      workspaces: [
        { id: WS, displayName: "Atlas fixture" },
        { id: OTHER_WS, displayName: "Partner workspace" },
      ],
    });

    // The pure contract accepts the envelope and owns orientation, cycles and coverage.
    const evidence = parseItemRelationsEvidence(envelope, WS);
    expect(evidence.queries).toEqual(envelope.queries);
    const graph = buildItemRelationsGraph(evidence);
    expect(graph.coverage).toEqual({ complete: 4, preserved: 0, failed: 0 });
    const external = graph.edges.find((edge) => edge.relation.relationType === "FutureRelation");
    expect(external).toMatchObject({
      crossWorkspace: true,
      semantics: { relationType: "FutureRelation", flow: "unknown", directionVerified: false },
    });
    expect(graph.edges.find((edge) => edge.relation.relationType === "WeakAssociation")).toMatchObject({
      selfRelation: true,
      inCycle: true,
    });
    expect(graph.cycles).toContainEqual([`${WS}:${MODEL}`, `${WS}:${REPORT}`].sort());
    expect(graph.edges.every((edge) => edge.evidenceSource === "fabric-item-relations-api-beta")).toBe(true);
  });

  it("never returns tokens, error bodies, messages or undocumented fields", async () => {
    const table = routes({
      [url(PIPELINE, "upstream")]: () => json({ message: "private upstream detail", errorCode: "Private" }, { status: 403 }),
    });
    const serialized = JSON.stringify(await collect(table).result);
    for (const forbidden of [TOKEN, "private", "message", "description", "privateField", "capacityId", "errorCode"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe("Fabric REST allowlisted query support", () => {
  it("builds only the beta flag and rejects other query keys or values", () => {
    expect(fabricApiUrl(`/v1/workspaces/${WS}/items/${MODEL}/relations/upstream`, { beta: true })).toBe(
      url(MODEL, "upstream"),
    );
    expect(fabricApiUrl(`/v1/workspaces/${WS}/items`)).toBe(`${FABRIC}/v1/workspaces/${WS}/items`);
    for (const query of [{ beta: false }, { beta: "true" }, { beta: true, $filter: "x" }, { continuationToken: "x" }]) {
      expect(() => fabricApiUrl("/v1/workspaces", query as never)).toThrow(FabricRestError);
    }
    expect(() => fabricApiUrl("/v1/workspaces?beta=true")).toThrow(FabricRestError);
  });
});

describe("workspaceCollectItemRelations pagination", () => {
  it("follows allowlisted continuations and merges pages without duplicates", async () => {
    const tokenOnly = `${url(MODEL, "upstream")}&continuationToken=page-2`;
    const viaUri = `${url(MODEL, "upstream")}&continuationToken=page-3`;
    const table = routes({
      [url(MODEL, "upstream")]: () =>
        json({ ...upstream(), continuationToken: "page-2" }),
      [tokenOnly]: () =>
        json({
          ...upstream(),
          continuationUri: `${FABRIC}/v1/workspaces/${WS}/items/${MODEL}/relations/upstream?beta=True&continuationToken=page-3`,
        }),
      [viaUri]: () =>
        json({
          items: [{ id: PIPELINE, workspaceId: WS, type: "DataPipeline", displayName: "Load" }],
          relations: [{ itemId: PIPELINE, dependentOnItemId: LAKEHOUSE, relationType: "PushData" }],
          workspaces: [],
        }),
    });
    const { result, fetchImpl } = collect(table, [MODEL]);
    const envelope = await result;
    expect(urls(fetchImpl).slice(0, 3)).toEqual([url(MODEL, "upstream"), tokenOnly, viaUri]);
    expect(envelope.queries[0].response?.items.map((item) => item.id)).toEqual([LAKEHOUSE, MODEL, PIPELINE]);
    expect(envelope.queries[0].response?.relations).toHaveLength(2);
  });

  it.each([
    ["cross-origin", `https://example.test/v1/workspaces/${WS}/items/${MODEL}/relations/upstream?beta=true&continuationToken=x`],
    ["another item", `${FABRIC}/v1/workspaces/${WS}/items/${PIPELINE}/relations/upstream?beta=true&continuationToken=x`],
    ["the other direction", `${FABRIC}/v1/workspaces/${WS}/items/${MODEL}/relations/downstream?beta=true&continuationToken=x`],
    ["an extra query key", `${url(MODEL, "upstream")}&continuationToken=x&$expand=all`],
    ["a missing beta flag", `${FABRIC}/v1/workspaces/${WS}/items/${MODEL}/relations/upstream?continuationToken=x`],
    ["a disabled beta flag", `${FABRIC}/v1/workspaces/${WS}/items/${MODEL}/relations/upstream?beta=false&continuationToken=x`],
    ["a duplicate beta flag", `${url(MODEL, "upstream")}&beta=true&continuationToken=x`],
    ["no continuation token", url(MODEL, "upstream")],
    ["credentials", `https://user:pass@api.fabric.microsoft.com/v1/workspaces/${WS}/items/${MODEL}/relations/upstream?beta=true&continuationToken=x`],
  ])("rejects a continuation to %s without following it", async (_name, continuationUri) => {
    const table = routes({
      [url(MODEL, "upstream")]: () => json({ ...upstream(), continuationUri }),
    });
    const { result, fetchImpl } = collect(table, [MODEL]);
    const envelope = await result;
    expect(query(envelope, MODEL, "upstream")).toEqual({ status: "failed", failureCode: "malformed-response" });
    expect(query(envelope, MODEL, "downstream")).toEqual({ status: "complete", failureCode: undefined });
    expect(urls(fetchImpl)).toEqual([url(MODEL, "upstream"), url(MODEL, "downstream")]);
  });

  it("detects continuation loops and bounds pages", async () => {
    const looped = `${url(MODEL, "upstream")}&continuationToken=loop`;
    const loop = await collect(
      routes({
        [url(MODEL, "upstream")]: () => json({ ...empty(), continuationToken: "loop" }),
        [looped]: () => json({ ...empty(), continuationToken: "loop" }),
      }),
      [MODEL],
    ).result;
    expect(query(loop, MODEL, "upstream")).toEqual({ status: "failed", failureCode: "malformed-response" });

    const paged: Routes = {};
    for (let page = 0; page < 4; page += 1) {
      const target = page === 0 ? url(MODEL, "upstream") : `${url(MODEL, "upstream")}&continuationToken=${page}`;
      paged[target] = () => json({ ...empty(), continuationToken: String(page + 1) });
    }
    const bounded = await collect(routes(paged), [MODEL], { limits: { maxPagesPerQuery: 2 } }).result;
    expect(query(bounded, MODEL, "upstream")).toEqual({ status: "failed", failureCode: "failed" });
  });
});

describe("workspaceCollectItemRelations malformed payloads", () => {
  it.each([
    ["a non-object body", [1, 2]],
    ["a missing relations array", { items: [], workspaces: [] }],
    ["an invalid item UUID", { ...empty(), items: [{ id: "x", workspaceId: WS, type: "Report", displayName: "x" }] }],
    ["a blank relation type", { ...empty(), relations: [{ itemId: MODEL, dependentOnItemId: REPORT, relationType: " " }] }],
    ["an overlong display name", { ...empty(), workspaces: [{ id: WS, displayName: "x".repeat(301) }] }],
    ["an overlong item type", { ...empty(), items: [{ id: REPORT, workspaceId: WS, type: "T".repeat(101), displayName: "x" }] }],
  ])("fails only the query with %s", async (_name, body) => {
    const envelope = await collect(routes({ [url(MODEL, "upstream")]: () => json(body) })).result;
    expect(query(envelope, MODEL, "upstream")).toEqual({ status: "failed", failureCode: "malformed-response" });
    expect(query(envelope, MODEL, "downstream").status).toBe("complete");
    expect(query(envelope, PIPELINE, "upstream").status).toBe("complete");
    expect(envelope.queries[0]).not.toHaveProperty("response");
    expect(() => parseItemRelationsEvidence(envelope, WS)).not.toThrow();
  });

  it("treats non-JSON bodies and oversized pages as failures", async () => {
    const nonJson = await collect(
      routes({ [url(MODEL, "upstream")]: () => new Response("<html>private</html>") }),
      [MODEL],
    ).result;
    expect(query(nonJson, MODEL, "upstream")).toEqual({ status: "failed", failureCode: "malformed-response" });

    const oversized = await collect(
      routes({ [url(MODEL, "upstream")]: () => new Response("{}", { headers: { "content-length": String(64 * 1024) } }) }),
      [MODEL],
      { limits: { maxPageBytes: 1_024 } },
    ).result;
    expect(query(oversized, MODEL, "upstream")).toEqual({ status: "failed", failureCode: "failed" });

    const tooMany = await collect(routes(), [MODEL], { limits: { maxRecordsPerCollection: 1 } }).result;
    expect(query(tooMany, MODEL, "upstream")).toEqual({ status: "failed", failureCode: "malformed-response" });
  });
});

describe("workspaceCollectItemRelations permission and throttling evidence", () => {
  it.each([
    [401, "unauthorized"],
    [403, "insufficient-privileges"],
    [404, "item-not-found"],
    [409, "failed"],
  ])("maps HTTP %s to %s and keeps other queries", async (status, failureCode) => {
    const envelope = await collect(
      routes({ [url(MODEL, "downstream")]: () => json({ errorCode: "ItemNotFound", message: "private" }, { status }) }),
    ).result;
    expect(query(envelope, MODEL, "downstream")).toEqual({ status: "failed", failureCode });
    expect(query(envelope, MODEL, "upstream").status).toBe("complete");
    expect(query(envelope, PIPELINE, "downstream").status).toBe("complete");
    expect(envelope).not.toHaveProperty("stopReason");
  });

  it("retries transient failures and keeps going after a persistent one", async () => {
    const recovered = await collect(
      routes({ [url(MODEL, "upstream")]: [() => json({}, { status: 503 }), () => json(upstream())] }),
      [MODEL],
    ).result;
    expect(query(recovered, MODEL, "upstream").status).toBe("complete");

    const transient = await collect(routes({ [url(MODEL, "upstream")]: () => json({}, { status: 503 }) })).result;
    expect(query(transient, MODEL, "upstream")).toEqual({ status: "failed", failureCode: "transient" });
    expect(query(transient, PIPELINE, "downstream").status).toBe("complete");
  });

  it("stops on persistent throttling and marks remaining queries not attempted", async () => {
    const { result, fetchImpl, sleep } = collect(
      routes({ [url(MODEL, "downstream")]: () => json({}, { status: 429, headers: { "retry-after": "120" } }) }),
    );
    const envelope = await result;
    expect(query(envelope, MODEL, "upstream").status).toBe("complete");
    expect(query(envelope, MODEL, "downstream")).toEqual({ status: "failed", failureCode: "throttled" });
    expect(query(envelope, PIPELINE, "upstream")).toEqual({ status: "failed", failureCode: "not-attempted" });
    expect(query(envelope, PIPELINE, "downstream")).toEqual({ status: "failed", failureCode: "not-attempted" });
    expect(envelope.stopReason).toBe("throttled");
    expect(sleep).not.toHaveBeenCalled();
    expect(urls(fetchImpl)).toEqual([url(MODEL, "upstream"), url(MODEL, "downstream")]);
  });

  it("rejects redirects without following them", async () => {
    const { result, fetchImpl } = collect(
      routes({ [url(MODEL, "upstream")]: () => new Response(null, { status: 302, headers: { location: "https://example.test/steal" } }) }),
      [MODEL],
    );
    expect(query(await result, MODEL, "upstream")).toEqual({ status: "failed", failureCode: "failed" });
    expect(urls(fetchImpl)).not.toContain("https://example.test/steal");
  });

  it("keeps mixed results usable by the pure graph builder", async () => {
    const envelope = await collect(routes({ [url(MODEL, "downstream")]: () => json({}, { status: 403 }) })).result;
    const graph = buildItemRelationsGraph(parseItemRelationsEvidence(envelope, WS));
    expect(graph.coverage).toEqual({ complete: 3, preserved: 0, failed: 1 });
    expect(graph.edges.map((edge) => edge.relation.relationType)).toEqual(["Datasource"]);
  });
});

describe("workspaceCollectItemRelations budgets, deadline and cancellation", () => {
  it("stops before the request budget is exceeded", async () => {
    const { result, fetchImpl } = collect(routes(), [MODEL, PIPELINE], { limits: { maxRequests: 1 } });
    const envelope = await result;
    expect(query(envelope, MODEL, "upstream").status).toBe("complete");
    expect(envelope.queries.slice(1).map((entry) => entry.failureCode)).toEqual([
      "not-attempted", "not-attempted", "not-attempted",
    ]);
    expect(envelope.stopReason).toBe("request-budget-exhausted");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("marks an in-flight query not attempted when a retry would exceed the request budget", async () => {
    const envelope = await collect(
      routes({ [url(MODEL, "upstream")]: () => json({}, { status: 503, headers: { "retry-after": "0" } }) }),
      [MODEL],
      { limits: { maxRequests: 1 } },
    ).result;
    expect(query(envelope, MODEL, "upstream")).toEqual({ status: "failed", failureCode: "not-attempted" });
    expect(query(envelope, MODEL, "downstream")).toEqual({ status: "failed", failureCode: "not-attempted" });
    expect(envelope.stopReason).toBe("request-budget-exhausted");
  });

  it("stops starting queries near the execution deadline", async () => {
    let now = 0;
    const table = routes({
      [url(MODEL, "upstream")]: () => {
        now += 146_000;
        return json(upstream());
      },
    });
    const { result, fetchImpl } = collect(table, [MODEL], { now: () => now });
    const envelope = await result;
    expect(query(envelope, MODEL, "upstream").status).toBe("complete");
    expect(query(envelope, MODEL, "downstream")).toEqual({ status: "failed", failureCode: "not-attempted" });
    expect(envelope.stopReason).toBe("deadline-exhausted");
    expect(urls(fetchImpl)).toEqual([url(MODEL, "upstream")]);
  });

  it("cancels an in-flight query without retrying", async () => {
    const controller = new AbortController();
    const table = routes({
      [url(MODEL, "upstream")]: (init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          controller.abort();
        }),
    });
    const { result, fetchImpl } = collect(table, [MODEL], { signal: controller.signal });
    const envelope = await result;
    expect(envelope.queries.map((entry) => entry.failureCode)).toEqual(["not-attempted", "not-attempted"]);
    expect(envelope.stopReason).toBe("cancelled");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not send any request after cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const { result, fetchImpl } = collect(routes(), [MODEL], { signal: controller.signal });
    const envelope = await result;
    expect(envelope.queries.every((entry) => entry.failureCode === "not-attempted")).toBe(true);
    expect(envelope.stopReason).toBe("cancelled");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("stops before the aggregate evidence budget is exceeded", async () => {
    const envelope = await collect(routes(), [MODEL, PIPELINE], { limits: { maxEvidenceBytes: 700 } }).result;
    expect(query(envelope, MODEL, "upstream").status).toBe("complete");
    expect(query(envelope, MODEL, "downstream")).toEqual({ status: "failed", failureCode: "failed" });
    expect(query(envelope, PIPELINE, "upstream")).toEqual({ status: "failed", failureCode: "not-attempted" });
    expect(envelope.stopReason).toBe("evidence-budget-exhausted");
  });

  it("lets the pure merge preserve prior evidence for queries that were not attempted", async () => {
    const previous = parseItemRelationsEvidence(await collect(routes(), [MODEL]).result, WS);
    const controller = new AbortController();
    controller.abort();
    const next = parseItemRelationsEvidence(
      await collect(routes(), [MODEL], {
        signal: controller.signal,
        wallClock: () => Date.parse("2026-10-02T12:00:00.000Z"),
      }).result,
      WS,
    );
    const merged = mergeItemRelationsEvidence(previous, next);
    expect(merged.queries.map((entry) => [entry.status, entry.failureCode, entry.observedAt])).toEqual([
      ["failed", "not-attempted", ATTEMPTED_AT],
      ["failed", "not-attempted", ATTEMPTED_AT],
    ]);
    expect(buildItemRelationsGraph(merged).coverage).toEqual({ complete: 0, preserved: 2, failed: 0 });
  });
});
