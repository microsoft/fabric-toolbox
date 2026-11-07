// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
// The SDK is installed only in the Functions package; import its enum module directly.
import { AudienceType } from "../../rayfin/functions/node_modules/@microsoft/fabric-user-data-functions/dist/types/connection.js";
import { SYNCHRONIZER_AUTHORITY_ID } from "../../rayfin/functions/src/synchronizer-gate";
import type { AppFunctionsSchema } from "../../rayfin/functions/src/types";
import {
  collectWorkspaceKqlMetadata,
  validateCollectKqlMetadataInput,
  workspaceCollectKqlMetadata,
  type CollectKqlMetadataDependencies,
  type KqlMetadataItemInput,
  type KqlMetadataStageEnvelope,
} from "../../rayfin/functions/src/workspace-kql-metadata";
import { parseFabricItemMetadata } from "./item-metadata";

const WS = "11111111-1111-4111-8111-111111111111";
const EVENTHOUSE = "22222222-2222-4222-8222-222222222222";
const KQL_DB = "33333333-3333-4333-8333-333333333333";
const QUERYSET = "44444444-4444-4444-8444-444444444444";
const DASHBOARD = "55555555-5555-4555-8555-555555555555";
const NOTEBOOK = "66666666-6666-4666-8666-666666666666";
const SHORTCUT_DB = "77777777-7777-4777-8777-777777777777";
const NON_RFC_DB = "8187f108-2404-4771-6e7a-5b218778e7a5";
const CORRELATION = "88888888-8888-4888-8888-888888888888";
const TOKEN = "fixture-fabric-token";
const BASE = `https://api.fabric.microsoft.com/v1/workspaces/${WS}`;
const CLUSTER = "https://trd-fixture.z5.kusto.fabric.microsoft.com";
const EVENTHOUSE_URL = `${BASE}/eventhouses/${EVENTHOUSE}`;
const KQL_DB_URL = `${BASE}/kqlDatabases/${KQL_DB}`;
const SHORTCUT_URL = `${BASE}/kqlDatabases/${SHORTCUT_DB}`;
const KQL_DB_DEFINITION_URL = `${KQL_DB_URL}/getDefinition`;
const SHORTCUT_DEFINITION_URL = `${SHORTCUT_URL}/getDefinition`;
const OPERATION = "abababab-abab-4bab-8bab-abababababab";
const OPERATION_URL = `https://api.fabric.microsoft.com/v1/operations/${OPERATION}`;
const SCHEMA_SCRIPT = [
  "// KQL script",
  ".create-merge table Telemetry (Timestamp:datetime, DeviceId:string, Reading:real) with (folder = \"Raw\", docstring = \"private table docstring\")",
  ".create-merge table ['Device Events'] (['Event Id']:guid, Payload:dynamic)",
  ".create-or-alter table Telemetry ingestion json mapping 'private_mapping' '[{\"column\":\"DeviceId\",\"path\":\"$.private\"}]'",
  ".alter table Telemetry policy retention ```{\"SoftDeletePeriod\":\"30.00:00:00\"}```",
  ".create-or-alter function with (folder = \"private folder\", docstring = \"Password=private-secret;\") ReadingsSince(since:timespan = 1d, device:string = \"private-device\") {",
  "  Telemetry",
  "  | where Timestamp > ago(since) and DeviceId == device",
  "}",
  ".create async ifnotexists materialized-view with (backfill = true) HourlyReadings on table Telemetry {",
  "  Telemetry | summarize avg(Reading) by bin(Timestamp, 1h)",
  "}",
  ".add database ['Telemetry events'] viewers ('aaduser=private@contoso.com')",
].join("\n");
const EXPECTED_SCHEMA = {
  status: "complete",
  source: "fabric-kql-database-definition",
  tables: [
    { name: "Device Events", columns: [{ name: "Event Id", dataType: "guid" }, { name: "Payload", dataType: "dynamic" }] },
    {
      name: "Telemetry",
      columns: [
        { name: "Timestamp", dataType: "datetime" },
        { name: "DeviceId", dataType: "string" },
        { name: "Reading", dataType: "real" },
      ],
    },
  ],
  functions: [{ name: "ReadingsSince", parameters: [{ name: "since", dataType: "timespan" }, { name: "device", dataType: "string" }] }],
  materializedViews: [{ name: "HourlyReadings", sourceTable: "Telemetry" }],
  ignoredStatements: 3,
  unsupportedStatements: 0,
};

function schemaDefinition(script = SCHEMA_SCRIPT, extraParts: unknown[] = []) {
  return {
    definition: {
      parts: [
        { path: "DatabaseProperties.json", payload: "not decoded!", payloadType: "InlineBase64" },
        { path: "DatabaseSchema.kql", payload: Buffer.from(script, "utf8").toString("base64").replace(/=+$/, ""), payloadType: "InlineBase64" },
        { path: ".platform", payload: "not decoded!", payloadType: "InlineBase64" },
        ...extraParts,
      ],
    },
  };
}

type CollectContext = Parameters<typeof workspaceCollectKqlMetadata>[0];
type Handler = (init?: RequestInit) => Response | Promise<Response>;
type Routes = Record<string, Handler | Handler[]>;

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function eventhouse(overrides: Record<string, unknown> = {}) {
  return {
    id: EVENTHOUSE.toUpperCase(),
    type: "Eventhouse",
    displayName: "Telemetry",
    description: "private eventhouse description",
    workspaceId: WS,
    properties: {
      queryServiceUri: CLUSTER,
      ingestionServiceUri: "https://ingest-private.z5.kusto.fabric.microsoft.com",
      databasesItemIds: [KQL_DB.toUpperCase(), NON_RFC_DB, KQL_DB],
      minimumConsumptionUnits: 2.25,
    },
    sensitivityLabel: { id: "private-label" },
    ...overrides,
  };
}

function kqlDatabase(properties: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}) {
  return {
    id: KQL_DB,
    type: "KQLDatabase",
    displayName: "Telemetry events",
    description: "private database description",
    workspaceId: WS,
    properties: {
      parentEventhouseItemId: EVENTHOUSE,
      queryServiceUri: `${CLUSTER}/`,
      ingestionServiceUri: "https://ingest-private.z5.kusto.fabric.microsoft.com",
      databaseType: "ReadWrite",
      oneLakeCachingPeriod: "P36500D",
      ...properties,
    },
    ...overrides,
  };
}

function routes(overrides: Routes = {}): Routes {
  return {
    [EVENTHOUSE_URL]: () => json(eventhouse()),
    [KQL_DB_URL]: () => json(kqlDatabase()),
    [SHORTCUT_URL]: () =>
      json(kqlDatabase({ databaseType: "Shortcut", queryServiceUri: undefined }, { id: SHORTCUT_DB, displayName: "Shared events" })),
    [KQL_DB_DEFINITION_URL]: () => json(schemaDefinition()),
    [SHORTCUT_DEFINITION_URL]: () =>
      json({ errorCode: "OperationNotSupportedForItem", message: "private upstream detail" }, { status: 400 }),
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

const BATCH: KqlMetadataItemInput[] = [
  { id: EVENTHOUSE, type: "Eventhouse" },
  { id: KQL_DB, type: "KQLDatabase" },
  { id: QUERYSET, type: "KQLQueryset" },
  { id: DASHBOARD, type: "KQLDashboard" },
];

function collect(
  table: Routes,
  items: KqlMetadataItemInput[] = BATCH,
  options: Omit<CollectKqlMetadataDependencies, "fetch"> = {},
) {
  const fetchImpl = fabricFetch(table);
  const sleep = options.sleep ?? vi.fn(async () => undefined);
  const result = collectWorkspaceKqlMetadata(
    TOKEN,
    { workspaceId: WS, correlationId: null, items },
    { ...options, fetch: fetchImpl, sleep },
  );
  return { result, fetchImpl, sleep };
}

function urls(fetchImpl: ReturnType<typeof fabricFetch>): string[] {
  return fetchImpl.mock.calls.map(([input]) => String(input));
}

function status(envelope: KqlMetadataStageEnvelope, id: string) {
  const item = envelope.items.find((candidate) => candidate.id === id);
  return { status: item?.status, code: item?.code };
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

describe("KQL metadata identity boundary", () => {
  it("has no supported Kusto audience in the installed Rayfin Functions SDK", () => {
    // If a future SDK adds a Kusto audience, revisit the schema blocker instead of inventing a token path.
    expect(Object.values(AudienceType)).toEqual(["Sql", "Storage", "Fabric", "AzureAI", "ADO"]);
  });

  it("registers only the Fabric audience with a flat typed batch signature", () => {
    const metadata = JSON.parse(readFileSync(resolve("rayfin", "functions", "runtimemetadata.json"), "utf8")) as {
      functions: { functionName: string; contextAudiences: string[]; delegateParameters: Record<string, unknown>[] }[];
    };
    for (const fn of metadata.functions) {
      expect(fn.contextAudiences.every((audience) => Object.values(AudienceType).includes(audience as AudienceType))).toBe(true);
    }
    const fn = metadata.functions.find((candidate) => candidate.functionName === "workspaceCollectKqlMetadata");
    expect(fn?.contextAudiences).toEqual(["Fabric"]);
    expect(fn?.delegateParameters).toEqual([
      expect.objectContaining({ name: "ctx", type: "RayfinContext<AtlasSchema, AudienceType.Fabric>" }),
      expect.objectContaining({ name: "protocolVersion", type: "1" }),
      expect.objectContaining({ name: "workspaceId", type: "SyncUuidInput" }),
      expect.objectContaining({ name: "items", type: "KqlMetadataItemsInput", hasDefault: false }),
      expect.objectContaining({ name: "correlationId", type: "SyncUuidInput | null", hasDefault: true }),
    ]);
  });

  it("never contacts a Kusto endpoint and dates the remaining data-plane blocker", async () => {
    const { result, fetchImpl } = collect(routes());
    const envelope = await result;
    expect(urls(fetchImpl)).toEqual([EVENTHOUSE_URL, KQL_DB_URL, KQL_DB_DEFINITION_URL]);
    expect(urls(fetchImpl).every((target) => target.startsWith("https://api.fabric.microsoft.com/v1/workspaces/"))).toBe(true);
    expect(urls(fetchImpl).some((target) => target.includes("kusto"))).toBe(false);
    expect(envelope.sections.kqlSchema).toEqual({ status: "complete" });
    expect(envelope.capabilities.kqlSchema).toEqual({ status: "complete" });
    expect(envelope.blockers).toEqual([
      {
        capability: "kqlDataPlaneSchema",
        code: "kusto-audience-unsupported",
        observedOn: "2026-10-02",
        rayfinVersion: "1.36.2",
        replacement: "fabric-kql-database-definition",
      },
    ]);
  });

  it("generates exact client types without token, URL or endpoint inputs", () => {
    expectTypeOf<AppFunctionsSchema["workspaceCollectKqlMetadata"]["input"]>().toEqualTypeOf<{
      protocolVersion: 1;
      workspaceId: string;
      items: { id: string; type: string }[];
      correlationId: string | null;
    }>();
    expectTypeOf<AppFunctionsSchema["workspaceCollectKqlMetadata"]["output"]>()
      .toEqualTypeOf<KqlMetadataStageEnvelope>();
  });
});

describe("KQL metadata input validation and authorization", () => {
  it.each([
    ["string protocol", "1", [{ id: KQL_DB, type: "KQLDatabase" }], null],
    ["empty batch", 1, [], null],
    ["oversized batch", 1, Array.from({ length: 17 }, (_, index) => ({
      id: `${String(index % 9 + 1).repeat(8)}-1111-4111-8111-${String(index).padStart(12, "0")}`,
      type: "KQLDatabase",
    })), null],
    ["duplicate items", 1, [{ id: KQL_DB, type: "KQLDatabase" }, { id: KQL_DB.toUpperCase(), type: "Eventhouse" }], null],
    ["a cluster URI field", 1, [{ id: KQL_DB, type: "KQLDatabase", queryServiceUri: CLUSTER }], null],
    ["a path-like type", 1, [{ id: KQL_DB, type: "kqlDatabases/../x" }], null],
    ["an empty correlation", 1, [{ id: KQL_DB, type: "KQLDatabase" }], ""],
  ])("rejects %s with a fixed message", (_name, protocolVersion, items, correlationId) => {
    expect(() => validateCollectKqlMetadataInput(protocolVersion, WS, items, correlationId)).toThrow(
      "Use protocolVersion 1, a strict workspace UUID, 1-16 unique {id, type} items and a strict correlation UUID or null.",
    );
  });

  it("fails closed before reading the token or calling Fabric", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const token = vi.fn(() => TOKEN);
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      workspaceCollectKqlMetadata(context(vi.fn().mockRejectedValue(new Error("denied")), token), 1, WS, BATCH, null, {
        fetch: fetchImpl,
      }),
    ).rejects.toThrow("KQL metadata collection requires the configured Atlas administrator.");
    expect(token).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns a fixed error when the declared Fabric token is unavailable", async () => {
    const failure = workspaceCollectKqlMetadata(
      context(
        async () => ({ id: SYNCHRONIZER_AUTHORITY_ID, createdAt: new Date() }),
        () => {
          throw new Error(`binding failed for ${TOKEN}`);
        },
      ),
      1,
      WS,
      BATCH,
      CORRELATION,
    );
    await expect(failure).rejects.toThrow("The Fabric application token was unavailable.");
    await expect(failure).rejects.not.toThrow(TOKEN);
  });
});

describe("KQL metadata supported Fabric REST routes", () => {
  it("projects Eventhouse and KQL database properties and keeps Queryset and Dashboard distinct", async () => {
    const items: KqlMetadataItemInput[] = [
      ...BATCH,
      { id: SHORTCUT_DB, type: "KQLDatabase" },
      { id: NOTEBOOK, type: "Notebook" },
      { id: "99999999-9999-4999-8999-999999999999", type: "constructor" },
    ];
    const { result, fetchImpl } = collect(routes(), items);
    const envelope = await result;

    expect(urls(fetchImpl)).toEqual([
      EVENTHOUSE_URL,
      KQL_DB_URL,
      KQL_DB_DEFINITION_URL,
      SHORTCUT_URL,
      SHORTCUT_DEFINITION_URL,
    ]);
    for (const [input, init] of fetchImpl.mock.calls) {
      expect(init?.body).toBeUndefined();
      expect(init).toMatchObject({
        method: String(input).endsWith("/getDefinition") ? "POST" : "GET",
        redirect: "manual",
        headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
      });
    }
    expect(envelope).toMatchObject({ contractVersion: 1, stage: "kql-metadata", authoritative: false, workspaceId: WS, errors: [] });
    expect(envelope.items).toEqual([
      {
        id: EVENTHOUSE,
        type: "Eventhouse",
        status: "complete",
        eventhouse: { queryServiceUri: CLUSTER, databaseItemIds: [KQL_DB, NON_RFC_DB].sort() },
      },
      {
        id: KQL_DB,
        type: "KQLDatabase",
        status: "complete",
        kqlDatabase: {
          parentEventhouseItemId: EVENTHOUSE,
          queryServiceUri: CLUSTER,
          databaseType: "ReadWrite",
          databaseName: "Telemetry events",
        },
      },
      { id: QUERYSET, type: "KQLQueryset", status: "unsupported", code: "no-structural-properties" },
      { id: DASHBOARD, type: "KQLDashboard", status: "unsupported", code: "no-structural-properties" },
      {
        id: SHORTCUT_DB,
        type: "KQLDatabase",
        status: "complete",
        kqlDatabase: {
          parentEventhouseItemId: EVENTHOUSE,
          databaseType: "Shortcut",
          databaseName: "Shared events",
        },
      },
      { id: NOTEBOOK, type: "Notebook", status: "unsupported", code: "item-type-unsupported" },
      { id: "99999999-9999-4999-8999-999999999999", type: "constructor", status: "unsupported", code: "item-type-unsupported" },
    ]);
    expect(envelope.config).toEqual([
      { itemId: EVENTHOUSE, section: "Eventhouse", label: "Query service URI", value: CLUSTER },
      { itemId: EVENTHOUSE, section: "Eventhouse", label: "KQL databases", value: "2" },
      { itemId: KQL_DB, section: "KQL database", label: "Parent Eventhouse item ID", value: EVENTHOUSE },
      { itemId: KQL_DB, section: "KQL database", label: "Query service URI", value: CLUSTER },
      { itemId: KQL_DB, section: "KQL database", label: "Database identity", value: "Telemetry events" },
      { itemId: KQL_DB, section: "KQL database", label: "Database type", value: "ReadWrite" },
      { itemId: KQL_DB, section: "Metadata capability", label: "KQL schema", value: "complete" },
      { itemId: KQL_DB, section: "KQL stored functions", label: "ReadingsSince", value: "Stored function" },
      { itemId: KQL_DB, section: "KQL materialized views", label: "HourlyReadings", value: "Materialized view" },
      { itemId: KQL_DB, section: "Tables", label: "Device Events", value: "KQL table" },
      { itemId: KQL_DB, section: "Tables", label: "Telemetry", value: "KQL table" },
      { itemId: KQL_DB, section: "Tables", label: "HourlyReadings", value: "KQL materialized view" },
      { itemId: KQL_DB, section: "Tables", label: "ReadingsSince", value: "KQL function" },
      { itemId: SHORTCUT_DB, section: "KQL database", label: "Parent Eventhouse item ID", value: EVENTHOUSE },
      { itemId: SHORTCUT_DB, section: "KQL database", label: "Database identity", value: "Shared events" },
      { itemId: SHORTCUT_DB, section: "KQL database", label: "Database type", value: "Shortcut" },
      { itemId: SHORTCUT_DB, section: "Metadata capability", label: "KQL schema", value: "endpoint-unsupported" },
    ]);
    expect(envelope.sections.kqlProperties).toEqual({ status: "complete", code: "partial-unsupported" });
    expect(envelope.sections.kqlSchema).toEqual({ status: "complete", code: "partial-unsupported" });
    expect(envelope.schemas).toEqual({
      [KQL_DB]: EXPECTED_SCHEMA,
      [SHORTCUT_DB]: { status: "unsupported", code: "endpoint-unsupported" },
    });
    expect(envelope.artifactMetadata).toEqual({
      [KQL_DB]: {
        kind: "kql",
        functions: EXPECTED_SCHEMA.functions,
        materializedViews: [{ name: "HourlyReadings", sourceTable: "Telemetry", columns: [] }],
      },
    });
    expect(parseFabricItemMetadata("KQLDatabase", envelope.artifactMetadata[KQL_DB])).toEqual(
      expect.objectContaining({ kind: "kql" }),
    );
  });

  it("marks the schema section not applicable when no KQL database is requested", async () => {
    const envelope = await collect(routes(), [{ id: EVENTHOUSE, type: "Eventhouse" }]).result;
    expect(envelope.sections).toEqual({
      kqlProperties: { status: "complete" },
      kqlSchema: { status: "unsupported", code: "not-applicable" },
    });
  });

  it("never returns tokens, descriptions, ingestion endpoints, labels or upstream bodies", async () => {
    const table = routes({
      [SHORTCUT_URL]: () => json({ message: "private upstream detail" }, { status: 403 }),
    });
    const serialized = JSON.stringify(
      await collect(table, [...BATCH, { id: SHORTCUT_DB, type: "KQLDatabase" }]).result,
    );
    for (const forbidden of [
      TOKEN,
      "private",
      "ingest",
      "description",
      "sensitivity",
      "minimumConsumptionUnits",
      "oneLakeCaching",
      "P36500D",
      "Password",
      "aaduser",
      "ago(",
      "summarize",
      "SoftDeletePeriod",
      "folder",
      "docstring",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe("KQL metadata malformed and oversized responses", () => {
  it.each([
    ["a non-object body", [1, 2]],
    ["another item ID", kqlDatabase({}, { id: SHORTCUT_DB })],
    ["another item type", kqlDatabase({}, { type: "Eventhouse" })],
    ["another workspace", kqlDatabase({}, { workspaceId: EVENTHOUSE })],
    ["non-object properties", kqlDatabase({}, { properties: ["x"] })],
    ["a non-Kusto cluster host", kqlDatabase({ queryServiceUri: "https://evil.example.test" })],
    ["a lookalike cluster host", kqlDatabase({ queryServiceUri: "https://kusto.fabric.microsoft.com.evil.test" })],
    ["a plain HTTP cluster", kqlDatabase({ queryServiceUri: "http://trd-fixture.z5.kusto.fabric.microsoft.com" })],
    ["cluster credentials", kqlDatabase({ queryServiceUri: "https://user:pass@trd-fixture.z5.kusto.fabric.microsoft.com" })],
    ["a cluster path", kqlDatabase({ queryServiceUri: `${CLUSTER}/v1/rest/mgmt` })],
    ["a cluster query string", kqlDatabase({ queryServiceUri: `${CLUSTER}/?sig=private` })],
    ["an invalid parent Eventhouse", kqlDatabase({ parentEventhouseItemId: "../private" })],
    ["a control character database type", kqlDatabase({ databaseType: "Read\nWrite" })],
    ["an overlong database type", kqlDatabase({ databaseType: "x".repeat(257) })],
    ["a non-string display name", kqlDatabase({}, { displayName: 42 })],
  ])("fails only the KQL database with %s", async (_name, body) => {
    const envelope = await collect(routes({ [KQL_DB_URL]: () => json(body) })).result;
    expect(status(envelope, KQL_DB)).toEqual({ status: "failed", code: "invalid-response" });
    expect(status(envelope, EVENTHOUSE).status).toBe("complete");
    expect(envelope.items.find((item) => item.id === KQL_DB)).not.toHaveProperty("kqlDatabase");
    expect(envelope.config.some((entry) => entry.itemId === KQL_DB)).toBe(false);
    expect(envelope.errors).toEqual([`kqlProperties:${KQL_DB}: invalid-response`]);
    expect(JSON.stringify(envelope)).not.toContain("private");
  });

  it.each([
    ["non-array database IDs", eventhouse({ properties: { databasesItemIds: KQL_DB } })],
    ["an invalid database ID", eventhouse({ properties: { databasesItemIds: [KQL_DB, "not-a-guid"] } })],
  ])("fails only the Eventhouse with %s", async (_name, body) => {
    const envelope = await collect(routes({ [EVENTHOUSE_URL]: () => json(body) })).result;
    expect(status(envelope, EVENTHOUSE)).toEqual({ status: "failed", code: "invalid-response" });
    expect(status(envelope, KQL_DB).status).toBe("complete");
  });

  it("bounds database references, non-JSON bodies and response bytes", async () => {
    const tooMany = await collect(routes(), [{ id: EVENTHOUSE, type: "Eventhouse" }], {
      limits: { maxDatabaseItemIds: 2 },
    }).result;
    expect(status(tooMany, EVENTHOUSE)).toEqual({ status: "failed", code: "invalid-response" });

    const html = await collect(routes({ [KQL_DB_URL]: () => new Response("<html>private</html>") }), [
      { id: KQL_DB, type: "KQLDatabase" },
    ]).result;
    expect(status(html, KQL_DB)).toEqual({ status: "failed", code: "invalid-response" });

    const oversized = await collect(
      routes({ [KQL_DB_URL]: () => new Response("{}", { headers: { "content-length": String(2 * 1024 * 1024) } }) }),
      [{ id: KQL_DB, type: "KQLDatabase" }],
    ).result;
    expect(status(oversized, KQL_DB)).toEqual({ status: "failed", code: "response-size-exceeded" });
  });
});

describe("KQL metadata permission, throttling and budgets", () => {
  it.each([
    [401, "failed", "authorization-failed"],
    [403, "failed", "authorization-failed"],
    [404, "unsupported", "endpoint-unsupported"],
    [400, "unsupported", "endpoint-unsupported"],
    [409, "failed", "upstream-http-error"],
  ])("maps HTTP %s to %s/%s without failing other items", async (code, itemStatus, statusCode) => {
    const envelope = await collect(
      routes({ [EVENTHOUSE_URL]: () => json({ message: "private" }, { status: code }) }),
    ).result;
    expect(status(envelope, EVENTHOUSE)).toEqual({ status: itemStatus, code: statusCode });
    expect(status(envelope, KQL_DB).status).toBe("complete");
    expect(envelope.errors).toEqual(itemStatus === "failed" ? [`kqlProperties:${EVENTHOUSE}: ${statusCode}`] : []);
  });

  it("retries transient failures and stops on persistent throttling", async () => {
    const recovered = await collect(
      routes({ [KQL_DB_URL]: [() => json({}, { status: 503 }), () => json(kqlDatabase())] }),
      [{ id: KQL_DB, type: "KQLDatabase" }],
    ).result;
    expect(status(recovered, KQL_DB).status).toBe("complete");

    const { result, fetchImpl } = collect(
      routes({ [EVENTHOUSE_URL]: () => json({}, { status: 429, headers: { "retry-after": "0" } }) }),
      [{ id: EVENTHOUSE, type: "Eventhouse" }, { id: KQL_DB, type: "KQLDatabase" }, { id: QUERYSET, type: "KQLQueryset" }],
    );
    const throttled = await result;
    expect(status(throttled, EVENTHOUSE)).toEqual({ status: "failed", code: "rate-limited" });
    expect(status(throttled, KQL_DB)).toEqual({ status: "failed", code: "not-attempted" });
    expect(status(throttled, QUERYSET)).toEqual({ status: "unsupported", code: "no-structural-properties" });
    expect(throttled.sections.kqlProperties).toEqual({ status: "failed", code: "rate-limited" });
    expect(urls(fetchImpl)).not.toContain(KQL_DB_URL);
  });

  it("enforces the request budget, deadline and cancellation", async () => {
    const budget = await collect(routes(), BATCH, { limits: { maxRequests: 1 } }).result;
    expect(status(budget, EVENTHOUSE).status).toBe("complete");
    expect(status(budget, KQL_DB)).toEqual({ status: "failed", code: "not-attempted" });
    expect(budget.errors).toEqual(["kqlProperties: request-budget-exhausted"]);

    let now = 0;
    const deadline = await collect(
      routes({
        [EVENTHOUSE_URL]: () => {
          now += 146_000;
          return json(eventhouse());
        },
      }),
      BATCH,
      { now: () => now },
    ).result;
    expect(status(deadline, KQL_DB)).toEqual({ status: "failed", code: "not-attempted" });
    expect(deadline.errors).toEqual(["kqlProperties: deadline-exhausted"]);

    const controller = new AbortController();
    const cancelled = collect(
      routes({
        [EVENTHOUSE_URL]: (init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
            controller.abort();
          }),
      }),
      BATCH,
      { signal: controller.signal },
    );
    const envelope = await cancelled.result;
    expect(status(envelope, EVENTHOUSE)).toEqual({ status: "failed", code: "cancelled" });
    expect(status(envelope, KQL_DB)).toEqual({ status: "failed", code: "not-attempted" });
    expect(urls(cancelled.fetchImpl)).toEqual([EVENTHOUSE_URL]);
  });
});

describe("KQL metadata getDefinition structural schema", () => {
  const ONE_DB: KqlMetadataItemInput[] = [{ id: KQL_DB, type: "KQLDatabase" }];
  const schemaOf = (envelope: KqlMetadataStageEnvelope) => envelope.schemas[KQL_DB];

  it("resolves the definition LRO through the canonical operations endpoint only", async () => {
    const { result, fetchImpl } = collect(
      routes({
        [KQL_DB_DEFINITION_URL]: () =>
          new Response(null, {
            status: 202,
            headers: {
              location: `https://private.analysis.windows.net/v1/operations/${OPERATION}`,
              "x-ms-operation-id": OPERATION,
              "retry-after": "30",
            },
          }),
        [OPERATION_URL]: [() => json({ status: "Running" }), () => json({ status: "Succeeded" })],
        [`${OPERATION_URL}/result`]: () => json(schemaDefinition()),
      }),
      ONE_DB,
    );
    const envelope = await result;
    expect(schemaOf(envelope)).toEqual(EXPECTED_SCHEMA);
    expect(urls(fetchImpl)).toEqual([KQL_DB_URL, KQL_DB_DEFINITION_URL, OPERATION_URL, OPERATION_URL, `${OPERATION_URL}/result`]);
    expect(urls(fetchImpl).some((target) => target.includes("analysis.windows.net"))).toBe(false);
  });

  it.each([
    [403, "unsupported", "read-write-permission-required"],
    [401, "unsupported", "read-write-permission-required"],
    [404, "unsupported", "endpoint-unsupported"],
    [423, "unsupported", "encrypted-label-blocked"],
    [409, "failed", "upstream-http-error"],
  ])("maps definition HTTP %s to %s/%s without failing the item properties", async (code, schemaStatus, schemaCode) => {
    const envelope = await collect(
      routes({ [KQL_DB_DEFINITION_URL]: () => json({ message: "private upstream detail" }, { status: code }) }),
      ONE_DB,
    ).result;
    expect(status(envelope, KQL_DB)).toEqual({ status: "complete", code: undefined });
    expect(schemaOf(envelope)).toEqual({ status: schemaStatus, code: schemaCode });
    expect(envelope.artifactMetadata).toEqual({});
    expect(envelope.sections.kqlSchema).toEqual({ status: schemaStatus, code: schemaCode });
    expect(envelope.config).toContainEqual({ itemId: KQL_DB, section: "Metadata capability", label: "KQL schema", value: schemaCode });
    expect(envelope.errors).toEqual(schemaStatus === "failed" ? [`kqlSchema:${KQL_DB}: ${schemaCode}`] : []);
    expect(JSON.stringify(envelope)).not.toContain("private");
  });

  it("reports failed long-running operations with a fixed code", async () => {
    const envelope = await collect(
      routes({
        [KQL_DB_DEFINITION_URL]: () => new Response(null, { status: 202, headers: { "x-ms-operation-id": OPERATION } }),
        [OPERATION_URL]: () => json({ status: "Failed", error: { message: "private" } }),
      }),
      ONE_DB,
    ).result;
    expect(schemaOf(envelope)).toEqual({ status: "failed", code: "operation-failed" });
    expect(envelope.errors).toEqual([`kqlSchema:${KQL_DB}: operation-failed`]);
  });

  it.each([
    ["a traversal part path", { definition: { parts: [{ path: "../DatabaseSchema.kql", payload: "Ly8", payloadType: "InlineBase64" }] } }],
    ["invalid base64", { definition: { parts: [{ path: "DatabaseSchema.kql", payload: "Ly8*", payloadType: "InlineBase64" }] } }],
    ["an unbalanced script", schemaDefinition(".create function F() { T | take 1")],
    ["a non-object definition", [1, 2]],
  ])("fails the schema with %s", async (_name, body) => {
    const envelope = await collect(routes({ [KQL_DB_DEFINITION_URL]: () => json(body) }), ONE_DB).result;
    expect(schemaOf(envelope)).toEqual({ status: "failed", code: "invalid-definition" });
    expect(status(envelope, KQL_DB).status).toBe("complete");
    expect(envelope.sections.kqlSchema).toEqual({ status: "failed", code: "invalid-definition" });
  });

  it("reports a missing schema part as unsupported and unknown parts as forward compatible", async () => {
    const missing = await collect(
      routes({ [KQL_DB_DEFINITION_URL]: () => json({ definition: { parts: [{ path: ".platform", payload: "x", payloadType: "InlineBase64" }] } }) }),
      ONE_DB,
    ).result;
    expect(schemaOf(missing)).toEqual({ status: "unsupported", code: "schema-part-missing" });

    const forward = await collect(
      routes({
        [KQL_DB_DEFINITION_URL]: () =>
          json(schemaDefinition(SCHEMA_SCRIPT, [{ path: "Future/private.kql", payload: "not base64!", payloadType: "Future" }])),
      }),
      ONE_DB,
    ).result;
    expect(schemaOf(forward)).toEqual({ ...EXPECTED_SCHEMA, code: "forward-compatible-parts-skipped", unknownParts: 1 });
    expect(forward.sections.kqlSchema).toEqual({ status: "complete", code: "forward-compatible-parts-skipped" });
  });

  it("marks unprovable declarations partial without returning their content", async () => {
    const script = [
      SCHEMA_SCRIPT,
      ".create external table PrivateExternal (a:string) kind=storage dataformat=csv (h@'https://acct.blob.core.windows.net/c;private-key')",
      ".set-or-append Telemetry <| print DeviceId = 'private-row'",
    ].join("\n");
    const envelope = await collect(routes({ [KQL_DB_DEFINITION_URL]: () => json(schemaDefinition(script)) }), ONE_DB).result;
    expect(schemaOf(envelope)).toEqual({ ...EXPECTED_SCHEMA, code: "partial-unsupported", unsupportedStatements: 2 });
    expect(envelope.sections.kqlSchema).toEqual({ status: "complete", code: "partial-unsupported" });
    expect(envelope.config).toContainEqual({ itemId: KQL_DB, section: "Metadata capability", label: "KQL schema", value: "partial-unsupported" });
    const serialized = JSON.stringify(envelope);
    for (const forbidden of ["private", "PrivateExternal", "blob", "print"]) expect(serialized).not.toContain(forbidden);
  });

  it("bounds definition response bytes and the aggregate schema budget", async () => {
    const declared = await collect(
      routes({ [KQL_DB_DEFINITION_URL]: () => new Response("{}", { headers: { "content-length": String(64 * 1024) } }) }),
      ONE_DB,
      { limits: { maxDefinitionResponseBytes: 1_024 } },
    ).result;
    expect(schemaOf(declared)).toEqual({ status: "failed", code: "response-size-exceeded" });

    const { result, fetchImpl } = collect(
      routes(),
      [{ id: KQL_DB, type: "KQLDatabase" }, { id: EVENTHOUSE, type: "Eventhouse" }],
      { limits: { maxSchemaBytes: 100 } },
    );
    const budgeted = await result;
    expect(schemaOf(budgeted)).toEqual({ status: "failed", code: "response-size-exceeded" });
    expect(status(budgeted, EVENTHOUSE)).toEqual({ status: "failed", code: "not-attempted" });
    expect(budgeted.artifactMetadata).toEqual({});
    expect(urls(fetchImpl)).not.toContain(EVENTHOUSE_URL);
  });

  it("stops on request budget exhaustion during polling and on persistent definition throttling", async () => {
    const polling = await collect(
      routes({
        [KQL_DB_DEFINITION_URL]: () => new Response(null, { status: 202, headers: { "x-ms-operation-id": OPERATION } }),
        [OPERATION_URL]: () => json({ status: "Running" }),
      }),
      [{ id: KQL_DB, type: "KQLDatabase" }, { id: EVENTHOUSE, type: "Eventhouse" }],
      { limits: { maxRequests: 2 } },
    ).result;
    expect(schemaOf(polling)).toEqual({ status: "failed", code: "request-budget-exhausted" });
    expect(status(polling, EVENTHOUSE)).toEqual({ status: "failed", code: "not-attempted" });

    const throttled = await collect(
      routes({ [KQL_DB_DEFINITION_URL]: () => json({}, { status: 429, headers: { "retry-after": "0" } }) }),
      [{ id: KQL_DB, type: "KQLDatabase" }, { id: SHORTCUT_DB, type: "KQLDatabase" }],
    ).result;
    expect(schemaOf(throttled)).toEqual({ status: "failed", code: "rate-limited" });
    expect(status(throttled, SHORTCUT_DB)).toEqual({ status: "failed", code: "not-attempted" });
    expect(throttled.schemas[SHORTCUT_DB]).toEqual({ status: "failed", code: "not-attempted" });
  });
});
