// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
// The SDK is installed only in the Functions package; import its enum module directly.
import { AudienceType } from "../../rayfin/functions/node_modules/@microsoft/fabric-user-data-functions/dist/types/connection.js";
import {
  SQL_CATALOG_QUERIES,
  SqlDriverError,
  type SqlCatalogDriver,
  type SqlCatalogQueryName,
  type SqlConnectOptions,
  type SqlConnectionTarget,
  type SqlQueryOptions,
  type SqlQueryParameter,
} from "../../rayfin/functions/src/sql-catalog";
import { SYNCHRONIZER_AUTHORITY_ID } from "../../rayfin/functions/src/synchronizer-gate";
import type { AppFunctionsSchema } from "../../rayfin/functions/src/types";
import {
  collectWorkspaceSqlMetadata,
  validateCollectSqlMetadataInput,
  workspaceCollectSqlMetadata,
  type CollectSqlMetadataDependencies,
  type SqlMetadataItemInput,
  type SqlMetadataStageEnvelope,
} from "../../rayfin/functions/src/workspace-sql-metadata";
import { buildCatalogObjects } from "./catalog-objects";
import type { Item, ModelTableSchema } from "./model";

const WS = "11111111-1111-4111-8111-111111111111";
const SQL_DB = "22222222-2222-4222-8222-222222222222";
const WAREHOUSE = "33333333-3333-4333-8333-333333333333";
const LAKEHOUSE = "44444444-4444-4444-8444-444444444444";
const SQL_ENDPOINT = "55555555-5555-4555-8555-555555555555";
const NOTEBOOK = "66666666-6666-4666-8666-666666666666";
const SECOND_DB = "77777777-7777-4777-8777-777777777777";
const CORRELATION = "88888888-8888-4888-8888-888888888888";
const MIRROR = "99999999-9999-4999-8999-999999999999";
const MIRROR_ENDPOINT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FABRIC_TOKEN = "fixture-fabric-token";
const SQL_TOKEN = "fixture-sql-token";
const BASE = `https://api.fabric.microsoft.com/v1/workspaces/${WS}`;
const SQL_DB_URL = `${BASE}/sqlDatabases/${SQL_DB}`;
const SECOND_DB_URL = `${BASE}/sqlDatabases/${SECOND_DB}`;
const WAREHOUSE_URL = `${BASE}/warehouses/${WAREHOUSE}`;
const LAKEHOUSE_URL = `${BASE}/lakehouses/${LAKEHOUSE}`;
const LAKEHOUSE_TABLES_URL = `${LAKEHOUSE_URL}/tables?maxResults=100`;
const MIRROR_URL = `${BASE}/mirroredDatabases/${MIRROR}`;
const DB_HOST = "fixture-db.database.fabric.microsoft.com";
const DW_HOST = "fixture-dw.datawarehouse.fabric.microsoft.com";
const LH_HOST = "fixture-lh.datawarehouse.fabric.microsoft.com";
const DB_NAME = "SalesDb-22222222";
const SECOND_DB_NAME = "Finance (prod)";

type Handler = (init?: RequestInit) => Response | Promise<Response>;
type Routes = Record<string, Handler | Handler[]>;
type Rows = Record<string, unknown>[];
type FakeCatalog = Partial<Record<SqlCatalogQueryName, Rows>> & {
  connectErrors?: unknown[];
  queryErrors?: Partial<Record<SqlCatalogQueryName, unknown>>;
  onQuery?: (name: SqlCatalogQueryName, options: SqlQueryOptions) => void | Promise<void>;
};
type QueryCall = { database: string; name: SqlCatalogQueryName; text: string; parameters: SqlQueryParameter[]; options: SqlQueryOptions };
type ConnectCall = { target: SqlConnectionTarget; token: string; options: SqlConnectOptions };

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function sqlDatabase(properties: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}) {
  return {
    id: SQL_DB.toUpperCase(),
    type: "SQLDatabase",
    displayName: "Sales DB",
    description: "private database description",
    workspaceId: WS,
    properties: {
      connectionString: `Data Source=${DB_HOST},1433;Initial Catalog=${DB_NAME};Encrypt=True;Password=private-secret`,
      databaseName: DB_NAME,
      serverFqdn: `${DB_HOST},1433`,
      collation: "SQL_Latin1_General_CP1_CI_AS",
      backupRetentionDays: 7,
      ...properties,
    },
    ...overrides,
  };
}

function warehouse(properties: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}) {
  return {
    id: WAREHOUSE,
    type: "Warehouse",
    displayName: "Gold DW",
    description: "private warehouse description",
    workspaceId: WS,
    properties: {
      connectionString: DW_HOST,
      createdDate: "2026-01-02T03:04:05.1234567Z",
      lastUpdatedTime: "2026-02-03T04:05:06",
      collationType: "Latin1_General_100_BIN2_UTF8",
      ...properties,
    },
    ...overrides,
  };
}

function lakehouse(endpoint: Record<string, unknown> | null = {}, overrides: Record<string, unknown> = {}) {
  return {
    id: LAKEHOUSE,
    type: "Lakehouse",
    displayName: "Bronze",
    workspaceId: WS,
    properties: {
      oneLakeTablesPath: `https://onelake.dfs.fabric.microsoft.com/${WS}/${LAKEHOUSE}/Tables`,
      oneLakeFilesPath: "private-files-path",
      ...(endpoint === null
        ? {}
        : {
            sqlEndpointProperties: {
              connectionString: LH_HOST,
              id: SQL_ENDPOINT,
              provisioningStatus: "Success",
              ...endpoint,
            },
          }),
    },
    ...overrides,
  };
}

function mirroredDatabase(
  endpoint: Record<string, unknown> = {},
  overrides: Record<string, unknown> = {},
) {
  return {
    id: MIRROR,
    type: "MirroredDatabase",
    displayName: "Demo Oracle mirror",
    workspaceId: WS,
    properties: {
      defaultSchema: "DEMO_DW",
      sqlEndpointProperties: {
        connectionString: LH_HOST,
        id: MIRROR_ENDPOINT,
        provisioningStatus: "Success",
        ...endpoint,
      },
    },
    ...overrides,
  };
}

function routes(overrides: Routes = {}): Routes {
  return {
    [SQL_DB_URL]: () => json(sqlDatabase()),
    [SECOND_DB_URL]: () => json(sqlDatabase({ databaseName: SECOND_DB_NAME }, { id: SECOND_DB })),
    [WAREHOUSE_URL]: () => json(warehouse()),
    [LAKEHOUSE_URL]: () => json(lakehouse()),
    [LAKEHOUSE_TABLES_URL]: () => json({
      data: [{ name: "trips", schema: "dbo", type: "Table", columns: [] }],
    }),
    [MIRROR_URL]: () => json(mirroredDatabase()),
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

function objectRow(objectId: number, schema: string, name: string, type: "U" | "V", columnId: number | null, column: string | null, dataType: string | null) {
  return {
    object_id: objectId,
    schema_name: schema,
    object_name: name,
    object_type: `${type} `,
    column_id: columnId,
    column_name: column,
    type_name: dataType,
  };
}

const SALES_CATALOG: FakeCatalog = {
  objects: [
    objectRow(10, "dbo", "Customers", "U", 1, "CustomerId", "int"),
    objectRow(10, "dbo", "Customers", "U", 2, "Name", "nvarchar"),
    objectRow(11, "dbo", "Orders", "U", 1, "OrderId", "bigint"),
    objectRow(11, "dbo", "Orders", "U", 2, "CustomerId", "int"),
    objectRow(12, "sales", "OrderSummary", "V", 1, "CustomerId", "int"),
  ],
  schemas: [{ schema_name: "dbo" }, { schema_name: "sales" }, { schema_name: "staging" }],
  primaryKeys: [
    { constraint_id: 100, schema_name: "dbo", table_name: "Customers", constraint_name: "PK_Customers", column_name: "CustomerId", key_ordinal: 1 },
  ],
  foreignKeys: [
    {
      constraint_id: 200,
      constraint_name: "FK_Orders_Customers",
      source_schema: "dbo",
      source_table: "Orders",
      source_column: "CustomerId",
      target_schema: "dbo",
      target_table: "Customers",
      target_column: "CustomerId",
      key_ordinal: 1,
    },
  ],
};

const WAREHOUSE_CATALOG: FakeCatalog = {
  objects: [
    objectRow(20, "gold", "FactSales", "U", 1, "Amount", "decimal"),
    objectRow(21, "gold", "vSales", "V", 1, "Amount", "decimal"),
  ],
  schemas: [{ schema_name: "gold" }],
  primaryKeys: [],
  foreignKeys: [],
};

const LAKEHOUSE_CATALOG: FakeCatalog = {
  objects: [objectRow(30, "dbo", "trips", "U", 1, "trip_id", "varchar")],
  schemas: [{ schema_name: "dbo" }],
  primaryKeys: [],
  foreignKeys: [],
};

function catalogs(overrides: Record<string, FakeCatalog> = {}): Record<string, FakeCatalog> {
  return {
    [DB_NAME]: SALES_CATALOG,
    [SECOND_DB_NAME]: SALES_CATALOG,
    [WAREHOUSE]: WAREHOUSE_CATALOG,
    [SQL_ENDPOINT]: LAKEHOUSE_CATALOG,
    [MIRROR_ENDPOINT]: {
      objects: [
        objectRow(40, "DEMO_DW", "DIM_STORE", "U", 1, "STORE_ID", "int"),
        objectRow(40, "DEMO_DW", "DIM_STORE", "U", 2, "STORE_NAME", "varchar"),
      ],
      schemas: [{ schema_name: "DEMO_DW" }],
      primaryKeys: [],
      foreignKeys: [],
    },
    ...overrides,
  };
}

const QUERY_NAMES = new Map(Object.entries(SQL_CATALOG_QUERIES).map(([name, text]) => [text, name as SqlCatalogQueryName]));

function fakeDriver(table: Record<string, FakeCatalog> = catalogs()) {
  const connects: ConnectCall[] = [];
  const queries: QueryCall[] = [];
  const closed: string[] = [];
  const attempts = new Map<string, number>();
  const driver: SqlCatalogDriver = {
    async connect(target, token, options) {
      connects.push({ target, token, options });
      const catalog = table[target.database];
      if (!catalog) throw new Error(`Unexpected database ${target.database}`);
      const attempt = attempts.get(target.database) ?? 0;
      attempts.set(target.database, attempt + 1);
      const connectError = catalog.connectErrors?.[attempt];
      if (connectError) throw connectError;
      return {
        async query(text, parameters, queryOptions) {
          const name = QUERY_NAMES.get(text);
          if (!name) throw new Error("Unexpected SQL text");
          queries.push({ database: target.database, name, text, parameters: [...parameters], options: queryOptions });
          await catalog.onQuery?.(name, queryOptions);
          const error = catalog.queryErrors?.[name];
          if (error) throw error;
          const rows = catalog[name] ?? [];
          return { rows: rows.slice(0, queryOptions.maxRows), truncated: rows.length > queryOptions.maxRows };
        },
        async close() {
          closed.push(target.database);
        },
      };
    },
  };
  return { driver, connects, queries, closed };
}

const BATCH: SqlMetadataItemInput[] = [
  { id: SQL_DB, type: "SQLDatabase" },
  { id: WAREHOUSE, type: "Warehouse" },
  { id: LAKEHOUSE, type: "Lakehouse" },
];

function collect(
  table: Routes = routes(),
  items: SqlMetadataItemInput[] = BATCH,
  options: Omit<CollectSqlMetadataDependencies, "fetch" | "sqlDriver"> & { catalogs?: Record<string, FakeCatalog>; sqlToken?: string | null } = {},
) {
  const fetchImpl = fabricFetch(table);
  const sql = fakeDriver(options.catalogs ?? catalogs());
  const sleep = options.sleep ?? vi.fn(async () => undefined);
  const { catalogs: _catalogs, sqlToken, ...dependencies } = options;
  void _catalogs;
  const result = collectWorkspaceSqlMetadata(
    { fabric: FABRIC_TOKEN, sql: sqlToken === null ? undefined : (sqlToken ?? SQL_TOKEN) },
    { workspaceId: WS, correlationId: null, items },
    { ...dependencies, fetch: fetchImpl, sleep, sqlDriver: sql.driver },
  );
  return { result, fetchImpl, sql, sleep };
}

function urls(fetchImpl: ReturnType<typeof fabricFetch>): string[] {
  return fetchImpl.mock.calls.map(([input]) => String(input));
}

function itemStatus(envelope: SqlMetadataStageEnvelope, id: string) {
  const item = envelope.items.find((candidate) => candidate.id === id);
  return { status: item?.status, code: item?.code };
}

function catalogStatus(envelope: SqlMetadataStageEnvelope, id: string) {
  return { status: envelope.catalogs[id]?.status, code: envelope.catalogs[id]?.code };
}

type CollectContext = Parameters<typeof workspaceCollectSqlMetadata>[0];

function context(
  findById: () => Promise<unknown>,
  fabric: () => string = () => FABRIC_TOKEN,
  sql: () => string = () => SQL_TOKEN,
): CollectContext {
  return {
    getDataClient: () => ({
      SynchronizerAuthority: { findById, create: vi.fn().mockRejectedValue(new Error("denied")) },
    }),
    Tokens: {
      get Fabric() {
        return fabric();
      },
      get Sql() {
        return sql();
      },
    },
  } as unknown as CollectContext;
}

const authorized = async () => ({ id: SYNCHRONIZER_AUTHORITY_ID, createdAt: new Date() });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SQL metadata identity and audience boundary", () => {
  it("uses only documented Rayfin 1.36.2 audiences", () => {
    expect(Object.values(AudienceType)).toEqual(["Sql", "Storage", "Fabric", "AzureAI", "ADO"]);
  });

  it("binds exactly the Fabric and Sql audiences with a flat typed batch signature", () => {
    const metadata = JSON.parse(readFileSync(resolve("rayfin", "functions", "runtimemetadata.json"), "utf8")) as {
      functions: { functionName: string; contextAudiences: string[]; delegateParameters: Record<string, unknown>[] }[];
    };
    for (const fn of metadata.functions) {
      expect(fn.contextAudiences.every((audience) => Object.values(AudienceType).includes(audience as AudienceType))).toBe(true);
    }
    const fn = metadata.functions.find((candidate) => candidate.functionName === "workspaceCollectSqlMetadata");
    expect(fn?.contextAudiences).toEqual(["Fabric", "Sql"]);
    expect(fn?.delegateParameters).toEqual([
      expect.objectContaining({ name: "ctx", type: "RayfinContext<AtlasSchema, AudienceType.Fabric | AudienceType.Sql>" }),
      expect.objectContaining({ name: "protocolVersion", type: "1" }),
      expect.objectContaining({ name: "workspaceId", type: "SyncUuidInput" }),
      expect.objectContaining({ name: "items", type: "SqlMetadataItemsInput", hasDefault: false }),
      expect.objectContaining({ name: "correlationId", type: "SyncUuidInput | null", hasDefault: true }),
    ]);
  });

  it("generates exact client types without token, URL, endpoint or connection-string inputs", () => {
    expectTypeOf<AppFunctionsSchema["workspaceCollectSqlMetadata"]["input"]>().toEqualTypeOf<{
      protocolVersion: 1;
      workspaceId: string;
      items: { id: string; type: string }[];
      correlationId: string | null;
    }>();
    expectTypeOf<AppFunctionsSchema["workspaceCollectSqlMetadata"]["output"]>().toEqualTypeOf<SqlMetadataStageEnvelope>();
  });

  it("fails closed before reading either token, calling Fabric or opening SQL", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fabric = vi.fn(() => FABRIC_TOKEN);
    const sql = vi.fn(() => SQL_TOKEN);
    const fetchImpl = vi.fn<typeof fetch>();
    const { driver, connects } = fakeDriver();
    await expect(
      workspaceCollectSqlMetadata(context(vi.fn().mockRejectedValue(new Error("denied")), fabric, sql), 1, WS, BATCH, null, {
        fetch: fetchImpl,
        sqlDriver: driver,
      }),
    ).rejects.toThrow("SQL metadata collection requires the configured Atlas administrator.");
    expect(fabric).not.toHaveBeenCalled();
    expect(sql).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(connects).toEqual([]);
  });

  it("returns a fixed error when the declared Fabric token is unavailable", async () => {
    const failure = workspaceCollectSqlMetadata(
      context(authorized, () => {
        throw new Error(`binding failed for ${FABRIC_TOKEN}`);
      }),
      1,
      WS,
      BATCH,
      CORRELATION,
    );
    await expect(failure).rejects.toThrow("The Fabric application token was unavailable.");
    await expect(failure).rejects.not.toThrow(FABRIC_TOKEN);
  });

  it("uses the Fabric token only for REST and the Sql token only for TDS", async () => {
    const fetchImpl = fabricFetch(routes());
    const { driver, connects } = fakeDriver();
    const envelope = await workspaceCollectSqlMetadata(context(authorized), 1, WS, BATCH, CORRELATION, {
      fetch: fetchImpl,
      sqlDriver: driver,
      sleep: async () => undefined,
    });
    expect(envelope.correlationId).toBe(CORRELATION);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init).toMatchObject({ method: "GET", redirect: "manual", headers: { Authorization: `Bearer ${FABRIC_TOKEN}` } });
      expect(init?.body).toBeUndefined();
    }
    expect(connects.map((call) => call.token)).toEqual([SQL_TOKEN, SQL_TOKEN, SQL_TOKEN]);
  });

  it("keeps item properties when the Sql audience token was not minted", async () => {
    const fetchImpl = fabricFetch(routes());
    const { driver, connects } = fakeDriver();
    const envelope = await workspaceCollectSqlMetadata(
      context(authorized, () => FABRIC_TOKEN, () => {
        throw new Error("Sql not minted");
      }),
      1,
      WS,
      BATCH,
      null,
      { fetch: fetchImpl, sqlDriver: driver },
    );
    expect(connects).toEqual([]);
    expect(envelope.items.map((item) => item.status)).toEqual(["complete", "complete", "complete"]);
    for (const id of [SQL_DB, WAREHOUSE]) {
      expect(catalogStatus(envelope, id)).toEqual({ status: "unsupported", code: "token-unavailable" });
    }
    expect(catalogStatus(envelope, LAKEHOUSE)).toEqual({ status: "complete", code: "partial-unsupported" });
    expect(envelope.sections.sqlSchema).toEqual({ status: "complete", code: "partial-unsupported" });
    expect(envelope.schema[LAKEHOUSE]).toEqual([{
      name: "dbo.trips",
      objectType: "Table",
      source: "Fabric Lakehouse Tables REST",
      columns: [],
      measures: [],
    }]);
    expect(envelope.errors).toEqual([]);
  });
});

describe("SQL metadata input validation", () => {
  it.each([
    ["string protocol", "1", WS, [{ id: SQL_DB, type: "SQLDatabase" }], null],
    ["non-UUID workspace", 1, "workspace", [{ id: SQL_DB, type: "SQLDatabase" }], null],
    ["empty batch", 1, WS, [], null],
    ["oversized batch", 1, WS, Array.from({ length: 9 }, (_, index) => ({
      id: `${String(index + 1).repeat(8)}-1111-4111-8111-111111111111`,
      type: "SQLDatabase",
    })), null],
    ["duplicate items", 1, WS, [{ id: SQL_DB, type: "SQLDatabase" }, { id: SQL_DB.toUpperCase(), type: "Warehouse" }], null],
    ["a server field", 1, WS, [{ id: SQL_DB, type: "SQLDatabase", server: DB_HOST }], null],
    ["a connection string field", 1, WS, [{ id: SQL_DB, type: "SQLDatabase", connectionString: "Server=evil" }], null],
    ["a token field", 1, WS, [{ id: SQL_DB, type: "SQLDatabase", token: SQL_TOKEN }], null],
    ["a SQL-like item ID", 1, WS, [{ id: "1' OR '1'='1", type: "SQLDatabase" }], null],
    ["a path-like type", 1, WS, [{ id: SQL_DB, type: "sqlDatabases/../x" }], null],
    ["a SQL-like type", 1, WS, [{ id: SQL_DB, type: "Warehouse;DROP" }], null],
    ["an empty correlation", 1, WS, [{ id: SQL_DB, type: "SQLDatabase" }], ""],
  ])("rejects %s with a fixed message", (_name, protocolVersion, workspaceId, items, correlationId) => {
    expect(() => validateCollectSqlMetadataInput(protocolVersion, workspaceId, items, correlationId)).toThrow(
      "Use protocolVersion 1, a strict workspace UUID, 1-8 unique {id, type} items and a strict correlation UUID or null.",
    );
  });
});

describe("SQL metadata trusted coordinates and mixed batches", () => {
  it("collects SQL Database, Warehouse and Lakehouse SQL endpoint catalogs as distinct endpoints", async () => {
    const items: SqlMetadataItemInput[] = [
      ...BATCH,
      { id: SQL_ENDPOINT, type: "SQLEndpoint" },
      { id: NOTEBOOK, type: "Notebook" },
    ];
    const { result, fetchImpl, sql } = collect(routes(), items);
    const envelope = await result;

    expect(urls(fetchImpl)).toEqual([SQL_DB_URL, WAREHOUSE_URL, LAKEHOUSE_URL, LAKEHOUSE_TABLES_URL]);
    expect(sql.connects.map((call) => call.target)).toEqual([
      { kind: "sql-database", server: DB_HOST, port: 1433, database: DB_NAME, readOnlyIntent: true },
      { kind: "warehouse", server: DW_HOST, port: 1433, database: WAREHOUSE, readOnlyIntent: false },
      { kind: "lakehouse-sql-endpoint", server: LH_HOST, port: 1433, database: SQL_ENDPOINT, readOnlyIntent: false },
    ]);
    expect(sql.closed).toEqual([DB_NAME, WAREHOUSE, SQL_ENDPOINT]);
    expect(envelope).toMatchObject({ contractVersion: 1, stage: "sql-metadata", authoritative: false, workspaceId: WS, errors: [] });
    expect(envelope).not.toHaveProperty("correlationId");
    expect(envelope.items).toEqual([
      { id: SQL_DB, type: "SQLDatabase", status: "complete", endpointKind: "sql-database" },
      { id: WAREHOUSE, type: "Warehouse", status: "complete", endpointKind: "warehouse" },
      { id: LAKEHOUSE, type: "Lakehouse", status: "complete", endpointKind: "lakehouse-sql-endpoint", sqlEndpointId: SQL_ENDPOINT },
      { id: SQL_ENDPOINT, type: "SQLEndpoint", status: "unsupported", code: "parent-item-required" },
      { id: NOTEBOOK, type: "Notebook", status: "unsupported", code: "item-type-unsupported" },
    ]);
    expect(envelope.catalogs).toEqual({
      [SQL_DB]: {
        status: "complete",
        source: "fabric-sql-database-catalog",
        schemas: ["dbo", "sales", "staging"],
        tables: 2,
        views: 1,
        columns: 5,
        primaryKeys: 1,
        foreignKeys: 1,
        structure: { status: "complete" },
      },
      [WAREHOUSE]: {
        status: "complete",
        source: "fabric-warehouse-catalog",
        schemas: ["gold"],
        tables: 1,
        views: 1,
        columns: 2,
        primaryKeys: 0,
        foreignKeys: 0,
        structure: { status: "complete" },
      },
      [LAKEHOUSE]: {
        status: "complete",
        source: "fabric-lakehouse-rest-and-sql-catalog",
        schemas: ["dbo"],
        tables: 1,
        views: 0,
        columns: 1,
        primaryKeys: 0,
        foreignKeys: 0,
        structure: { status: "complete" },
        lakehouseTables: { status: "complete" },
      },
    });
    expect(envelope.schema).toEqual({
      [SQL_DB]: [
        {
          name: "dbo.Customers",
          objectType: "SQL table",
          source: "Fabric SQL system catalog",
          columns: [{ name: "CustomerId", dataType: "int" }, { name: "Name", dataType: "nvarchar" }],
          measures: [],
        },
        {
          name: "dbo.Orders",
          objectType: "SQL table",
          source: "Fabric SQL system catalog",
          columns: [{ name: "OrderId", dataType: "bigint" }, { name: "CustomerId", dataType: "int" }],
          measures: [],
        },
        {
          name: "sales.OrderSummary",
          objectType: "SQL view",
          source: "Fabric SQL system catalog",
          columns: [{ name: "CustomerId", dataType: "int" }],
          measures: [],
        },
      ],
      [WAREHOUSE]: [
        { name: "gold.FactSales", objectType: "SQL table", source: "Fabric Warehouse system catalog", columns: [{ name: "Amount", dataType: "decimal" }], measures: [] },
        { name: "gold.vSales", objectType: "SQL view", source: "Fabric Warehouse system catalog", columns: [{ name: "Amount", dataType: "decimal" }], measures: [] },
      ],
      [LAKEHOUSE]: [
        {
          name: "dbo.trips",
          objectType: "SQL endpoint table",
          source: "Fabric SQL analytics endpoint system catalog",
          columns: [{ name: "trip_id", dataType: "varchar" }],
          measures: [],
        },
      ],
    });
    expect(envelope.artifactMetadata).toEqual({});
    expect(envelope.config).toEqual([
      { itemId: SQL_DB, section: "SQL database", label: "Database name", value: DB_NAME },
      { itemId: SQL_DB, section: "SQL database", label: "Server", value: `${DB_HOST},1433` },
      { itemId: SQL_DB, section: "SQL database", label: "Collation", value: "SQL_Latin1_General_CP1_CI_AS" },
      { itemId: SQL_DB, section: "SQL database", label: "Backup retention days", value: "7" },
      { itemId: SQL_DB, section: "Metadata capability", label: "SQL schema", value: "complete" },
      { itemId: SQL_DB, section: "SQL Primary keys", label: "dbo.Customers", value: "PK_Customers: CustomerId" },
      {
        itemId: SQL_DB,
        section: "SQL Foreign keys",
        label: "FK_Orders_Customers",
        value: "dbo.Orders(CustomerId) -> dbo.Customers(CustomerId)",
      },
      { itemId: SQL_DB, section: "Inventory", label: "Coverage", value: "Tables/views and columns returned by Fabric SQL system catalog." },
      { itemId: SQL_DB, section: "Tables", label: "dbo.Customers", value: "SQL table" },
      { itemId: SQL_DB, section: "Tables", label: "dbo.Orders", value: "SQL table" },
      { itemId: SQL_DB, section: "Tables", label: "sales.OrderSummary", value: "SQL view" },
      { itemId: WAREHOUSE, section: "Warehouse", label: "Collation", value: "Latin1_General_100_BIN2_UTF8" },
      { itemId: WAREHOUSE, section: "Warehouse", label: "Created", value: "2026-01-02T03:04:05.123Z" },
      { itemId: WAREHOUSE, section: "Warehouse", label: "Updated", value: "2026-02-03T04:05:06.000Z" },
      { itemId: WAREHOUSE, section: "Metadata capability", label: "SQL schema", value: "complete" },
      { itemId: WAREHOUSE, section: "Inventory", label: "Coverage", value: "Tables/views and columns returned by Fabric Warehouse system catalog." },
      { itemId: WAREHOUSE, section: "Tables", label: "gold.FactSales", value: "SQL table" },
      { itemId: WAREHOUSE, section: "Tables", label: "gold.vSales", value: "SQL view" },
      { itemId: LAKEHOUSE, section: "SQL endpoint", label: "Item ID", value: SQL_ENDPOINT },
      { itemId: LAKEHOUSE, section: "SQL endpoint", label: "Provisioning status", value: "Success" },
      { itemId: LAKEHOUSE, section: "Metadata capability", label: "SQL schema", value: "complete" },
      { itemId: LAKEHOUSE, section: "Inventory", label: "Lakehouse Tables REST", value: "complete" },
      {
        itemId: LAKEHOUSE,
        section: "Inventory",
        label: "Coverage",
        value: "Lakehouse Tables REST inventory merged with SQL analytics endpoint columns when available.",
      },
      { itemId: LAKEHOUSE, section: "Tables", label: "dbo.trips", value: "SQL endpoint table" },
    ]);
    expect(envelope.sections).toEqual({
      sqlProperties: { status: "complete", code: "partial-unsupported" },
      sqlSchema: { status: "complete" },
    });
    expect(envelope.capabilities).toEqual({ sqlSchema: { status: "complete" } });
  });

  it("projects into the existing Atlas catalog as SQL objects for SQL items and tables for Lakehouses", async () => {
    const envelope = await collect().result;
    const items: Item[] = [
      { fabricId: SQL_DB, displayName: "Sales DB", itemType: "SQLDatabase", health: "unknown", endorsement: "none", tags: [] },
      { fabricId: WAREHOUSE, displayName: "Gold DW", itemType: "Warehouse", health: "unknown", endorsement: "none", tags: [] },
      { fabricId: LAKEHOUSE, displayName: "Bronze", itemType: "Lakehouse", health: "unknown", endorsement: "none", tags: [] },
    ];
    const objects = buildCatalogObjects({
      items,
      schema: envelope.schema as Record<string, ModelTableSchema[]>,
      itemMetadata: {},
      objectEdges: [],
      config: [],
    });
    const kinds = (itemId: string) =>
      objects.filter((object) => object.itemFabricId === itemId).map((object) => `${object.kind}:${object.name}`);
    expect(kinds(SQL_DB)).toEqual(expect.arrayContaining(["sqlTable:dbo.Customers", "sqlView:sales.OrderSummary", "sqlColumn:CustomerId"]));
    expect(kinds(WAREHOUSE)).toEqual(expect.arrayContaining(["sqlTable:gold.FactSales", "sqlView:gold.vSales"]));
    expect(kinds(LAKEHOUSE)).toEqual(expect.arrayContaining(["table:dbo.trips"]));
  });

  it.each([
    ["an unrelated host", { serverFqdn: "evil.example.test,1433" }],
    ["a lookalike suffix", { serverFqdn: `${DB_HOST}.evil.test,1433` }],
    ["the bare Fabric suffix", { serverFqdn: "database.fabric.microsoft.com" }],
    ["a Warehouse host for a SQL Database", { serverFqdn: DW_HOST }],
    ["another port", { serverFqdn: `${DB_HOST},1434` }],
    ["connection-string keywords", { serverFqdn: `tcp:${DB_HOST},1433;Authentication=ActiveDirectoryPassword` }],
    ["a URL", { serverFqdn: `https://${DB_HOST}` }],
    ["credentials", { serverFqdn: `user:private@${DB_HOST}` }],
    ["an invalid label", { serverFqdn: `-bad-.database.fabric.microsoft.com` }],
    ["a non-string server", { serverFqdn: 42 }],
    ["a missing server", { serverFqdn: undefined }],
    ["a database name with a separator", { databaseName: "Sales;Password=private" }],
    ["a database name with a brace", { databaseName: "{private}" }],
    ["a database name with a quote", { databaseName: "Sales'--" }],
    ["a database name with a newline", { databaseName: "Sales\nprivate" }],
    ["an overlong database name", { databaseName: "x".repeat(129) }],
  ])("never connects to a SQL Database with %s", async (_name, properties) => {
    const { result, sql } = collect(routes({ [SQL_DB_URL]: () => json(sqlDatabase(properties)) }));
    const envelope = await result;
    expect(itemStatus(envelope, SQL_DB)).toEqual({ status: "complete", code: undefined });
    expect(catalogStatus(envelope, SQL_DB)).toEqual({ status: "failed", code: "invalid-connection-coordinates" });
    expect(sql.connects.map((call) => call.target.database)).toEqual([WAREHOUSE, SQL_ENDPOINT]);
    expect(envelope.schema).not.toHaveProperty(SQL_DB);
    expect(envelope.errors).toEqual([`sqlSchema:${SQL_DB}: invalid-connection-coordinates`]);
    const serialized = JSON.stringify(envelope);
    for (const forbidden of ["evil", "private", "Authentication", "1434", "https://"]) expect(serialized).not.toContain(forbidden);
  });

  it.each([
    ["a full connection string", warehouse({ connectionString: `Data Source=${DW_HOST};Initial Catalog=x` })],
    ["a SQL Database host", warehouse({ connectionString: DB_HOST })],
    ["a lookalike host", warehouse({ connectionString: `${DW_HOST}.attacker.net` })],
  ])("never connects to a Warehouse with %s", async (_name, body) => {
    const { result, sql } = collect(routes({ [WAREHOUSE_URL]: () => json(body) }), [{ id: WAREHOUSE, type: "Warehouse" }]);
    const envelope = await result;
    expect(catalogStatus(envelope, WAREHOUSE)).toEqual({ status: "failed", code: "invalid-connection-coordinates" });
    expect(sql.connects).toEqual([]);
    expect(envelope.config).toContainEqual({
      itemId: WAREHOUSE,
      section: "Inventory",
      label: "Coverage",
      value: "Fabric REST exposes item properties only; complete tables, views and columns require SQL connectivity.",
    });
  });

  it("normalizes accepted tcp-prefixed and mixed-case SQL Database hosts", async () => {
    const { result, sql } = collect(
      routes({ [SQL_DB_URL]: () => json(sqlDatabase({ serverFqdn: "tcp:Fixture-DB.Database.Fabric.Microsoft.com,1433" })) }),
      [{ id: SQL_DB, type: "SQLDatabase" }],
    );
    const envelope = await result;
    expect(sql.connects[0].target.server).toBe(DB_HOST);
    expect(envelope.config).toContainEqual({ itemId: SQL_DB, section: "SQL database", label: "Server", value: `${DB_HOST},1433` });
  });

  it("keeps Lakehouse REST inventory when the SQL endpoint is missing or not provisioned", async () => {
    const missing = await collect(routes({ [LAKEHOUSE_URL]: () => json(lakehouse(null)) }), [{ id: LAKEHOUSE, type: "Lakehouse" }]).result;
    expect(catalogStatus(missing, LAKEHOUSE)).toEqual({ status: "complete", code: "partial-unsupported" });

    const { result, sql } = collect(
      routes({ [LAKEHOUSE_URL]: () => json(lakehouse({ provisioningStatus: "InProgress" })) }),
      [{ id: LAKEHOUSE, type: "Lakehouse" }],
    );
    const pending = await result;
    expect(catalogStatus(pending, LAKEHOUSE)).toEqual({ status: "complete", code: "partial-unsupported" });
    expect(pending.items[0]).toEqual({
      id: LAKEHOUSE,
      type: "Lakehouse",
      status: "complete",
      endpointKind: "lakehouse-sql-endpoint",
      sqlEndpointId: SQL_ENDPOINT,
    });
    expect(pending.sections.sqlSchema).toEqual({ status: "complete", code: "partial-unsupported" });
    expect(sql.connects).toEqual([]);
    expect(pending.errors).toEqual([]);
  });

  it("uses the SQL endpoint ID when schema-enabled Lakehouse REST enumeration is unsupported", async () => {
    const { result, sql } = collect(
      routes({
        [LAKEHOUSE_TABLES_URL]: () => json(
          { errorCode: "InvalidInput", message: "Schema-enabled Lakehouse." },
          { status: 400 },
        ),
      }),
      [{ id: LAKEHOUSE, type: "Lakehouse" }],
    );

    const envelope = await result;

    expect(sql.connects[0].target.database).toBe(SQL_ENDPOINT);
    expect(envelope.schema[LAKEHOUSE]).toEqual([{
      name: "dbo.trips",
      objectType: "SQL endpoint table",
      source: "Fabric SQL analytics endpoint system catalog",
      columns: [{ name: "trip_id", dataType: "varchar" }],
      measures: [],
    }]);
    expect(envelope.catalogs[LAKEHOUSE]).toMatchObject({
      status: "complete",
      code: "partial-unsupported",
      lakehouseTables: { status: "unsupported", code: "endpoint-unsupported" },
    });
  });

  it("collects mirrored database tables and columns through its SQL endpoint", async () => {
    const { result, fetchImpl, sql } = collect(
      routes(),
      [{ id: MIRROR, type: "MirroredDatabase" }],
    );

    const envelope = await result;

    expect(urls(fetchImpl)).toEqual([MIRROR_URL]);
    expect(sql.connects[0].target).toEqual({
      kind: "mirrored-database-sql-endpoint",
      server: LH_HOST,
      port: 1433,
      database: MIRROR_ENDPOINT,
      readOnlyIntent: false,
    });
    expect(envelope.schema[MIRROR]).toEqual([{
      name: "DEMO_DW.DIM_STORE",
      objectType: "SQL endpoint table",
      source: "Fabric mirrored database SQL endpoint system catalog",
      columns: [
        { name: "STORE_ID", dataType: "int" },
        { name: "STORE_NAME", dataType: "varchar" },
      ],
      measures: [],
    }]);
    expect(catalogStatus(envelope, MIRROR)).toEqual({
      status: "complete",
      code: undefined,
    });
  });

  it.each([
    ["another item ID", sqlDatabase({}, { id: SECOND_DB })],
    ["another item type", sqlDatabase({}, { type: "Warehouse" })],
    ["another workspace", sqlDatabase({}, { workspaceId: SECOND_DB })],
    ["non-object properties", sqlDatabase({}, { properties: ["x"] })],
    ["an unsafe collation", sqlDatabase({ collation: "Latin1;DROP" })],
    ["a negative retention", sqlDatabase({ backupRetentionDays: -1 })],
    ["a non-object body", [1, 2]],
  ])("fails only the SQL Database item with %s", async (_name, body) => {
    const { result, sql } = collect(routes({ [SQL_DB_URL]: () => json(body) }));
    const envelope = await result;
    expect(itemStatus(envelope, SQL_DB)).toEqual({ status: "failed", code: "invalid-response" });
    expect(catalogStatus(envelope, SQL_DB)).toEqual({ status: "failed", code: "not-attempted" });
    expect(itemStatus(envelope, WAREHOUSE).status).toBe("complete");
    expect(catalogStatus(envelope, LAKEHOUSE).status).toBe("complete");
    expect(sql.connects.map((call) => call.target.database)).toEqual([WAREHOUSE, SQL_ENDPOINT]);
    expect(envelope.config.some((entry) => entry.itemId === SQL_DB)).toBe(false);
    expect(envelope.errors).toEqual([`sqlProperties:${SQL_DB}: invalid-response`]);
  });

  it("fails only the Warehouse on an invalid timestamp and the Lakehouse on an invalid endpoint ID", async () => {
    const envelope = await collect(
      routes({
        [WAREHOUSE_URL]: () => json(warehouse({ createdDate: "yesterday" })),
        [LAKEHOUSE_URL]: () => json(lakehouse({ id: "../private" })),
      }),
    ).result;
    expect(itemStatus(envelope, WAREHOUSE)).toEqual({ status: "failed", code: "invalid-response" });
    expect(itemStatus(envelope, LAKEHOUSE)).toEqual({ status: "failed", code: "invalid-response" });
    expect(catalogStatus(envelope, SQL_DB).status).toBe("complete");
  });
});

describe("SQL metadata injection resistance and parameterization", () => {
  it("sends only the fixed catalog statements with typed parameters", async () => {
    const { result, sql } = collect();
    await result;
    expect(sql.queries.map((call) => `${call.database}:${call.name}`)).toEqual([
      `${DB_NAME}:objects`,
      `${DB_NAME}:schemas`,
      `${DB_NAME}:primaryKeys`,
      `${DB_NAME}:foreignKeys`,
      `${WAREHOUSE}:objects`,
      `${WAREHOUSE}:schemas`,
      `${WAREHOUSE}:primaryKeys`,
      `${WAREHOUSE}:foreignKeys`,
      `${SQL_ENDPOINT}:objects`,
      `${SQL_ENDPOINT}:schemas`,
      `${SQL_ENDPOINT}:primaryKeys`,
      `${SQL_ENDPOINT}:foreignKeys`,
    ]);
    for (const call of sql.queries) {
      expect(call.text).toBe(SQL_CATALOG_QUERIES[call.name]);
      expect(call.parameters[0]).toEqual({ name: "rowLimit", type: "int", value: call.options.maxRows + 1 });
      for (const parameter of call.parameters) {
        expect(call.text).toContain(`@${parameter.name}`);
        expect(["int", "nvarchar"]).toContain(parameter.type);
        if (parameter.type === "nvarchar") expect(["U", "V", "PK"]).toContain(parameter.value);
        else expect(Number.isSafeInteger(parameter.value)).toBe(true);
      }
      for (const coordinate of [WS, SQL_DB, WAREHOUSE, LAKEHOUSE, DB_NAME, DB_HOST, DW_HOST]) {
        expect(call.text).not.toContain(coordinate);
      }
    }
    expect(sql.queries.find((call) => call.name === "objects")?.options).toMatchObject({ maxRows: 50_000, maxBytes: 8 * 1024 * 1024 });
    expect(sql.queries.find((call) => call.name === "schemas")?.options.maxRows).toBe(1_000);
    expect(sql.queries.find((call) => call.name === "primaryKeys")?.options.maxRows).toBe(5_000);
  });

  it("keeps every catalog statement a read-only system-catalog SELECT without definitions or data", () => {
    for (const text of Object.values(SQL_CATALOG_QUERIES)) {
      expect(text.startsWith("SELECT TOP (@rowLimit)")).toBe(true);
      expect(text.indexOf(";")).toBe(text.length - 1);
      expect(text).not.toMatch(/--|\/\*|'|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bMERGE\b|\bDROP\b|\bALTER\b|\bCREATE\b|\bEXEC|\bINTO\b|\bOPENROWSET\b|\bOPENQUERY\b|\*/i);
      expect(text).not.toMatch(/sql_modules|OBJECT_DEFINITION|default_constraints|check_constraints|computed_columns|definition/i);
      const sources = [...text.matchAll(/\b(?:FROM|JOIN)\s+([A-Za-z_.]+)/g)].map((match) => match[1]);
      expect(sources.length).toBeGreaterThan(0);
      expect(sources.every((source) => source.startsWith("sys."))).toBe(true);
    }
  });

  it("treats hostile catalog names as data and never sends them as SQL", async () => {
    const hostile = ["x'; DROP TABLE dbo.Users;--", "Robert\"); DELETE FROM t; --", "[evil]]; EXEC xp_cmdshell 'dir'"];
    const table = catalogs({
      [DB_NAME]: {
        ...SALES_CATALOG,
        objects: hostile.map((name, index) => objectRow(40 + index, "dbo", name, "U", 1, name, "int")),
      },
    });
    const { result, sql } = collect(routes(), [{ id: SQL_DB, type: "SQLDatabase" }], { catalogs: table });
    const envelope = await result;
    expect(envelope.schema[SQL_DB].map((entry) => entry.name)).toEqual(hostile.map((name) => `dbo.${name}`));
    for (const call of sql.queries) {
      for (const name of hostile) {
        expect(call.text).not.toContain(name);
        expect(call.parameters.some((parameter) => parameter.value === name)).toBe(false);
      }
    }
  });

  it("passes SQL Database names only as the TDS login database", async () => {
    const { result, sql } = collect(routes(), [{ id: SECOND_DB, type: "SQLDatabase" }]);
    await result;
    expect(sql.connects[0].target.database).toBe(SECOND_DB_NAME);
    expect(sql.queries.every((call) => !call.text.includes(SECOND_DB_NAME))).toBe(true);
  });
});

describe("SQL metadata malformed and oversized catalogs", () => {
  it.each([
    ["a non-object row", [[1, "dbo"]]],
    ["an unknown object type", [{ ...objectRow(1, "dbo", "p", "U", 1, "c", "int"), object_type: "P " }]],
    ["a string object ID", [{ ...objectRow(1, "dbo", "t", "U", 1, "c", "int"), object_id: "1" }]],
    ["a non-contiguous object", [
      objectRow(1, "dbo", "a", "U", 1, "c", "int"),
      objectRow(2, "dbo", "b", "U", 1, "c", "int"),
      objectRow(1, "dbo", "a", "U", 2, "d", "int"),
    ]],
    ["a non-string column name", [{ ...objectRow(1, "dbo", "t", "U", 1, "c", "int"), column_name: 42 }]],
  ])("fails only the affected catalog on %s", async (_name, objects) => {
    const envelope = await collect(routes(), BATCH, {
      catalogs: catalogs({ [DB_NAME]: { ...SALES_CATALOG, objects: objects as Rows } }),
    }).result;
    expect(catalogStatus(envelope, SQL_DB)).toEqual({ status: "failed", code: "invalid-response" });
    expect(envelope.schema).not.toHaveProperty(SQL_DB);
    expect(catalogStatus(envelope, WAREHOUSE).status).toBe("complete");
    expect(catalogStatus(envelope, LAKEHOUSE).status).toBe("complete");
    expect(envelope.sections.sqlSchema).toEqual({ status: "failed", code: "invalid-response" });
    expect(envelope.errors).toEqual([`sqlSchema:${SQL_DB}: invalid-response`]);
  });

  it("skips unsafe catalog names and reports the projection as partial", async () => {
    const objects = [
      objectRow(1, "dbo", "Safe", "U", 1, "id", "int"),
      objectRow(1, "dbo", "Safe", "U", 2, "private\ncolumn", "int"),
      objectRow(1, "dbo", "Safe", "U", 3, "name", "private\u202etype"),
      objectRow(2, "dbo", "private\u0000table", "U", 1, "id", "int"),
      objectRow(3, "dbo", "x".repeat(129), "V", 1, "id", "int"),
      objectRow(4, " private", "spaced", "U", 1, "id", "int"),
    ];
    const envelope = await collect(routes(), [{ id: SQL_DB, type: "SQLDatabase" }], {
      catalogs: catalogs({ [DB_NAME]: { ...SALES_CATALOG, objects } }),
    }).result;
    expect(envelope.schema[SQL_DB]).toEqual([
      {
        name: "dbo.Safe",
        objectType: "SQL table",
        source: "Fabric SQL system catalog",
        columns: [{ name: "id", dataType: "int" }, { name: "name", dataType: "column" }],
        measures: [],
      },
    ]);
    expect(envelope.catalogs[SQL_DB]).toMatchObject({ status: "complete", code: "partial-unsupported", rejectedNames: 4 });
    expect(envelope.sections.sqlSchema).toEqual({ status: "complete", code: "partial-unsupported" });
    expect(JSON.stringify(envelope)).not.toContain("private");
  });

  it("drops the partial trailing object when the row bound is reached", async () => {
    const envelope = await collect(routes(), [{ id: SQL_DB, type: "SQLDatabase" }], {
      limits: { maxCatalogRows: 3 },
    }).result;
    expect(envelope.schema[SQL_DB].map((entry) => entry.name)).toEqual(["dbo.Customers"]);
    expect(envelope.catalogs[SQL_DB]).toMatchObject({ status: "complete", code: "projection-truncated", truncated: true });
    expect(envelope.config).toContainEqual({ itemId: SQL_DB, section: "Metadata capability", label: "SQL schema", value: "projection-truncated" });
  });

  it("bounds objects per item and columns per object", async () => {
    const objects = await collect(routes(), [{ id: SQL_DB, type: "SQLDatabase" }], { limits: { maxObjectsPerItem: 2 } }).result;
    expect(objects.schema[SQL_DB].map((entry) => entry.name)).toEqual(["dbo.Customers", "dbo.Orders"]);
    expect(objects.catalogs[SQL_DB]).toMatchObject({ code: "projection-truncated", truncated: true });

    const columns = await collect(routes(), [{ id: SQL_DB, type: "SQLDatabase" }], { limits: { maxColumnsPerObject: 1 } }).result;
    expect(columns.schema[SQL_DB].map((entry) => entry.columns.length)).toEqual([1, 1, 1]);
    expect(columns.catalogs[SQL_DB]).toMatchObject({ code: "projection-truncated", truncated: true });
  });

  it("drops a key constraint cut short by the key row bound", async () => {
    const table = catalogs({
      [DB_NAME]: {
        ...SALES_CATALOG,
        primaryKeys: [
          { constraint_id: 100, schema_name: "dbo", table_name: "Customers", constraint_name: "PK_Customers", column_name: "CustomerId", key_ordinal: 1 },
          { constraint_id: 101, schema_name: "dbo", table_name: "Orders", constraint_name: "PK_Orders", column_name: "OrderId", key_ordinal: 1 },
          { constraint_id: 101, schema_name: "dbo", table_name: "Orders", constraint_name: "PK_Orders", column_name: "CustomerId", key_ordinal: 2 },
        ],
      },
    });
    const envelope = await collect(routes(), [{ id: SQL_DB, type: "SQLDatabase" }], {
      catalogs: table,
      limits: { maxKeyRows: 2 },
    }).result;
    expect(envelope.config.filter((entry) => entry.section === "SQL Primary keys")).toEqual([
      { itemId: SQL_DB, section: "SQL Primary keys", label: "dbo.Customers", value: "PK_Customers: CustomerId" },
    ]);
    expect(envelope.catalogs[SQL_DB]).toMatchObject({ primaryKeys: 1, truncated: true, code: "projection-truncated" });
  });

  it("fails a catalog whose streamed bytes exceed the bound without stopping the batch", async () => {
    const envelope = await collect(routes(), BATCH, {
      catalogs: catalogs({ [DB_NAME]: { ...SALES_CATALOG, queryErrors: { objects: new SqlDriverError("response-size-exceeded") } } }),
    }).result;
    expect(catalogStatus(envelope, SQL_DB)).toEqual({ status: "failed", code: "response-size-exceeded" });
    expect(catalogStatus(envelope, WAREHOUSE).status).toBe("complete");
  });

  it("stops the batch when the aggregate schema budget is spent", async () => {
    const { result, fetchImpl } = collect(routes(), BATCH, { limits: { maxSchemaBytes: 100 } });
    const envelope = await result;
    expect(catalogStatus(envelope, SQL_DB)).toEqual({ status: "failed", code: "response-size-exceeded" });
    expect(itemStatus(envelope, WAREHOUSE)).toEqual({ status: "failed", code: "not-attempted" });
    expect(urls(fetchImpl)).toEqual([SQL_DB_URL]);
    expect(envelope.schema).toEqual({});
  });

  it("fails only the item whose REST body is not JSON or is oversized", async () => {
    const envelope = await collect(
      routes({
        [SQL_DB_URL]: () => new Response("<html>private</html>"),
        [WAREHOUSE_URL]: () => new Response("{}", { headers: { "content-length": String(8 * 1024 * 1024) } }),
      }),
    ).result;
    expect(itemStatus(envelope, SQL_DB)).toEqual({ status: "failed", code: "invalid-response" });
    expect(itemStatus(envelope, WAREHOUSE)).toEqual({ status: "failed", code: "response-size-exceeded" });
    expect(catalogStatus(envelope, LAKEHOUSE).status).toBe("complete");
  });
});

function sqlError(code: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error("Login failed for user 'private@contoso.com' on server fixture-db"), { code, ...extra });
}

describe("SQL metadata permission, throttling, timeout and cancellation", () => {
  it.each([
    ["a login failure", [sqlError("ELOGIN")], "unsupported", "authorization-failed", 1],
    ["a database access failure", [sqlError("EREQUEST", { number: 916 })], "unsupported", "authorization-failed", 1],
    ["a connect timeout", [sqlError("ETIMEOUT")], "failed", "sql-timeout", 1],
    ["persistent socket failures", [sqlError("ESOCKET"), sqlError("ESOCKET")], "failed", "sql-connection-failed", 2],
    ["an unknown connect failure", [new Error("private")], "failed", "sql-connection-failed", 1],
  ])("maps %s to %s/%s without failing other items", async (_name, connectErrors, status, code, attempts) => {
    const { result, sql } = collect(routes(), BATCH, {
      catalogs: catalogs({ [DB_NAME]: { ...SALES_CATALOG, connectErrors } }),
    });
    const envelope = await result;
    expect(catalogStatus(envelope, SQL_DB)).toEqual({ status, code });
    expect(sql.connects.filter((call) => call.target.database === DB_NAME)).toHaveLength(attempts);
    expect(catalogStatus(envelope, WAREHOUSE).status).toBe("complete");
    expect(catalogStatus(envelope, LAKEHOUSE).status).toBe("complete");
    expect(envelope.errors).toEqual(status === "failed" ? [`sqlSchema:${SQL_DB}: ${code}`] : []);
    expect(itemStatus(envelope, SQL_DB).status).toBe("complete");
  });

  it("retries one transient connection failure within the deadline", async () => {
    const sleep = vi.fn(async () => undefined);
    const { result, sql } = collect(routes(), [{ id: SQL_DB, type: "SQLDatabase" }], {
      sleep,
      catalogs: catalogs({ [DB_NAME]: { ...SALES_CATALOG, connectErrors: [sqlError("ELOGIN", { isTransient: true })] } }),
    });
    const envelope = await result;
    expect(catalogStatus(envelope, SQL_DB)).toEqual({ status: "complete", code: undefined });
    expect(sql.connects).toHaveLength(2);
    expect(sleep).toHaveBeenCalledWith(1_000);
  });

  it("stops the batch on SQL throttling", async () => {
    const { result, fetchImpl } = collect(routes(), BATCH, {
      catalogs: catalogs({ [DB_NAME]: { ...SALES_CATALOG, queryErrors: { objects: sqlError("EREQUEST", { number: 40501 }) } } }),
    });
    const envelope = await result;
    expect(catalogStatus(envelope, SQL_DB)).toEqual({ status: "failed", code: "sql-throttled" });
    expect(itemStatus(envelope, WAREHOUSE)).toEqual({ status: "failed", code: "not-attempted" });
    expect(catalogStatus(envelope, LAKEHOUSE)).toEqual({ status: "failed", code: "not-attempted" });
    expect(urls(fetchImpl)).toEqual([SQL_DB_URL]);
    expect(envelope.sections.sqlSchema).toEqual({ status: "failed", code: "sql-throttled" });
  });

  it("keeps the object inventory when key-constraint metadata is denied or unsupported", async () => {
    const envelope = await collect(routes(), [{ id: WAREHOUSE, type: "Warehouse" }], {
      catalogs: catalogs({
        [WAREHOUSE]: { ...WAREHOUSE_CATALOG, queryErrors: { primaryKeys: sqlError("EREQUEST", { number: 208 }) } },
      }),
    }).result;
    expect(envelope.catalogs[WAREHOUSE]).toMatchObject({
      status: "complete",
      code: "partial-unsupported",
      structure: { status: "failed", code: "sql-catalog-query-failed" },
      tables: 1,
      views: 1,
    });
    expect(envelope.schema[WAREHOUSE]).toHaveLength(2);
    expect(envelope.errors).toEqual([`sqlStructure:${WAREHOUSE}: sql-catalog-query-failed`]);

    const denied = await collect(routes(), [{ id: WAREHOUSE, type: "Warehouse" }], {
      catalogs: catalogs({
        [WAREHOUSE]: { ...WAREHOUSE_CATALOG, queryErrors: { foreignKeys: sqlError("EREQUEST", { number: 229 }) } },
      }),
    }).result;
    expect(denied.catalogs[WAREHOUSE].structure).toEqual({ status: "unsupported", code: "authorization-failed" });
    expect(denied.errors).toEqual([]);
  });

  it("keeps collected objects but stops the batch when throttled during key-constraint queries", async () => {
    const { result, fetchImpl } = collect(routes(), BATCH, {
      catalogs: catalogs({
        [DB_NAME]: { ...SALES_CATALOG, queryErrors: { primaryKeys: sqlError("EREQUEST", { number: 49918 }) } },
      }),
    });
    const envelope = await result;
    expect(envelope.catalogs[SQL_DB]).toMatchObject({
      status: "complete",
      code: "partial-unsupported",
      structure: { status: "failed", code: "sql-throttled" },
      foreignKeys: 0,
    });
    expect(envelope.schema[SQL_DB]).toHaveLength(3);
    expect(itemStatus(envelope, WAREHOUSE)).toEqual({ status: "failed", code: "not-attempted" });
    expect(urls(fetchImpl)).toEqual([SQL_DB_URL]);
    expect(envelope.errors).toEqual([`sqlStructure:${SQL_DB}: sql-throttled`]);
    expect(envelope.sections.sqlSchema).toEqual({ status: "failed", code: "sql-throttled" });
  });

  it("maps a denied object query to unsupported and a query timeout to failed", async () => {
    const envelope = await collect(routes(), BATCH, {
      catalogs: catalogs({
        [DB_NAME]: { ...SALES_CATALOG, queryErrors: { objects: sqlError("EREQUEST", { number: 229 }) } },
        [WAREHOUSE]: { ...WAREHOUSE_CATALOG, queryErrors: { objects: sqlError("ETIMEOUT") } },
      }),
    }).result;
    expect(catalogStatus(envelope, SQL_DB)).toEqual({ status: "unsupported", code: "authorization-failed" });
    expect(catalogStatus(envelope, WAREHOUSE)).toEqual({ status: "failed", code: "sql-timeout" });
    expect(catalogStatus(envelope, LAKEHOUSE).status).toBe("complete");
  });

  it("reports an unavailable TDS runtime once and does not retry it for later items", async () => {
    const { result, sql } = collect(routes(), BATCH, {
      catalogs: catalogs({ [DB_NAME]: { ...SALES_CATALOG, connectErrors: [new SqlDriverError("tds-runtime-unavailable")] } }),
    });
    const envelope = await result;
    for (const id of [SQL_DB, WAREHOUSE]) {
      expect(catalogStatus(envelope, id)).toEqual({ status: "unsupported", code: "tds-runtime-unavailable" });
    }
    expect(catalogStatus(envelope, LAKEHOUSE)).toEqual({ status: "complete", code: "partial-unsupported" });
    expect(sql.connects).toHaveLength(1);
    expect(envelope.items.every((item) => item.status === "complete")).toBe(true);
  });

  it("maps Fabric REST permission and throttling failures per item", async () => {
    const denied = await collect(routes({ [SQL_DB_URL]: () => json({ message: "private" }, { status: 403 }) })).result;
    expect(itemStatus(denied, SQL_DB)).toEqual({ status: "failed", code: "authorization-failed" });
    expect(catalogStatus(denied, WAREHOUSE).status).toBe("complete");

    const missing = await collect(routes({ [SQL_DB_URL]: () => json({}, { status: 404 }) })).result;
    expect(itemStatus(missing, SQL_DB)).toEqual({ status: "unsupported", code: "endpoint-unsupported" });
    expect(catalogStatus(missing, SQL_DB)).toEqual({ status: "unsupported", code: "endpoint-unsupported" });

    const { result, sql } = collect(routes({ [SQL_DB_URL]: () => json({}, { status: 429, headers: { "retry-after": "0" } }) }));
    const throttled = await result;
    expect(itemStatus(throttled, SQL_DB)).toEqual({ status: "failed", code: "rate-limited" });
    expect(itemStatus(throttled, WAREHOUSE)).toEqual({ status: "failed", code: "not-attempted" });
    expect(sql.connects).toEqual([]);
  });

  it("enforces the deadline, the SQL operation budget and the REST request budget", async () => {
    let now = 0;
    const late = await collect(
      routes({
        [SQL_DB_URL]: () => {
          now += 140_000;
          return json(sqlDatabase());
        },
      }),
      BATCH,
      { now: () => now },
    ).result;
    expect(catalogStatus(late, SQL_DB)).toEqual({ status: "failed", code: "not-attempted" });
    expect(itemStatus(late, WAREHOUSE)).toEqual({ status: "failed", code: "not-attempted" });
    expect(late.errors).toEqual(["sqlSchema: deadline-exhausted"]);

    const operations = await collect(routes(), BATCH, { limits: { maxSqlOperations: 5 } }).result;
    expect(catalogStatus(operations, SQL_DB).status).toBe("complete");
    expect(catalogStatus(operations, WAREHOUSE)).toEqual({ status: "failed", code: "not-attempted" });
    expect(operations.errors).toEqual(["sqlSchema: sql-operation-budget-exhausted"]);

    const requests = await collect(routes(), BATCH, { limits: { maxRequests: 1 } }).result;
    expect(itemStatus(requests, WAREHOUSE)).toEqual({ status: "failed", code: "not-attempted" });
    expect(requests.errors).toEqual(["sqlProperties: request-budget-exhausted"]);
  });

  it("bounds SQL timeouts by the remaining execution budget", async () => {
    let now = 0;
    const { result, sql } = collect(
      routes({
        [SQL_DB_URL]: () => {
          now += 125_000;
          return json(sqlDatabase());
        },
      }),
      [{ id: SQL_DB, type: "SQLDatabase" }],
      { now: () => now },
    );
    await result;
    expect(sql.connects[0].options).toMatchObject({ timeoutMs: 15_000, requestTimeoutMs: 20_000 });
    expect(sql.queries[0].options.timeoutMs).toBe(20_000);

    let later = 0;
    const tight = collect(
      routes({
        [SQL_DB_URL]: () => {
          later += 140_000;
          return json(sqlDatabase());
        },
      }),
      [{ id: SQL_DB, type: "SQLDatabase" }],
      { now: () => later, limits: { minItemStartMs: 5_000 } },
    );
    await tight.result;
    expect(tight.sql.connects[0].options.timeoutMs).toBe(9_000);
    expect(tight.sql.queries.map((call) => call.options.timeoutMs)).toEqual([9_000, 9_000, 9_000, 9_000]);
  });

  it("stops on cancellation during a catalog query and closes the session", async () => {
    const controller = new AbortController();
    const { result, sql, fetchImpl } = collect(routes(), BATCH, {
      signal: controller.signal,
      catalogs: catalogs({
        [DB_NAME]: {
          ...SALES_CATALOG,
          onQuery: (name) => {
            if (name === "objects") controller.abort();
          },
          queryErrors: { objects: new SqlDriverError("cancelled") },
        },
      }),
    });
    const envelope = await result;
    expect(catalogStatus(envelope, SQL_DB)).toEqual({ status: "failed", code: "cancelled" });
    expect(itemStatus(envelope, WAREHOUSE)).toEqual({ status: "failed", code: "not-attempted" });
    expect(sql.closed).toEqual([DB_NAME]);
    expect(urls(fetchImpl)).toEqual([SQL_DB_URL]);
    expect(sql.connects[0].options.signal).toBe(controller.signal);
  });
});

describe("SQL metadata leakage boundary", () => {
  it("never returns tokens, connection strings, driver messages, descriptions or unreviewed properties", async () => {
    const { result } = collect(routes(), [...BATCH, { id: SECOND_DB, type: "SQLDatabase" }], {
      catalogs: catalogs({
        [SECOND_DB_NAME]: { ...SALES_CATALOG, connectErrors: [sqlError("ELOGIN")] },
        [WAREHOUSE]: { ...WAREHOUSE_CATALOG, queryErrors: { foreignKeys: sqlError("EREQUEST", { number: 4060 }) } },
      }),
    });
    const serialized = JSON.stringify(await result);
    for (const forbidden of [
      FABRIC_TOKEN,
      SQL_TOKEN,
      "Bearer",
      "Data Source",
      "Password",
      "private",
      "Login failed",
      "contoso",
      "description",
      DW_HOST,
      LH_HOST,
      "oneLake",
      "onelake",
      "displayName",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
