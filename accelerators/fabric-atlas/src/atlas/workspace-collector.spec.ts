// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { AppFunctionsSchema } from "../../rayfin/functions/src/types";
import {
  collectWorkspaceCore,
  validateCollectCoreInput,
  workspaceCollectCore,
  type CollectCoreDependencies,
  type CollectCoreLimits,
  type WorkspaceCoreEnvelope,
} from "../../rayfin/functions/src/workspace-collector";
import { SYNCHRONIZER_AUTHORITY_ID } from "../../rayfin/functions/src/synchronizer-gate";
import {
  CORE_EXCLUDED_CAPABILITIES,
  CORE_EXCLUDED_SECTIONS,
  compareCoreCollectorParity,
  validateCoreCollectorEnvelope,
} from "./core-collector-parity";
import { validateRawSync } from "./live-sync";

const WS = "11111111-1111-4111-8111-111111111111";
const NOTEBOOK = "22222222-2222-4222-8222-222222222222";
const REPORT = "33333333-3333-4333-8333-333333333333";
const FUTURE = "44444444-4444-4444-8444-444444444444";
const CAPACITY = "55555555-5555-4555-8555-555555555555";
const USER = "66666666-6666-4666-8666-666666666666";
const GROUP = "77777777-7777-4777-8777-777777777777";
const CORRELATION = "88888888-8888-4888-8888-888888888888";
const FOLDER = "99999999-9999-4999-8999-999999999999";
const OTHER_WS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TOKEN = "fixture-fabric-token";
const BASE = `https://api.fabric.microsoft.com/v1/workspaces/${WS}`;
const JOBS = (itemId: string) => `${BASE}/items/${itemId}/jobs/instances`;

type CollectContext = Parameters<typeof workspaceCollectCore>[0];
type Handler = () => Response | Promise<Response>;
type Routes = Record<string, Handler | Handler[]>;

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function workspaceBody() {
  return {
    id: WS.toUpperCase(),
    displayName: "Atlas Fixture",
    description: "private workspace description",
    type: "Workspace",
    capacityId: CAPACITY.toUpperCase(),
    capacityRegion: "West Europe",
    workspaceIdentity: { applicationId: "private-identity" },
  };
}

function itemsPage1() {
  return {
    value: [
      {
        id: NOTEBOOK.toUpperCase(),
        type: "Notebook",
        displayName: "Load sales",
        description: "private item description",
        workspaceId: WS,
        folderId: FOLDER,
      },
      {
        id: REPORT,
        type: "Report",
        displayName: "Sales",
        workspaceId: WS,
        sensitivityLabel: { id: "private-label" },
      },
    ],
    continuationUri: `${BASE}/items?continuationToken=page-2`,
    continuationToken: "page-2",
  };
}

function itemsPage2() {
  return {
    value: [{ id: FUTURE, type: "FutureFabricThing", displayName: "Preview item" }],
  };
}

function roleAssignmentsBody() {
  return {
    value: [
      {
        id: "assignment-1",
        role: "Admin",
        principal: {
          id: USER.toUpperCase(),
          displayName: "Ada",
          type: "User",
          userDetails: { userPrincipalName: "ada@contoso.test", objectId: "private" },
        },
      },
      {
        role: "Viewer",
        principal: {
          id: GROUP,
          displayName: "Readers",
          type: "Group",
          groupDetails: { groupType: "SecurityGroup", email: "private@contoso.test" },
        },
      },
      {
        role: "Member",
        principal: {
          displayName: "Automation",
          type: "ServicePrincipal",
          servicePrincipalDetails: { aadAppId: "private-app" },
        },
      },
    ],
  };
}

function notebookJobs() {
  return {
    value: [
      {
        id: "job-1",
        itemId: NOTEBOOK,
        jobType: "RunNotebook",
        invokeType: "Manual",
        status: "Completed",
        startTimeUtc: "2026-09-30T10:00:00.1234567",
        endTimeUtc: "2026-09-30T10:05:00Z",
        rootActivityId: "private-activity",
        failureReason: null,
      },
      {
        id: "job-2",
        jobType: "RunNotebook",
        invokeType: "Scheduled",
        status: "Failed",
        startTimeUtc: "2026-09-29T10:00:00+02:00",
        failureReason: { message: "private failure detail" },
      },
      { id: "job-3", invokeType: "Scheduled", status: "InProgress" },
      { id: "job-4", jobType: "RunNotebook", status: "Completed" },
    ],
  };
}

function coreRoutes(): Routes {
  return {
    [BASE]: () => json(workspaceBody()),
    [`${BASE}/items`]: () => json(itemsPage1()),
    [`${BASE}/items?continuationToken=page-2`]: () => json(itemsPage2()),
    [`${BASE}/roleAssignments`]: () => json(roleAssignmentsBody()),
    [JOBS(NOTEBOOK)]: () => json(notebookJobs()),
    [JOBS(REPORT)]: () =>
      json(
        { errorCode: "EntityNotFound", message: "private 404 detail" },
        { status: 404 },
      ),
    [JOBS(FUTURE)]: () => json({ value: [] }),
  };
}

function fabricFetch(routes: Routes) {
  const calls = new Map<string, number>();
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    const route = routes[url];
    if (!route) throw new Error(`Unexpected fixture URL ${url}`);
    const count = calls.get(url) ?? 0;
    calls.set(url, count + 1);
    const handler = Array.isArray(route)
      ? route[Math.min(count, route.length - 1)]
      : route;
    return handler();
  });
}

function requestedUrls(fetchImpl: ReturnType<typeof fabricFetch>): string[] {
  return fetchImpl.mock.calls.map(([input]) => String(input));
}

function collect(
  routes: Routes,
  options: Omit<CollectCoreDependencies, "fetch" | "limits"> & {
    limits?: Partial<CollectCoreLimits>;
    correlationId?: string | null;
  } = {},
) {
  const fetchImpl = fabricFetch(routes);
  const sleep = options.sleep ?? vi.fn(async () => undefined);
  const result = collectWorkspaceCore(
    TOKEN,
    { workspaceId: WS, correlationId: options.correlationId ?? null },
    { fetch: fetchImpl, sleep, now: options.now, limits: options.limits },
  );
  return { result, fetchImpl, sleep };
}

function context(
  findById: () => Promise<{ id: string; createdAt: Date } | null> = async () => ({
    id: SYNCHRONIZER_AUTHORITY_ID,
    createdAt: new Date(),
  }),
  token: () => string = () => TOKEN,
  create: () => Promise<{ id: string; createdAt: Date }> = async () => ({
    id: SYNCHRONIZER_AUTHORITY_ID,
    createdAt: new Date(),
  }),
): CollectContext {
  return {
    getDataClient: () => ({
      SynchronizerAuthority: { findById, create },
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

describe("workspaceCollectCore contract", () => {
  it("binds the Fabric audience with a flat, typegen-safe signature", () => {
    const metadata = JSON.parse(
      readFileSync(resolve("rayfin", "functions", "runtimemetadata.json"), "utf8"),
    ) as {
      functions: {
        functionName: string;
        contextAudiences: string[];
        delegateParameters: Record<string, unknown>[];
      }[];
    };
    const fn = metadata.functions.find(
      (candidate) => candidate.functionName === "workspaceCollectCore",
    );
    expect(fn?.contextAudiences).toEqual(["Fabric"]);
    expect(fn?.delegateParameters).toEqual([
      expect.objectContaining({
        name: "ctx",
        type: "RayfinContext<AtlasSchema, AudienceType.Fabric>",
      }),
      expect.objectContaining({ name: "protocolVersion", type: "1", optional: false }),
      expect.objectContaining({ name: "workspaceId", type: "SyncUuidInput", optional: false }),
      expect.objectContaining({
        name: "correlationId",
        type: "SyncUuidInput | null",
        optional: false,
        hasDefault: true,
      }),
    ]);
  });

  it("generates exact client types without token, URL or body inputs", () => {
    expectTypeOf<AppFunctionsSchema["workspaceCollectCore"]["input"]>().toEqualTypeOf<{
      protocolVersion: 1;
      workspaceId: string;
      correlationId: string | null;
    }>();
    expectTypeOf<AppFunctionsSchema["workspaceCollectCore"]["output"]>()
      .toEqualTypeOf<WorkspaceCoreEnvelope>();
  });
});

describe("workspaceCollectCore input validation", () => {
  it("accepts protocol 1 with strict UUIDs and normalizes their case", () => {
    expect(validateCollectCoreInput(1, WS.toUpperCase(), null)).toEqual({
      workspaceId: WS,
      correlationId: null,
    });
    expect(validateCollectCoreInput(1, WS, undefined)).toEqual({
      workspaceId: WS,
      correlationId: null,
    });
    expect(validateCollectCoreInput(1, WS, CORRELATION.toUpperCase())).toEqual({
      workspaceId: WS,
      correlationId: CORRELATION,
    });
  });

  it.each([
    ["string protocol", "1", WS, null],
    ["future protocol", 2, WS, null],
    ["padded workspace", 1, ` ${WS}`, null],
    ["nil workspace", 1, "00000000-0000-0000-0000-000000000000", null],
    ["non-RFC workspace", 1, "11111111-1111-1111-1111-111111111111", null],
    ["workspace URL", 1, `https://api.fabric.microsoft.com/v1/workspaces/${WS}`, null],
    ["workspace object", 1, { id: WS }, null],
    ["empty correlation", 1, WS, ""],
    ["numeric correlation", 1, WS, 42],
    ["token correlation", 1, WS, `Bearer ${TOKEN}`],
  ])("rejects %s with a fixed message", (_name, protocolVersion, workspaceId, correlationId) => {
    let message = "";
    try {
      validateCollectCoreInput(protocolVersion, workspaceId, correlationId);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe(
      "Use protocolVersion 1, a strict workspace UUID and a strict correlation UUID or null.",
    );
  });
});

describe("workspaceCollectCore authorization", () => {
  it("fails closed for ordinary app users before reading the token or calling Fabric", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const findById = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockRejectedValue(new Error("forbidden by policy"));
    const token = vi.fn(() => TOKEN);
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      workspaceCollectCore(
        context(findById, token, create),
        1,
        WS,
        null,
        { fetch: fetchImpl },
      ),
    ).rejects.toThrow("Workspace collection requires the configured Atlas administrator.");
    expect(findById).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledOnce();
    expect(token).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("validates input before the caller gate", async () => {
    const findById = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      workspaceCollectCore(context(findById), 1, "not-a-uuid", null, { fetch: fetchImpl }),
    ).rejects.toThrow("strict workspace UUID");
    expect(findById).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns a fixed error when the declared Fabric token is unavailable", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const failure = workspaceCollectCore(
      context(
        undefined,
        () => {
          throw new Error(`token binding failed for ${TOKEN}`);
        },
      ),
      1,
      WS,
      null,
      { fetch: fetchImpl },
    );
    await expect(failure).rejects.toThrow("The Fabric application token was unavailable.");
    await expect(failure).rejects.not.toThrow(TOKEN);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("runs the synchronizer gate before any Fabric request", async () => {
    const order: string[] = [];
    const findById = vi.fn(async () => {
      order.push("gate");
      return {
        id: SYNCHRONIZER_AUTHORITY_ID,
        createdAt: new Date(),
      };
    });
    const routes = coreRoutes();
    const fetchImpl = fabricFetch(routes);
    fetchImpl.mockImplementationOnce(async () => {
      order.push("fabric");
      return (routes[BASE] as Handler)();
    });

    const envelope = await workspaceCollectCore(context(findById), 1, WS, CORRELATION, {
      fetch: fetchImpl,
      sleep: async () => undefined,
    });

    expect(order.slice(0, 2)).toEqual(["gate", "fabric"]);
    expect(envelope.correlationId).toBe(CORRELATION);
    expect(envelope.sections.workspace).toEqual({ status: "complete" });
  });
});

describe("workspaceCollectCore collection", () => {
  it("returns the sanitized Fabric Core base envelope without advanced claims", async () => {
    const { result, fetchImpl } = collect(coreRoutes(), { correlationId: CORRELATION });
    const envelope = await result;

    expect(envelope).toEqual({
      schemaVersion: 2,
      syncMode: "base",
      correlationId: CORRELATION,
      workspace: {
        id: WS,
        displayName: "Atlas Fixture",
        type: "Workspace",
        capacityId: CAPACITY,
        capacityRegion: "West Europe",
      },
      items: [
        {
          id: NOTEBOOK,
          type: "Notebook",
          displayName: "Load sales",
          workspaceId: WS,
          folderId: FOLDER,
        },
        { id: REPORT, type: "Report", displayName: "Sales", workspaceId: WS },
        { id: FUTURE, type: "FutureFabricThing", displayName: "Preview item" },
      ],
      roleAssignments: [
        {
          role: "Admin",
          principal: {
            id: USER,
            displayName: "Ada",
            type: "User",
            userDetails: { userPrincipalName: "ada@contoso.test" },
          },
        },
        {
          role: "Viewer",
          principal: { id: GROUP, displayName: "Readers", type: "Group" },
        },
        {
          role: "Member",
          principal: {
            id: "Automation",
            displayName: "Automation",
            type: "ServicePrincipal",
          },
        },
      ],
      jobs: [
        {
          itemId: NOTEBOOK,
          itemDisplayName: "Load sales",
          itemType: "Notebook",
          jobType: "RunNotebook",
          status: "Completed",
          id: "job-1",
          invokeType: "Manual",
          startTimeUtc: "2026-09-30T10:00:00.123Z",
          endTimeUtc: "2026-09-30T10:05:00.000Z",
        },
        {
          itemId: NOTEBOOK,
          itemDisplayName: "Load sales",
          itemType: "Notebook",
          jobType: "RunNotebook",
          status: "Failed",
          id: "job-2",
          invokeType: "Scheduled",
          startTimeUtc: "2026-09-29T08:00:00.000Z",
        },
        {
          itemId: NOTEBOOK,
          itemDisplayName: "Load sales",
          itemType: "Notebook",
          jobType: "Scheduled",
          status: "InProgress",
          id: "job-3",
          invokeType: "Scheduled",
        },
      ],
      access: [],
      lineage: [],
      objectEdges: [],
      config: [],
      schema: {},
      itemMetadata: {
        [NOTEBOOK]: { scannerMatched: false, ownerAvailable: false },
        [REPORT]: { scannerMatched: false, ownerAvailable: false },
        [FUTURE]: { scannerMatched: false, ownerAvailable: false },
      },
      artifactMetadata: {},
      capabilities: {
        endorsement: { status: "unsupported", code: "collector-not-migrated" },
        sensitivity: { status: "unsupported", code: "collector-not-migrated" },
        tags: { status: "unsupported", code: "collector-not-migrated" },
        ownership: { status: "unsupported", code: "collector-not-migrated" },
        definitionEnrichment: { status: "unsupported", code: "collector-not-migrated" },
        kqlSchema: { status: "unsupported", code: "collector-not-migrated" },
        sqlSchema: { status: "unsupported", code: "collector-not-migrated" },
        objectLineage: { status: "unsupported", code: "collector-not-migrated" },
      },
      sections: {
        workspace: { status: "complete" },
        items: { status: "complete" },
        roleAssignments: { status: "complete" },
        jobs: { status: "complete", code: "partial-unsupported" },
        scanner: { status: "unsupported", code: "collector-not-migrated" },
        schema: { status: "unsupported", code: "collector-not-migrated" },
        lineage: { status: "unsupported", code: "collector-not-migrated" },
        access: { status: "unsupported", code: "collector-not-migrated" },
        config: { status: "unsupported", code: "collector-not-migrated" },
        definitions: { status: "unsupported", code: "collector-not-migrated" },
        kqlSchema: { status: "unsupported", code: "collector-not-migrated" },
        sqlSchema: { status: "unsupported", code: "collector-not-migrated" },
      },
      errors: [],
      syncedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    });
    expect(JSON.parse(JSON.stringify(envelope))).toEqual(envelope);
    expect(requestedUrls(fetchImpl)).toEqual([
      BASE,
      `${BASE}/items`,
      `${BASE}/items?continuationToken=page-2`,
      `${BASE}/roleAssignments`,
      JOBS(NOTEBOOK),
      JOBS(REPORT),
      JOBS(FUTURE),
    ]);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init).toMatchObject({
        method: "GET",
        redirect: "manual",
        headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
      });
    }
  });

  it("never returns the token, descriptions, upstream bodies or extra Fabric fields", async () => {
    const serialized = JSON.stringify(await collect(coreRoutes()).result);
    for (const forbidden of [
      TOKEN,
      "description",
      "private",
      "failureReason",
      "rootActivityId",
      "sensitivityLabel",
      "groupDetails",
      "workspaceIdentity",
      "job-4",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("follows a continuationToken without continuationUri on the fixed path", async () => {
    const routes = coreRoutes();
    routes[`${BASE}/items`] = () => json({ value: [], continuationToken: "page-2" });
    const { result, fetchImpl } = collect(routes);
    const envelope = await result;
    expect(envelope.items.map((item) => item.id)).toEqual([FUTURE]);
    expect(requestedUrls(fetchImpl)).toContain(`${BASE}/items?continuationToken=page-2`);
  });
});

describe("workspaceCollectCore dual-run stage boundary", () => {
  it("passes the separate Core stage validator without claiming migrated coverage", async () => {
    const envelope = await collect(coreRoutes(), { correlationId: CORRELATION }).result;
    expect(() => validateCoreCollectorEnvelope(envelope, WS)).not.toThrow();
    expect(Object.keys(envelope.sections).sort()).toEqual(
      ["workspace", "items", "roleAssignments", "jobs", ...CORE_EXCLUDED_SECTIONS].sort(),
    );
    expect(Object.keys(envelope.capabilities).sort()).toEqual(
      [...CORE_EXCLUDED_CAPABILITIES].sort(),
    );
    for (const name of CORE_EXCLUDED_SECTIONS) {
      expect(envelope.sections[name]).toEqual({
        status: "unsupported",
        code: "collector-not-migrated",
      });
    }
    for (const name of CORE_EXCLUDED_CAPABILITIES) {
      expect(envelope.capabilities[name]).toEqual({
        status: "unsupported",
        code: "collector-not-migrated",
      });
    }
  });

  it("keeps optional job failures valid for staging but rejects failed Core sections", async () => {
    const jobsRoutes = coreRoutes();
    jobsRoutes[JOBS(NOTEBOOK)] = () => json({}, { status: 403 });
    const jobsFailed = await collect(jobsRoutes).result;
    expect(() => validateCoreCollectorEnvelope(jobsFailed, WS)).not.toThrow();

    const itemsRoutes = coreRoutes();
    itemsRoutes[`${BASE}/items`] = () => json({}, { status: 403 });
    const itemsFailed = await collect(itemsRoutes).result;
    expect(() => validateCoreCollectorEnvelope(itemsFailed, WS)).toThrow(
      "incomplete-core-section",
    );
  });

  it("cannot be consumed as a production base snapshot", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const envelope = await collect(coreRoutes()).result;
    // The browser base flow also requires an enrichment plan covering every item.
    expect(envelope).not.toHaveProperty("enrichmentItemIds");
    expect(() => validateRawSync(envelope, WS)).toThrow(
      "Fabric returned an incomplete sync (scanner, schema, lineage, access, config).",
    );
  });

  it("excludes intentionally omitted descriptions from Core parity but keeps coverage gaps", async () => {
    const envelope = await collect(coreRoutes()).result;
    const withDescriptions = {
      ...structuredClone(envelope),
      workspace: { ...envelope.workspace, description: "private workspace description" },
      items: envelope.items.map((item) =>
        item.id === NOTEBOOK ? { ...item, description: "private item description" } : item,
      ),
    };
    const descriptionOnly = compareCoreCollectorParity(envelope, withDescriptions);
    expect(descriptionOnly).toMatchObject({
      authoritative: false,
      equal: true,
      coreEqual: true,
      coverageEqual: true,
      discrepancyCount: 0,
    });

    const complete = { status: "complete" };
    const python = {
      ...withDescriptions,
      syncMode: "complete",
      sections: {
        ...envelope.sections,
        ...Object.fromEntries(CORE_EXCLUDED_SECTIONS.map((name) => [name, complete])),
      },
      capabilities: Object.fromEntries(
        CORE_EXCLUDED_CAPABILITIES.map((name) => [name, complete]),
      ),
      itemMetadata: Object.fromEntries(
        envelope.items.map((item) => [item.id, { scannerMatched: true, ownerAvailable: false }]),
      ),
    };

    const report = compareCoreCollectorParity(envelope, python);

    expect(report.authoritative).toBe(false);
    expect(report.equal).toBe(false);
    expect(report.coreEqual).toBe(true);
    expect(report.coverageEqual).toBe(false);
    expect(report.discrepancies.filter((entry) => entry.scope === "core")).toEqual([]);
    expect(
      report.discrepancies.some(
        (entry) => entry.collection === "sections" && entry.identity === "scanner",
      ),
    ).toBe(true);
    expect(JSON.stringify([descriptionOnly, report])).not.toContain("private");
  });
});

describe("workspaceCollectCore pagination safety", () => {
  it.each([
    ["cross-origin", `https://example.test/v1/workspaces/${WS}/items?continuationToken=x`],
    ["plain HTTP", `http://api.fabric.microsoft.com/v1/workspaces/${WS}/items?continuationToken=x`],
    ["credentials", `https://user:pass@api.fabric.microsoft.com/v1/workspaces/${WS}/items?x=1`],
    ["another workspace", `https://api.fabric.microsoft.com/v1/workspaces/${OTHER_WS}/items?x=1`],
    ["another endpoint", `${BASE}/roleAssignments?continuationToken=x`],
  ])("rejects a %s continuation without following it", async (_name, continuationUri) => {
    const routes = coreRoutes();
    routes[`${BASE}/items`] = () => json({ value: [], continuationUri });
    const { result, fetchImpl } = collect(routes);
    const envelope = await result;

    expect(envelope.sections.items).toEqual({ status: "failed", code: "pagination-invalid" });
    expect(envelope.items).toEqual([]);
    expect(envelope.sections.jobs).toEqual({ status: "failed", code: "pagination-invalid" });
    expect(envelope.sections.workspace).toEqual({ status: "complete" });
    expect(envelope.sections.roleAssignments).toEqual({ status: "complete" });
    expect(envelope.errors).toEqual(["items: pagination-invalid", "jobs: pagination-invalid"]);
    expect(requestedUrls(fetchImpl)).not.toContain(continuationUri);
  });

  it("detects continuation loops", async () => {
    const routes = coreRoutes();
    const next = `${BASE}/items?continuationToken=loop`;
    routes[`${BASE}/items`] = () => json({ value: [], continuationUri: next });
    routes[next] = () => json({ value: [], continuationUri: next });
    const envelope = await collect(routes).result;
    expect(envelope.sections.items).toEqual({ status: "failed", code: "pagination-invalid" });
  });

  it("bounds pages and records instead of truncating silently", async () => {
    const pagedRoutes = coreRoutes();
    for (let page = 0; page < 5; page += 1) {
      const url = page === 0 ? `${BASE}/items` : `${BASE}/items?continuationToken=${page}`;
      pagedRoutes[url] = () =>
        json({ value: [], continuationUri: `${BASE}/items?continuationToken=${page + 1}` });
    }
    const paged = await collect(pagedRoutes, { limits: { maxItemPages: 3 } }).result;
    expect(paged.sections.items).toEqual({ status: "failed", code: "page-limit-exceeded" });

    const limited = await collect(coreRoutes(), { limits: { maxItems: 1 } }).result;
    expect(limited.sections.items).toEqual({ status: "failed", code: "record-limit-exceeded" });
    expect(limited.items).toEqual([]);
  });

  it("rejects oversized declared and streamed responses", async () => {
    const declared = coreRoutes();
    declared[BASE] = () =>
      new Response("{}", { headers: { "content-length": String(1024 * 1024) } });
    const declaredResult = await collect(declared, { limits: { maxResponseBytes: 512 } }).result;
    expect(declaredResult.sections.workspace).toEqual({
      status: "failed",
      code: "response-size-exceeded",
    });

    const streamed = coreRoutes();
    streamed[BASE] = () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(`{"id":"${"x".repeat(2_000)}"}`));
            controller.close();
          },
        }),
      );
    const streamedResult = await collect(streamed, { limits: { maxResponseBytes: 512 } }).result;
    expect(streamedResult.sections.workspace).toEqual({
      status: "failed",
      code: "response-size-exceeded",
    });
  });
});

describe("workspaceCollectCore throttling and transport", () => {
  it("honors a bounded Retry-After for 429 and backs off on 5xx", async () => {
    const routes = coreRoutes();
    routes[BASE] = [
      () => json({}, { status: 429, headers: { "retry-after": "1" } }),
      () => json({ error: "private" }, { status: 503 }),
      () => json(workspaceBody()),
    ];
    const { result, fetchImpl, sleep } = collect(routes);
    const envelope = await result;

    expect(envelope.sections.workspace).toEqual({ status: "complete" });
    expect(sleep).toHaveBeenNthCalledWith(1, 1_000);
    expect(sleep).toHaveBeenNthCalledWith(2, 1_000);
    expect(requestedUrls(fetchImpl).filter((url) => url === BASE)).toHaveLength(3);
  });

  it("defers a Retry-After beyond the safe bound instead of sleeping", async () => {
    const routes = coreRoutes();
    routes[BASE] = () => json({}, { status: 429, headers: { "retry-after": "120" } });
    const { result, fetchImpl, sleep } = collect(routes);
    const envelope = await result;

    expect(envelope.sections.workspace).toEqual({
      status: "failed",
      code: "retry-after-deferred",
    });
    expect(sleep).not.toHaveBeenCalled();
    expect(requestedUrls(fetchImpl).filter((url) => url === BASE)).toHaveLength(1);
  });

  it("reports persistent throttling after bounded attempts", async () => {
    const routes = coreRoutes();
    routes[BASE] = () => json({}, { status: 429, headers: { "retry-after": "0" } });
    const { result, fetchImpl } = collect(routes);
    expect((await result).sections.workspace).toEqual({ status: "failed", code: "rate-limited" });
    expect(requestedUrls(fetchImpl).filter((url) => url === BASE)).toHaveLength(3);
  });

  it("retries network timeouts and surfaces credential-free transport codes", async () => {
    const timeout = coreRoutes();
    timeout[BASE] = [
      () => Promise.reject(new DOMException("The operation was aborted.", "AbortError")),
      () => json(workspaceBody()),
    ];
    expect((await collect(timeout).result).sections.workspace).toEqual({ status: "complete" });

    const timedOut = coreRoutes();
    timedOut[BASE] = () =>
      Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
    expect((await collect(timedOut).result).sections.workspace).toEqual({
      status: "failed",
      code: "request-timeout",
    });

    const unreachable = coreRoutes();
    unreachable[BASE] = () => Promise.reject(new TypeError(`fetch failed for ${TOKEN}`));
    const envelope = await collect(unreachable).result;
    expect(envelope.sections.workspace).toEqual({
      status: "failed",
      code: "upstream-unreachable",
    });
    expect(JSON.stringify(envelope)).not.toContain(TOKEN);
  });

  it("rejects redirects without following them or retrying", async () => {
    const routes = coreRoutes();
    routes[BASE] = () =>
      new Response(null, { status: 302, headers: { location: "https://example.test/steal" } });
    const { result, fetchImpl } = collect(routes);
    expect((await result).sections.workspace).toEqual({
      status: "failed",
      code: "redirect-rejected",
    });
    expect(requestedUrls(fetchImpl).filter((url) => url === BASE)).toHaveLength(1);
    expect(requestedUrls(fetchImpl)).not.toContain("https://example.test/steal");
  });

  it("maps authorization failures without returning the upstream body", async () => {
    const routes = coreRoutes();
    routes[BASE] = () => json({ message: "private upstream detail" }, { status: 403 });
    const envelope = await collect(routes).result;
    expect(envelope).not.toHaveProperty("workspace");
    expect(envelope.sections.workspace).toEqual({
      status: "failed",
      code: "authorization-failed",
    });
    expect(envelope.errors).toEqual(["workspace: authorization-failed"]);
    expect(JSON.stringify(envelope)).not.toContain("private");
  });
});

describe("workspaceCollectCore sanitization", () => {
  it.each([
    ["a missing item type", { id: NOTEBOOK, displayName: "Untyped" }],
    ["a non-UUID item ID", { id: "../../admin", type: "Notebook" }],
    ["a foreign item workspace", { id: NOTEBOOK, type: "Notebook", workspaceId: OTHER_WS }],
    ["an overlong item type", { id: NOTEBOOK, type: "T".repeat(129) }],
  ])("fails the items section closed for %s", async (_name, item) => {
    const routes = coreRoutes();
    routes[`${BASE}/items`] = () => json({ value: [item] });
    const envelope = await collect(routes).result;
    expect(envelope.sections.items).toEqual({ status: "failed", code: "invalid-response" });
    expect(envelope.items).toEqual([]);
    expect(envelope.itemMetadata).toEqual({});
  });

  it("rejects duplicate item IDs across pages", async () => {
    const routes = coreRoutes();
    routes[`${BASE}/items?continuationToken=page-2`] = () =>
      json({ value: [{ id: NOTEBOOK, type: "Notebook" }] });
    const envelope = await collect(routes).result;
    expect(envelope.sections.items).toEqual({ status: "failed", code: "invalid-response" });
  });

  it("rejects a workspace response for another workspace", async () => {
    const routes = coreRoutes();
    routes[BASE] = () => json({ ...workspaceBody(), id: OTHER_WS });
    const envelope = await collect(routes).result;
    expect(envelope).not.toHaveProperty("workspace");
    expect(envelope.sections.workspace).toEqual({ status: "failed", code: "invalid-response" });
  });

  it("fails role assignments closed without invalidating items", async () => {
    const routes = coreRoutes();
    routes[`${BASE}/roleAssignments`] = () =>
      json({ value: [{ role: "Admin", principal: { type: "User" } }] });
    const envelope = await collect(routes).result;
    expect(envelope.sections.roleAssignments).toEqual({
      status: "failed",
      code: "invalid-response",
    });
    expect(envelope.roleAssignments).toEqual([]);
    expect(envelope.sections.items).toEqual({ status: "complete" });
    expect(envelope.items).toHaveLength(3);
  });
});

describe("workspaceCollectCore optional jobs", () => {
  it("follows all bounded job pages before retaining the first three records", async () => {
    const routes = coreRoutes();
    const next = `${JOBS(NOTEBOOK)}?continuationToken=jobs-2`;
    routes[JOBS(NOTEBOOK)] = () =>
      json({
        value: notebookJobs().value.slice(0, 2),
        continuationUri: next,
      });
    routes[next] = () => json({ value: notebookJobs().value.slice(2) });
    const { result, fetchImpl } = collect(routes);
    const envelope = await result;

    expect(requestedUrls(fetchImpl)).toContain(next);
    expect(
      envelope.jobs
        .filter((job) => job.itemId === NOTEBOOK)
        .map((job) => job.id),
    ).toEqual(["job-1", "job-2", "job-3"]);
  });

  it("records item job failures without invalidating Core sections", async () => {
    const routes = coreRoutes();
    routes[JOBS(NOTEBOOK)] = () => json({ message: "private" }, { status: 403 });
    const { result, fetchImpl } = collect(routes);
    const envelope = await result;

    expect(envelope.sections).toMatchObject({
      workspace: { status: "complete" },
      items: { status: "complete" },
      roleAssignments: { status: "complete" },
      jobs: { status: "failed", code: "authorization-failed" },
    });
    expect(envelope.items).toHaveLength(3);
    expect(envelope.roleAssignments).toHaveLength(3);
    expect(envelope.jobs).toEqual([]);
    expect(envelope.errors).toEqual(["jobs: authorization-failed"]);
    expect(requestedUrls(fetchImpl)).toContain(JOBS(FUTURE));
  });

  it("rejects an invalid recent job record for that item only", async () => {
    const routes = coreRoutes();
    routes[JOBS(NOTEBOOK)] = () =>
      json({
        value: [
          { id: "job-1", jobType: "RunNotebook", status: "Completed", startTimeUtc: "yesterday" },
        ],
      });
    const envelope = await collect(routes).result;
    expect(envelope.sections.jobs).toEqual({ status: "failed", code: "invalid-response" });
    expect(envelope.jobs).toEqual([]);
    expect(envelope.sections.items).toEqual({ status: "complete" });
  });

  it("rejects repeated explicit job IDs for one item", async () => {
    const routes = coreRoutes();
    const repeated = "abcdefab-cdef-4abc-8def-abcdefabcdef";
    routes[JOBS(NOTEBOOK)] = () =>
      json({
        value: [
          { id: repeated, jobType: "RunNotebook", status: "Completed" },
          { id: repeated.toUpperCase(), jobType: "RunNotebook", status: "Failed" },
        ],
      });
    const envelope = await collect(routes).result;
    expect(envelope.sections.jobs).toEqual({ status: "failed", code: "invalid-response" });
    expect(envelope.jobs).toEqual([]);
    expect(() => validateCoreCollectorEnvelope(envelope, WS)).not.toThrow();
  });

  it("enforces the job item budget", async () => {
    const { result, fetchImpl } = collect(coreRoutes(), { limits: { maxJobItems: 1 } });
    const envelope = await result;
    expect(envelope.sections.jobs).toEqual({ status: "failed", code: "job-budget-exhausted" });
    expect(envelope.jobs).toHaveLength(3);
    expect(envelope.errors).toEqual(["jobs: job-budget-exhausted"]);
    expect(requestedUrls(fetchImpl).filter((url) => url.endsWith("/jobs/instances")))
      .toEqual([JOBS(NOTEBOOK)]);
  });

  it("enforces the total job request budget across retries", async () => {
    const routes = coreRoutes();
    routes[JOBS(NOTEBOOK)] = [
      () => json({}, { status: 503, headers: { "retry-after": "0" } }),
      () => json(notebookJobs()),
    ];
    const { result, fetchImpl } = collect(routes, { limits: { maxJobRequests: 1 } });
    const envelope = await result;
    expect(envelope.sections.jobs).toEqual({ status: "failed", code: "job-budget-exhausted" });
    expect(requestedUrls(fetchImpl).filter((url) => url.endsWith("/jobs/instances")))
      .toHaveLength(1);
  });

  it("stops querying jobs after persistent throttling", async () => {
    const routes = coreRoutes();
    routes[JOBS(NOTEBOOK)] = () => json({}, { status: 429, headers: { "retry-after": "0" } });
    const { result, fetchImpl } = collect(routes);
    const envelope = await result;
    expect(envelope.sections.jobs).toEqual({ status: "failed", code: "rate-limited" });
    expect(envelope.sections.items).toEqual({ status: "complete" });
    expect(requestedUrls(fetchImpl)).not.toContain(JOBS(REPORT));
  });

  it("stops before the execution deadline", async () => {
    let now = 0;
    const routes = coreRoutes();
    for (const url of [BASE, `${BASE}/items`, `${BASE}/roleAssignments`]) {
      const handler = routes[url] as Handler;
      routes[url] = () => {
        now += 60_000;
        return handler();
      };
    }
    const { result, fetchImpl } = collect(routes, { now: () => now });
    const envelope = await result;
    expect(envelope.sections.roleAssignments).toEqual({ status: "complete" });
    expect(envelope.sections.jobs).toEqual({ status: "failed", code: "deadline-exhausted" });
    expect(requestedUrls(fetchImpl).some((url) => url.endsWith("/jobs/instances"))).toBe(false);
  });

  it("inherits the item failure when items cannot be collected", async () => {
    const routes = coreRoutes();
    routes[`${BASE}/items`] = () => json({}, { status: 403 });
    const envelope = await collect(routes).result;
    expect(envelope.sections.items).toEqual({ status: "failed", code: "authorization-failed" });
    expect(envelope.sections.jobs).toEqual({ status: "failed", code: "authorization-failed" });
    expect(envelope.errors).toEqual(["items: authorization-failed", "jobs: authorization-failed"]);
  });

  it("marks jobs not applicable for an empty workspace", async () => {
    const routes = coreRoutes();
    routes[`${BASE}/items`] = () => json({ value: [] });
    const envelope = await collect(routes).result;
    expect(envelope.sections.items).toEqual({ status: "complete" });
    expect(envelope.sections.jobs).toEqual({ status: "unsupported", code: "not-applicable" });
  });
});
