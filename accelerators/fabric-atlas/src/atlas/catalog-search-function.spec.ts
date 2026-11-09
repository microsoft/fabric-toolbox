// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  CATALOG_SEARCH_FILTER_TYPES,
  CATALOG_SEARCH_LIMITS,
  catalogSearchFilter,
  catalogSearchRequestBody,
  runCatalogSearch,
  sanitizeCatalogEntry,
  searchCatalogPreview,
  validateCatalogSearchInput,
  type CatalogSearchDependencies,
  type CatalogSearchEnvelope,
  type CatalogSearchRequest,
} from "../../rayfin/functions/src/catalog-search";
import { SYNCHRONIZER_AUTHORITY_ID } from "../../rayfin/functions/src/synchronizer-gate";
import type { AppFunctionsSchema } from "../../rayfin/functions/src/types";

const WS = "11111111-1111-4111-8111-111111111111";
const OTHER_WS = "22222222-2222-4222-8222-222222222222";
const REPORT = "33333333-3333-4333-8333-333333333333";
const LAKEHOUSE = "44444444-4444-4444-8444-444444444444";
const MODEL = "55555555-5555-4555-8555-555555555555";
const TOKEN = "fixture-fabric-token";
const SEARCH_URL = "https://api.fabric.microsoft.com/v1/catalog/search";
const SEARCHED_AT = "2026-10-02T12:00:00.000Z";

type SearchContext = Parameters<typeof searchCatalogPreview>[0];
type Handler = (body: Record<string, unknown>) => Response;

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function item(id: string, displayName: string, type = "Report", workspaceId = WS) {
  return {
    id,
    type,
    catalogEntryType: "FabricItem",
    displayName,
    description: `${displayName} description`,
    hierarchy: { workspace: { id: workspaceId, displayName: "Sales Analytics" } },
  };
}

/** Serves pages keyed by the continuation token in the JSON body; "" is the first page. */
function catalogFetch(handlers: Record<string, Handler | Handler[]>) {
  const calls = new Map<string, number>();
  return vi.fn<typeof fetch>(async (input, init) => {
    expect(String(input)).toBe(SEARCH_URL);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const key = typeof body.continuationToken === "string" ? body.continuationToken : "";
    const route = handlers[key];
    if (!route) throw new Error(`Unexpected continuation ${key}`);
    const count = calls.get(key) ?? 0;
    calls.set(key, count + 1);
    const handler = Array.isArray(route) ? route[Math.min(count, route.length - 1)] : route;
    return handler(body);
  });
}

const FIRST_REQUEST: CatalogSearchRequest = {
  search: "sales",
  itemTypes: [],
  workspaceIds: [],
  pageSize: 25,
  continuationToken: null,
};

function search(
  handlers: Record<string, Handler | Handler[]>,
  request: CatalogSearchRequest = FIRST_REQUEST,
  options: Omit<CatalogSearchDependencies, "fetch"> = {},
) {
  const fetchImpl = catalogFetch(handlers);
  const sleep = options.sleep ?? vi.fn(async () => undefined);
  const result = runCatalogSearch(TOKEN, request, {
    wallClock: () => Date.parse(SEARCHED_AT),
    ...options,
    fetch: fetchImpl,
    sleep,
  });
  return { result, fetchImpl, sleep };
}

function bodies(fetchImpl: ReturnType<typeof catalogFetch>) {
  return fetchImpl.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
}

function context(
  findById: () => Promise<unknown>,
  token: () => string = () => TOKEN,
): SearchContext {
  return {
    getDataClient: () => ({
      SynchronizerAuthority: { findById, create: vi.fn().mockRejectedValue(new Error("denied")) },
    }),
    Tokens: {
      get Fabric() {
        return token();
      },
    },
  } as unknown as SearchContext;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("searchCatalogPreview contract", () => {
  it("binds only the Fabric audience with strict named input aliases", () => {
    const metadata = JSON.parse(
      readFileSync(resolve("rayfin", "functions", "runtimemetadata.json"), "utf8"),
    ) as { functions: { functionName: string; contextAudiences: string[]; delegateParameters: Record<string, unknown>[] }[] };
    const fn = metadata.functions.find((candidate) => candidate.functionName === "searchCatalogPreview");
    expect(fn?.contextAudiences).toEqual(["Fabric"]);
    expect(fn?.delegateParameters).toEqual([
      expect.objectContaining({ name: "ctx", type: "RayfinContext<AtlasSchema, AudienceType.Fabric>" }),
      expect.objectContaining({ name: "protocolVersion", type: "1" }),
      expect.objectContaining({ name: "search", type: "CatalogSearchTextInput | null", hasDefault: false }),
      expect.objectContaining({ name: "itemTypes", type: "CatalogSearchItemTypesInput", hasDefault: false }),
      expect.objectContaining({ name: "workspaceIds", type: "CatalogSearchWorkspaceIdsInput", hasDefault: false }),
      expect.objectContaining({ name: "pageSize", type: "CatalogSearchPageSizeInput | null", hasDefault: false }),
      expect.objectContaining({ name: "continuationToken", type: "CatalogSearchContinuationInput | null", hasDefault: false }),
    ]);
  });

  it("generates exact client input and output types", () => {
    expectTypeOf<AppFunctionsSchema["searchCatalogPreview"]["input"]>().toEqualTypeOf<{
      protocolVersion: 1;
      search: string | null;
      itemTypes: string[];
      workspaceIds: string[];
      pageSize: number | null;
      continuationToken: string | null;
    }>();
    expectTypeOf<AppFunctionsSchema["searchCatalogPreview"]["output"]>()
      .toEqualTypeOf<CatalogSearchEnvelope>();
  });
});

describe("searchCatalogPreview input validation", () => {
  it("normalizes a first-page request", () => {
    expect(
      validateCatalogSearchInput(1, "  monthly   sales ", ["Report", "Workspace"], [WS.toUpperCase()], null, null),
    ).toEqual({
      search: "monthly sales",
      itemTypes: ["Report", "Workspace"],
      workspaceIds: [WS],
      pageSize: null,
      continuationToken: null,
    });
  });

  it("accepts a continuation token only on its own", () => {
    expect(validateCatalogSearchInput(1, null, [], [], null, "eyJza2lwIjozfQ==")).toMatchObject({
      search: null,
      continuationToken: "eyJza2lwIjozfQ==",
    });
  });

  it.each([
    ["string protocol", "1", "sales", [], [], null, null],
    ["missing search", 1, null, [], [], null, null],
    ["blank search", 1, "   ", [], [], null, null],
    ["operator-only search", 1, "*", [], [], null, null],
    ["oversized search", 1, "a".repeat(201), [], [], null, null],
    ["control character", 1, "sales\u0000", [], [], null, null],
    ["bidi override", 1, "sales\u202Ereport", [], [], null, null],
    ["unknown item type", 1, "sales", ["Report' or Type ne '"], [], null, null],
    ["duplicate item type", 1, "sales", ["Report", "Report"], [], null, null],
    ["non-array item types", 1, "sales", "Report", [], null, null],
    ["non-UUID workspace", 1, "sales", [], ["not-a-workspace"], null, null],
    ["too many workspaces", 1, "sales", [], Array.from({ length: 13 }, (_, index) => `${String(index % 9 + 1).repeat(8)}-1111-4111-8111-${String(index).padStart(12, "0")}`), null, null],
    ["zero page size", 1, "sales", [], [], 0, null],
    ["oversized page size", 1, "sales", [], [], 51, null],
    ["fractional page size", 1, "sales", [], [], 1.5, null],
    ["string page size", 1, "sales", [], [], "25", null],
    ["token with search", 1, "sales", [], [], null, "token"],
    ["token with filter", 1, null, ["Report"], [], null, "token"],
    ["token with page size", 1, null, [], [], 25, "token"],
    ["token with whitespace", 1, null, [], [], null, "token value"],
    ["oversized token", 1, null, [], [], null, "t".repeat(4_097)],
  ])("rejects %s", (_label, protocolVersion, text, types, workspaces, pageSize, token) => {
    expect(() => validateCatalogSearchInput(protocolVersion, text, types, workspaces, pageSize, token)).toThrow();
  });

  it("builds the documented filter from allowlisted values only", () => {
    expect(catalogSearchFilter(["Report", "Lakehouse"], [WS, OTHER_WS])).toBe(
      `(Type eq 'Report' or Type eq 'Lakehouse') and (WorkspaceId eq '${WS}' or WorkspaceId eq '${OTHER_WS}')`,
    );
    expect(catalogSearchFilter([], [])).toBeUndefined();
    expect(CATALOG_SEARCH_FILTER_TYPES).toContain("Workspace");
  });

  it("sends a continuation token alone, as the API requires", () => {
    expect(catalogSearchRequestBody({ ...FIRST_REQUEST, pageSize: null })).toEqual({ search: "sales", pageSize: 25 });
    expect(
      catalogSearchRequestBody({ search: null, itemTypes: [], workspaceIds: [], pageSize: null, continuationToken: "t1" }),
    ).toEqual({ continuationToken: "t1" });
  });
});

describe("searchCatalogPreview collection", () => {
  it("POSTs only to the fixed endpoint with a JSON body and the application token", async () => {
    const { result, fetchImpl } = search({ "": () => json({ value: [item(REPORT, "Monthly Sales")] }) }, {
      ...FIRST_REQUEST,
      itemTypes: ["Report"],
      workspaceIds: [WS],
    });
    const envelope = await result;
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(SEARCH_URL);
    expect(init).toMatchObject({ method: "POST", redirect: "manual" });
    expect(init?.headers).toMatchObject({
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    });
    expect(bodies(fetchImpl)[0]).toEqual({
      search: "sales",
      pageSize: 25,
      filter: `(Type eq 'Report') and (WorkspaceId eq '${WS}')`,
    });
    expect(envelope).toMatchObject({
      source: "onelake-catalog-search",
      apiVersion: "v1-preview",
      authoritative: false,
      identity: "fabric-application",
      status: "complete",
      retryable: false,
      continuationToken: null,
      scope: { search: "sales", itemTypes: ["Report"], workspaceIds: [WS], pageSize: 25, continued: false },
    });
    expect(JSON.stringify(envelope)).not.toContain(TOKEN);
  });

  it("returns allowlisted metadata only with stable keys and source coverage", async () => {
    const longDescription = "d".repeat(900);
    const { result } = search({
      "": () =>
        json({
          value: [
            { ...item(REPORT.toUpperCase(), "Monthly Sales"), rows: [{ revenue: 42 }], data: "business row" },
            { ...item(LAKEHOUSE, "Sales Lakehouse", "Lakehouse", OTHER_WS), description: longDescription },
            item(MODEL, "Future Sales Thing", "FutureFabricThing"),
            { id: WS, type: "Workspace", catalogEntryType: "Workspace", displayName: "Sales Analytics" },
            item(REPORT, "Duplicate report"),
            { id: "not-a-uuid", type: "Report", catalogEntryType: "FabricItem", displayName: "Broken" },
            { ...item(MODEL, "Bad hierarchy"), hierarchy: { workspace: { id: "bad" } } },
            "not an object",
          ],
        }),
    });
    const envelope = await result;
    expect(envelope.entries).toEqual([
      {
        key: `item:${REPORT}`,
        id: REPORT,
        catalogEntryType: "FabricItem",
        type: "Report",
        displayName: "Monthly Sales",
        description: "Monthly Sales description",
        workspaceId: WS,
        workspaceDisplayName: "Sales Analytics",
      },
      expect.objectContaining({ key: `item:${LAKEHOUSE}`, workspaceId: OTHER_WS, description: expect.stringMatching(/…$/) }),
      expect.objectContaining({ key: `item:${MODEL}`, type: "FutureFabricThing" }),
      {
        key: `workspace:${WS}`,
        id: WS,
        catalogEntryType: "Workspace",
        type: "Workspace",
        displayName: "Sales Analytics",
        workspaceId: WS,
        workspaceDisplayName: "Sales Analytics",
      },
    ]);
    expect(envelope.entries[1].description).toHaveLength(500);
    expect(JSON.stringify(envelope)).not.toMatch(/business row|revenue/);
    expect(envelope.coverage).toEqual({
      pagesFetched: 1,
      entriesReceived: 8,
      entriesReturned: 4,
      entriesSkipped: 3,
      duplicatesDropped: 1,
      descriptionsTruncated: 1,
      moreAvailable: false,
    });
  });

  it("bounds pages per invocation and returns the next continuation token", async () => {
    const page = (index: number) => () =>
      json({
        value: [item(`${String(index + 1).repeat(8)}-1111-4111-8111-111111111111`, `Sales ${index}`)],
        continuationToken: `t${index + 1}`,
      });
    const { result, fetchImpl } = search({
      "": page(0),
      t1: page(1),
      t2: page(2),
      t3: page(3),
      t4: page(4),
    });
    const envelope = await result;
    expect(fetchImpl).toHaveBeenCalledTimes(CATALOG_SEARCH_LIMITS.maxPages);
    expect(bodies(fetchImpl).slice(1)).toEqual([
      { continuationToken: "t1" },
      { continuationToken: "t2" },
      { continuationToken: "t3" },
    ]);
    expect(envelope).toMatchObject({
      status: "complete",
      continuationToken: "t4",
      coverage: { pagesFetched: 4, entriesReturned: 4, moreAvailable: true, stopReason: "page-limit" },
    });
  });

  it("resumes from a caller continuation token", async () => {
    const { result, fetchImpl } = search(
      { t9: () => json({ value: [item(REPORT, "Later sales")] }) },
      { search: null, itemTypes: [], workspaceIds: [], pageSize: null, continuationToken: "t9" },
    );
    const envelope = await result;
    expect(bodies(fetchImpl)).toEqual([{ continuationToken: "t9" }]);
    expect(envelope).toMatchObject({ status: "complete", scope: { continued: true }, continuationToken: null });
  });

  it("stops at the result bound without a lossy continuation", async () => {
    const { result } = search(
      {
        "": () =>
          json({
            value: [item(REPORT, "A"), item(LAKEHOUSE, "B"), item(MODEL, "C")],
            continuationToken: "t1",
          }),
      },
      FIRST_REQUEST,
      { limits: { maxResults: 2 } },
    );
    const envelope = await result;
    expect(envelope.entries.map((entry) => entry.id)).toEqual([REPORT, LAKEHOUSE]);
    expect(envelope).toMatchObject({
      status: "complete",
      continuationToken: null,
      coverage: { moreAvailable: false, stopReason: "result-limit" },
    });
  });

  it("stops between pages before the deadline and keeps the continuation", async () => {
    let clock = 0;
    const { result, fetchImpl } = search(
      {
        "": () => {
          clock = CATALOG_SEARCH_LIMITS.executionBudgetMs - 1_000;
          return json({ value: [item(REPORT, "Sales")], continuationToken: "t1" });
        },
      },
      FIRST_REQUEST,
      { now: () => clock },
    );
    const envelope = await result;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(envelope).toMatchObject({
      status: "complete",
      continuationToken: "t1",
      coverage: { moreAvailable: true, stopReason: "deadline-exhausted" },
    });
  });

  it.each([
    [401, "permission-denied", false],
    [403, "permission-denied", false],
    [400, "rejected-request", false],
    [404, "unavailable", false],
  ] as const)("maps HTTP %s to %s without reading the error body", async (status, code, retryable) => {
    const { result, fetchImpl } = search({
      "": () => json({ errorCode: "Secret detail", message: "token=abc" }, { status }),
    });
    const envelope = await result;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(envelope).toMatchObject({ status: "failed", failureCode: code, retryable, entries: [], continuationToken: null });
    expect(JSON.stringify(envelope)).not.toMatch(/Secret detail|token=abc/);
  });

  it("retries a bounded Retry-After and then succeeds", async () => {
    const { result, fetchImpl, sleep } = search({
      "": [
        () => json({}, { status: 429, headers: { "retry-after": "1" } }),
        () => json({ value: [item(REPORT, "Sales")] }),
      ],
    });
    const envelope = await result;
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1_000);
    expect(envelope.status).toBe("complete");
  });

  it("does not wait for a Retry-After beyond its bound", async () => {
    const { result, fetchImpl, sleep } = search({
      "": () => json({}, { status: 429, headers: { "retry-after": "30" } }),
    });
    const envelope = await result;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(envelope).toMatchObject({ status: "failed", failureCode: "throttled", retryable: true });
  });

  it("caps transient retries at the attempt bound", async () => {
    const { result, fetchImpl } = search({ "": () => json({}, { status: 503 }) });
    const envelope = await result;
    expect(fetchImpl).toHaveBeenCalledTimes(CATALOG_SEARCH_LIMITS.maxAttempts);
    expect(envelope).toMatchObject({ status: "failed", failureCode: "unavailable", retryable: true });
  });

  it("keeps earlier pages and the failed page token on a retryable partial failure", async () => {
    const { result } = search({
      "": () => json({ value: [item(REPORT, "Sales")], continuationToken: "t1" }),
      t1: () => json({}, { status: 503 }),
    });
    const envelope = await result;
    expect(envelope).toMatchObject({
      status: "partial",
      failureCode: "unavailable",
      retryable: true,
      continuationToken: "t1",
      coverage: { pagesFetched: 1, entriesReturned: 1, moreAvailable: true, stopReason: "failure" },
    });
  });

  it.each([
    ["a non-array value", () => json({ value: { id: REPORT } })],
    ["an oversized page", () => json({ value: Array.from({ length: CATALOG_SEARCH_LIMITS.maxEntriesPerPage + 1 }, () => item(REPORT, "Sales")) })],
    ["an unsafe continuation token", () => json({ value: [], continuationToken: "bad token" })],
    ["invalid JSON", () => new Response("not json", { status: 200 })],
  ])("rejects %s as malformed", async (_label, handler) => {
    const { result } = search({ "": handler });
    await expect(result).resolves.toMatchObject({ status: "failed", failureCode: "malformed-response", retryable: false });
  });

  it("rejects a repeated continuation token", async () => {
    const { result, fetchImpl } = search({
      "": () => json({ value: [item(REPORT, "Sales")], continuationToken: "t1" }),
      t1: () => json({ value: [item(LAKEHOUSE, "More sales")], continuationToken: "t1" }),
    });
    const envelope = await result;
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(envelope).toMatchObject({ status: "partial", failureCode: "malformed-response", continuationToken: null });
  });

  it("bounds the response size before parsing", async () => {
    const { result } = search({
      "": () => json({ value: [] }, { headers: { "content-length": String(CATALOG_SEARCH_LIMITS.maxPageBytes + 1) } }),
    });
    await expect(result).resolves.toMatchObject({ status: "failed", failureCode: "response-too-large" });
  });

  it("reports an empty result as complete, never as absence evidence", async () => {
    const { result } = search({ "": () => json({ value: [] }) });
    await expect(result).resolves.toMatchObject({
      status: "complete",
      authoritative: false,
      entries: [],
      coverage: { pagesFetched: 1, entriesReceived: 0, moreAvailable: false },
    });
  });

  it("drops entries without the documented identity fields", () => {
    expect(sanitizeCatalogEntry({ id: REPORT, type: "Report", catalogEntryType: "FabricItem" })).toBeUndefined();
    expect(sanitizeCatalogEntry({ ...item(REPORT, "Sales"), type: "Report<script>" })).toBeUndefined();
    expect(sanitizeCatalogEntry({ ...item(REPORT, "Sales\u202E") })).toBeUndefined();
    expect(sanitizeCatalogEntry({ ...item(REPORT, "Sales"), type: "Publisher..Item" })).toBeUndefined();
  });

  it("keeps dotted Workload Hub item types observed in a real tenant", () => {
    expect(
      sanitizeCatalogEntry(item(REPORT, "Process solution", "Microsoft.WaaS.BusinessProcessSolutions"))?.entry.type,
    ).toBe("Microsoft.WaaS.BusinessProcessSolutions");
  });
});

describe("searchCatalogPreview authorization", () => {
  it("returns not-authorized before reading the application token", async () => {
    const token = vi.fn(() => TOKEN);
    const fetchImpl = vi.fn<typeof fetch>();
    const envelope = await searchCatalogPreview(
      context(async () => null, token),
      1, "sales", [], [], null, null,
      { fetch: fetchImpl, wallClock: () => Date.parse(SEARCHED_AT) },
    );
    expect(envelope).toMatchObject({ status: "failed", failureCode: "not-authorized", retryable: false });
    expect(token).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects invalid input before the authority gate", async () => {
    const findById = vi.fn(async () => ({ id: SYNCHRONIZER_AUTHORITY_ID, createdAt: new Date() }));
    const envelope = await searchCatalogPreview(context(findById), 1, "sales", [], [], null, "token");
    expect(envelope).toMatchObject({ status: "failed", failureCode: "invalid-input" });
    expect(envelope.scope).toBeUndefined();
    expect(findById).not.toHaveBeenCalled();
  });

  it("reports an unavailable application token honestly", async () => {
    const envelope = await searchCatalogPreview(
      context(
        async () => ({ id: SYNCHRONIZER_AUTHORITY_ID, createdAt: new Date() }),
        () => {
          throw new Error("no token");
        },
      ),
      1, "sales", [], [], null, null,
    );
    expect(envelope).toMatchObject({ status: "failed", failureCode: "token-unavailable" });
  });

  it("searches as the synchronizer with the Fabric application token", async () => {
    const fetchImpl = catalogFetch({ "": () => json({ value: [item(REPORT, "Sales")] }) });
    const envelope = await searchCatalogPreview(
      context(async () => ({ id: SYNCHRONIZER_AUTHORITY_ID, createdAt: new Date() })),
      1, "sales", ["Report"], [], 10, null,
      { fetch: fetchImpl },
    );
    expect(envelope.status).toBe("complete");
    expect(bodies(fetchImpl)[0]).toEqual({ search: "sales", pageSize: 10, filter: "(Type eq 'Report')" });
  });
});
