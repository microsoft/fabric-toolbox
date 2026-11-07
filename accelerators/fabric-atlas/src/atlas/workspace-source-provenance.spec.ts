// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { SYNCHRONIZER_AUTHORITY_ID } from "../../rayfin/functions/src/synchronizer-gate";
import type { AppFunctionsSchema } from "../../rayfin/functions/src/types";
import {
  collectWorkspaceSourceProvenance,
  projectMirroringDefinition,
  projectMlvExecutionDefinition,
  projectShortcut,
  validateCollectSourceProvenanceInput,
  workspaceCollectSourceProvenance,
  type CollectSourceProvenanceDependencies,
  type SourceProvenanceItemInput,
  type SourceProvenanceStageEnvelope,
} from "../../rayfin/functions/src/workspace-source-provenance";

const F = "https://api.fabric.microsoft.com";
const WS = "11111111-1111-4111-8111-111111111111";
const OTHER_WS = "22222222-2222-4222-8222-222222222222";
const LAKEHOUSE = "33333333-3333-4333-8333-333333333333";
const WAREHOUSE = "44444444-4444-4444-8444-444444444444";
const MIRROR = "55555555-5555-4555-8555-555555555555";
const NOTEBOOK = "66666666-6666-4666-8666-666666666666";
const TARGET_LH = "77777777-7777-4777-8777-777777777777";
const CONN = "88888888-8888-4888-8888-888888888888";
const CONN2 = "99999999-9999-4999-8999-999999999999";
const ENDPOINT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ENV = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MLV_DEF = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OPERATION = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const TOKEN = "fixture-fabric-token";
const COLLECTED_AT = "2026-10-02T16:00:00.000Z";

type Handler = () => Response;
type Routes = Record<string, Handler | Handler[]>;
type CollectContext = Parameters<typeof workspaceCollectSourceProvenance>[0];

const BATCH: SourceProvenanceItemInput[] = [
  { id: LAKEHOUSE, type: "Lakehouse" },
  { id: WAREHOUSE, type: "Warehouse" },
  { id: MIRROR, type: "MirroredDatabase" },
  { id: NOTEBOOK, type: "Notebook" },
];

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function base64(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function definitionResponse(document: unknown) {
  return {
    definition: {
      parts: [
        { path: "mirroring.json", payload: base64(document), payloadType: "InlineBase64" },
        { path: ".platform", payload: base64({ metadata: {} }), payloadType: "InlineBase64" },
      ],
    },
  };
}

const SNOWFLAKE_MIRRORING = {
  properties: {
    source: {
      type: "Snowflake",
      typeProperties: {
        connection: CONN.toUpperCase(),
        database: "SECRET_SOURCE_DB",
        externalStorages: [{ type: "AmazonS3", typeProperties: { connection: CONN2 } }],
      },
    },
    target: {
      type: "MountedRelationalDatabase",
      typeProperties: { defaultSchema: "dbo", format: "Delta", retentionInDays: 7, enableDeltaChangeDataFeed: true },
    },
    mountedTables: [
      { source: { typeProperties: { schemaName: "dbo", tableName: "orders" } } },
      { source: { typeProperties: { schemaName: "dbo", tableName: "customers" } } },
      { source: { typeProperties: { schemaName: "dbo", tableName: "orders" } } },
    ],
  },
};

function baseRoutes(): Routes {
  const items = `${F}/v1/workspaces/${WS}/items`;
  const mirror = `${F}/v1/workspaces/${WS}/mirroredDatabases/${MIRROR}`;
  return {
    [`GET ${items}/${LAKEHOUSE}/shortcuts`]: () =>
      json({
        value: [
          {
            name: "sales",
            path: "/Tables",
            target: {
              type: "OneLake",
              oneLake: { workspaceId: OTHER_WS.toUpperCase(), itemId: TARGET_LH, path: "Tables/sales" },
            },
          },
          {
            name: "raw",
            path: "Files/landing",
            target: {
              type: "AdlsGen2",
              adlsGen2: {
                connectionId: CONN,
                location: "https://secretaccount.dfs.core.windows.net",
                subpath: "/private-container/folder",
              },
            },
          },
          { name: "noaccess", path: "Files", target: { type: "AmazonS3" } },
        ],
        continuationUri: `${items}/${LAKEHOUSE}/shortcuts?continuationToken=page-2`,
        continuationToken: "page-2",
      }),
    [`GET ${items}/${LAKEHOUSE}/shortcuts?continuationToken=page-2`]: () =>
      json({
        value: [
          {
            name: "docs",
            path: "Files",
            target: {
              type: "OneDriveSharePoint",
              oneDriveSharePoint: {
                connectionId: CONN2,
                location: "https://contoso.sharepoint.com",
                subpath: "/Shared Documents/private",
                updateFabricItemSensitivity: true,
              },
            },
          },
          {
            name: "csv",
            path: "Tables",
            isShortcutTransform: true,
            transform: { type: "csvToDelta", properties: { delimiter: "," } },
            target: { type: "OneLake", oneLake: { workspaceId: WS, itemId: TARGET_LH, path: "Files/csv" } },
          },
        ],
      }),
    [`GET ${F}/v1/workspaces/${WS}/lakehouses/${LAKEHOUSE}/mlvexecutiondefinitions`]: () =>
      json({
        value: [
          {
            id: MLV_DEF,
            displayName: "Gold chain",
            description: "private free text about the chain",
            settings: {
              environment: { referenceType: "ById", itemId: ENV, workspaceId: WS },
              refreshMode: "Optimal",
            },
            currentLakehouseExecutionContext: {
              mode: "Selected",
              selectedMlvs: ["silver.sales_mv", "silver.sales_mv", "gold.revenue_mv"],
            },
            extendedLineageExecutionContext: {
              mode: "Selected",
              selectedLakehouses: [
                { referenceType: "ById", itemId: TARGET_LH, workspaceId: OTHER_WS },
                { referenceType: "ByVariable", variableReference: "$(/**/Lib/Lakehouse)" },
              ],
            },
          },
        ],
      }),
    [`GET ${items}/${WAREHOUSE}/shortcuts`]: () => json({ value: [] }),
    [`GET ${mirror}`]: () =>
      json({
        id: MIRROR,
        type: "MirroredDatabase",
        properties: {
          oneLakeTablesPath: `https://onelake.dfs.fabric.microsoft.com/${WS}/${MIRROR}/Tables`,
          sqlEndpointProperties: {
            connectionString: "secret-host.datawarehouse.fabric.microsoft.com",
            id: ENDPOINT,
            provisioningStatus: "Success",
          },
          defaultSchema: "dbo",
        },
      }),
    [`POST ${mirror}/getDefinition`]: () => json(definitionResponse(SNOWFLAKE_MIRRORING)),
    [`POST ${mirror}/getMirroringStatus`]: () => json({ status: "Running" }),
  };
}

function fabricFetch(table: Routes) {
  const calls = new Map<string, number>();
  return vi.fn<typeof fetch>(async (input, init) => {
    const key = `${init?.method ?? "GET"} ${String(input)}`;
    const route = table[key];
    if (!route) throw new Error(`Unexpected fixture request ${key}`);
    const count = calls.get(key) ?? 0;
    calls.set(key, count + 1);
    return (Array.isArray(route) ? route[Math.min(count, route.length - 1)] : route)();
  });
}

function collect(
  table: Routes = baseRoutes(),
  items: SourceProvenanceItemInput[] = BATCH,
  options: Omit<CollectSourceProvenanceDependencies, "fetch"> = {},
) {
  const fetchImpl = fabricFetch(table);
  const result = collectWorkspaceSourceProvenance(
    TOKEN,
    { workspaceId: WS, correlationId: null, items },
    { wallClock: () => Date.parse(COLLECTED_AT), sleep: vi.fn(async () => undefined), ...options, fetch: fetchImpl },
  );
  return { result, fetchImpl };
}

function item(envelope: SourceProvenanceStageEnvelope, id: string) {
  return envelope.items.find((entry) => entry.id === id)!;
}

function context(findById: () => Promise<unknown>, token = vi.fn(() => TOKEN)): CollectContext {
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

describe("workspaceCollectSourceProvenance contract", () => {
  it("binds only the Fabric audience with a flat typed batch signature", () => {
    const metadata = JSON.parse(readFileSync(resolve("rayfin", "functions", "runtimemetadata.json"), "utf8")) as {
      functions: { functionName: string; contextAudiences: string[]; delegateParameters: Record<string, unknown>[] }[];
    };
    const fn = metadata.functions.find((candidate) => candidate.functionName === "workspaceCollectSourceProvenance");
    expect(fn?.contextAudiences).toEqual(["Fabric"]);
    expect(fn?.delegateParameters).toEqual([
      expect.objectContaining({ name: "ctx", type: "RayfinContext<AtlasSchema, AudienceType.Fabric>" }),
      expect.objectContaining({ name: "protocolVersion", type: "1" }),
      expect.objectContaining({ name: "workspaceId", type: "SyncUuidInput" }),
      expect.objectContaining({ name: "items", type: "SourceProvenanceItemsInput", hasDefault: false }),
      expect.objectContaining({ name: "correlationId", type: "SyncUuidInput | null", hasDefault: true }),
    ]);
  });

  it("generates an exact client contract", () => {
    expectTypeOf<AppFunctionsSchema["workspaceCollectSourceProvenance"]["input"]>().toEqualTypeOf<{
      protocolVersion: 1;
      workspaceId: string;
      items: { id: string; type: string }[];
      correlationId: string | null;
    }>();
    expectTypeOf<AppFunctionsSchema["workspaceCollectSourceProvenance"]["output"]>()
      .toEqualTypeOf<SourceProvenanceStageEnvelope>();
  });

  it("validates a strict bounded batch", () => {
    expect(validateCollectSourceProvenanceInput(1, WS.toUpperCase(), [{ id: LAKEHOUSE.toUpperCase(), type: "Lakehouse" }], null))
      .toEqual({ workspaceId: WS, correlationId: null, items: [{ id: LAKEHOUSE, type: "Lakehouse" }] });
    for (const items of [
      [],
      Array.from({ length: 17 }, (_, index) => ({ id: `${String(index % 9 + 1).repeat(8)}-1111-4111-8111-${String(index).padStart(12, "0")}`, type: "Lakehouse" })),
      [{ id: LAKEHOUSE, type: "Lakehouse" }, { id: LAKEHOUSE.toUpperCase(), type: "Lakehouse" }],
      [{ id: LAKEHOUSE, type: "Lakehouse", url: "https://example.com" }],
      [{ id: LAKEHOUSE, type: "Publisher.Workload.Item" }],
    ]) {
      expect(() => validateCollectSourceProvenanceInput(1, WS, items, null)).toThrow(/protocolVersion 1/);
    }
    expect(() => validateCollectSourceProvenanceInput("1", WS, BATCH, null)).toThrow();
  });
});

describe("workspaceCollectSourceProvenance projection", () => {
  it("keeps explicit OneLake IDs and only connection IDs for external shortcuts", async () => {
    const { result } = collect();
    const envelope = await result;
    expect(item(envelope, LAKEHOUSE).shortcuts).toEqual({
      status: "complete",
      truncated: false,
      shortcuts: [
        {
          name: "sales",
          path: "/Tables",
          targetType: "OneLake",
          oneLake: { workspaceId: OTHER_WS, itemId: TARGET_LH, path: "Tables/sales" },
        },
        { name: "raw", path: "Files/landing", targetType: "AdlsGen2", connectionId: CONN },
        { name: "noaccess", path: "Files", targetType: "AmazonS3" },
        {
          name: "docs",
          path: "Files",
          targetType: "OneDriveSharePoint",
          connectionId: CONN2,
          sensitivityLabelSyncRequested: true,
        },
        {
          name: "csv",
          path: "Tables",
          targetType: "OneLake",
          oneLake: { workspaceId: WS, itemId: TARGET_LH, path: "Files/csv" },
          transformType: "csvToDelta",
        },
      ],
    });
    expect(JSON.stringify(envelope)).not.toMatch(/dfs\.core|sharepoint\.com|private-container|Shared Documents/);
  });

  it("projects MLV execution definitions as Lakehouse-adjacent scope without free text", async () => {
    const { result } = collect();
    const envelope = await result;
    expect(item(envelope, LAKEHOUSE).materializedLakeViews).toEqual({
      status: "complete",
      truncated: false,
      definitions: [
        {
          id: MLV_DEF,
          displayName: "Gold chain",
          refreshMode: "Optimal",
          viewSelection: "Selected",
          selectedViews: ["silver.sales_mv", "gold.revenue_mv"],
          lineageSelection: "Selected",
          lakehouses: [{ workspaceId: OTHER_WS, itemId: TARGET_LH }],
          variableReferences: 1,
          environment: { workspaceId: WS, itemId: ENV },
          truncated: false,
        },
      ],
    });
    expect(JSON.stringify(envelope)).not.toContain("private free text");
  });

  it("projects documented mirroring evidence without source names or URLs", async () => {
    const { result } = collect();
    const envelope = await result;
    const mirroring = item(envelope, MIRROR).mirroring!;
    expect(mirroring.properties).toEqual({ status: "complete", sqlEndpointId: ENDPOINT, defaultSchema: "dbo" });
    expect(mirroring.definition).toEqual({
      status: "complete",
      sourceType: "Snowflake",
      connectionId: CONN,
      externalStorages: [{ type: "AmazonS3", connectionId: CONN2 }],
      targetType: "MountedRelationalDatabase",
      targetFormat: "Delta",
      defaultSchema: "dbo",
      retentionInDays: 7,
      changeDataFeed: true,
      tableSelection: "selected",
      tables: [
        { schema: "dbo", table: "orders" },
        { schema: "dbo", table: "customers" },
      ],
      tablesTruncated: false,
    });
    expect(mirroring.replication).toEqual({ status: "complete", state: "Running" });
    expect(mirroring.status).toBe("complete");
    expect(JSON.stringify(envelope)).not.toMatch(/SECRET_SOURCE_DB|onelake\.dfs|datawarehouse/);
  });

  it("marks unrelated item types unsupported without calling Fabric", async () => {
    const { result, fetchImpl } = collect();
    const envelope = await result;
    expect(item(envelope, NOTEBOOK)).toEqual({ id: NOTEBOOK, type: "Notebook", status: "unsupported", code: "item-type-unsupported" });
    expect(fetchImpl.mock.calls.map(([url]) => String(url)).some((url) => url.includes(NOTEBOOK))).toBe(false);
    expect(envelope).toMatchObject({
      contractVersion: 1,
      stage: "source-provenance",
      authoritative: false,
      workspaceId: WS,
      collectedAt: COLLECTED_AT,
      summary: { status: "complete" },
    });
    expect(JSON.stringify(envelope)).not.toContain(TOKEN);
  });

  it("treats denied reads as unsupported enrichment without failing other sections", async () => {
    const table = baseRoutes();
    table[`GET ${F}/v1/workspaces/${WS}/items/${WAREHOUSE}/shortcuts`] = () => json({ message: "denied" }, { status: 403 });
    table[`POST ${F}/v1/workspaces/${WS}/mirroredDatabases/${MIRROR}/getDefinition`] = () => json({}, { status: 403 });
    const envelope = await collect(table).result;
    expect(item(envelope, WAREHOUSE)).toMatchObject({
      status: "unsupported",
      code: "authorization-failed",
      shortcuts: { status: "unsupported", code: "authorization-failed", shortcuts: [] },
    });
    expect(item(envelope, MIRROR).mirroring).toMatchObject({
      status: "complete",
      code: "partial-unsupported",
      properties: { status: "complete", sqlEndpointId: ENDPOINT },
      definition: { status: "unsupported", code: "read-write-permission-required", tables: [] },
      replication: { status: "complete", state: "Running" },
    });
    expect(envelope.summary).toEqual({ status: "complete", code: "partial-unsupported" });
  });

  it("polls a long-running definition through the canonical operation route", async () => {
    const table = baseRoutes();
    table[`POST ${F}/v1/workspaces/${WS}/mirroredDatabases/${MIRROR}/getDefinition`] = () =>
      new Response(null, { status: 202, headers: { "x-ms-operation-id": OPERATION, "retry-after": "1" } });
    table[`GET ${F}/v1/operations/${OPERATION}`] = () => json({ status: "Succeeded" });
    table[`GET ${F}/v1/operations/${OPERATION}/result`] = () => json(definitionResponse(SNOWFLAKE_MIRRORING));
    const envelope = await collect(table, [{ id: MIRROR, type: "MirroredDatabase" }]).result;
    expect(item(envelope, MIRROR).mirroring?.definition).toMatchObject({ status: "complete", sourceType: "Snowflake" });
  });

  it("stops the batch on deferred throttling and marks remaining work not attempted", async () => {
    const table = baseRoutes();
    table[`GET ${F}/v1/workspaces/${WS}/items/${LAKEHOUSE}/shortcuts`] = () =>
      json({}, { status: 429, headers: { "retry-after": "60" } });
    const { result, fetchImpl } = collect(table);
    const envelope = await result;
    expect(envelope.stopCode).toBe("retry-after-deferred");
    expect(item(envelope, LAKEHOUSE).shortcuts).toMatchObject({ status: "failed", code: "retry-after-deferred" });
    expect(item(envelope, LAKEHOUSE).materializedLakeViews).toMatchObject({ status: "failed", code: "not-attempted" });
    expect(item(envelope, MIRROR).mirroring).toMatchObject({ status: "failed", code: "not-attempted" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("truncates bounded lists explicitly", async () => {
    const envelope = await collect(baseRoutes(), [{ id: LAKEHOUSE, type: "Lakehouse" }], {
      limits: { maxShortcutsPerItem: 2 },
    }).result;
    expect(item(envelope, LAKEHOUSE).shortcuts).toMatchObject({
      status: "complete",
      code: "projection-truncated",
      truncated: true,
    });
    expect(item(envelope, LAKEHOUSE).shortcuts?.shortcuts).toHaveLength(2);
  });

  it("fails a section on a response that violates the documented contract", async () => {
    const table = baseRoutes();
    table[`GET ${F}/v1/workspaces/${WS}/items/${WAREHOUSE}/shortcuts`] = () =>
      json({ value: [{ name: "bad", path: "Tables", target: { type: "OneLake", oneLake: { workspaceId: WS, itemId: "by-name" } } }] });
    const envelope = await collect(table, [{ id: WAREHOUSE, type: "Warehouse" }]).result;
    expect(item(envelope, WAREHOUSE).shortcuts).toMatchObject({ status: "failed", code: "invalid-definition", shortcuts: [] });
  });
});

describe("source provenance projections", () => {
  it("keeps an SAP landing zone only by explicit Fabric IDs", () => {
    const definition = projectMirroringDefinition(
      definitionResponse({
        properties: {
          source: {
            type: "SAP",
            typeProperties: {
              subType: "Datasphere",
              landingZone: {
                type: "Lakehouse",
                typeProperties: { connection: CONN, workspaceId: WS, artifactId: TARGET_LH, rootFolder: "Files/private" },
              },
            },
          },
          target: { type: "MountedRelationalDatabase", typeProperties: { format: "Delta" } },
        },
      }),
    );
    expect(definition).toEqual({
      sourceType: "SAP",
      sourceSubType: "Datasphere",
      externalStorages: [],
      landingZone: { type: "Lakehouse", connectionId: CONN, workspaceId: WS, itemId: TARGET_LH },
      targetType: "MountedRelationalDatabase",
      targetFormat: "Delta",
      tableSelection: "all",
      tables: [],
      tablesTruncated: false,
    });
  });

  it("rejects undecodable or oversized definition parts", () => {
    expect(() => projectMirroringDefinition({ definition: { parts: [{ path: "mirroring.json", payload: "%%%", payloadType: "InlineBase64" }] } })).toThrow();
    expect(() =>
      projectMirroringDefinition(definitionResponse(SNOWFLAKE_MIRRORING), {
        maxDecodedPartBytes: 16,
        maxMountedTables: 10,
        maxExternalStorages: 2,
      }),
    ).toThrow();
  });

  it("never resolves Variable Library references or unknown reference kinds", () => {
    expect(
      projectMlvExecutionDefinition({
        id: MLV_DEF,
        displayName: "All views",
        currentLakehouseExecutionContext: { mode: "All" },
        extendedLineageExecutionContext: {
          mode: "Selected",
          selectedLakehouses: [{ referenceType: "ByVariable", variableReference: "$(/**/Lib/Lake)" }],
        },
      }),
    ).toMatchObject({ viewSelection: "All", selectedViews: [], lakehouses: [], variableReferences: 1 });
    expect(() =>
      projectMlvExecutionDefinition({
        id: MLV_DEF,
        displayName: "By name",
        extendedLineageExecutionContext: { selectedLakehouses: [{ referenceType: "ByName", name: "Sales" }] },
      }),
    ).toThrow();
  });

  it("drops undocumented shortcut target fields", () => {
    expect(
      projectShortcut({
        name: "s3",
        path: "Files",
        target: {
          type: "S3Compatible",
          s3Compatible: { connectionId: CONN, location: "https://s3.contoso.com", bucket: "private", subpath: "/x" },
        },
      }),
    ).toEqual({ name: "s3", path: "Files", targetType: "S3Compatible", connectionId: CONN });
  });
});

describe("workspaceCollectSourceProvenance authorization", () => {
  it("requires the synchronizer before reading the application token", async () => {
    const token = vi.fn(() => TOKEN);
    await expect(
      workspaceCollectSourceProvenance(context(async () => null, token), 1, WS, BATCH, null, { fetch: vi.fn() }),
    ).rejects.toThrow("Source provenance collection requires the configured Atlas synchronizer.");
    expect(token).not.toHaveBeenCalled();
  });

  it("collects as the synchronizer with the Fabric application token", async () => {
    const fetchImpl = fabricFetch(baseRoutes());
    const envelope = await workspaceCollectSourceProvenance(
      context(async () => ({ id: SYNCHRONIZER_AUTHORITY_ID, createdAt: new Date() })),
      1,
      WS,
      [{ id: MIRROR, type: "MirroredDatabase" }],
      null,
      { fetch: fetchImpl },
    );
    expect(envelope.items[0].status).toBe("complete");
    expect(fetchImpl.mock.calls[0][1]?.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
  });
});
