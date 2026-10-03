// @vitest-environment node
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SQL_CATALOG_QUERIES,
  SqlCoordinateError,
  SqlDriverError,
  classifySqlError,
  createMssqlCatalogDriver,
  sqlCatalogParameters,
  trustedSqlDatabaseName,
  trustedSqlHost,
  type SqlConnectionTarget,
} from "../../rayfin/functions/src/sql-catalog";

const TOKEN = "fixture-sql-token";
const TARGET: SqlConnectionTarget = {
  kind: "warehouse",
  server: "fixture-dw.datawarehouse.fabric.microsoft.com",
  port: 1433,
  database: "33333333-3333-4333-8333-333333333333",
  readOnlyIntent: false,
};
const QUERY_OPTIONS = { timeoutMs: 5_000, maxRows: 2, maxBytes: 1_024 };

type RequestBehavior = (request: FakeRequest) => Promise<void> | void;

class FakeRequest extends EventEmitter {
  stream = false;
  inputs: { name: string; type: unknown; value: unknown }[] = [];
  text?: string;
  cancelled = 0;
  private release?: () => void;

  constructor(private readonly behavior: RequestBehavior) {
    super();
  }

  input(name: string, type: unknown, value: unknown) {
    this.inputs.push({ name, type, value });
    return this;
  }

  cancel() {
    this.cancelled += 1;
    this.emit("error", Object.assign(new Error("Canceled."), { code: "ECANCEL" }));
    this.release?.();
  }

  /** Keeps the request open until it is cancelled. */
  hang(): Promise<void> {
    return new Promise((resolve) => {
      this.release = resolve;
    });
  }

  async query(text: string) {
    this.text = text;
    await this.behavior(this);
    return { recordset: [] };
  }
}

function fakeModule(options: { connect?: (pool: FakePool) => Promise<void>; request?: RequestBehavior } = {}) {
  const pools: FakePool[] = [];
  const requests: FakeRequest[] = [];
  class FakePool extends EventEmitter {
    closed = 0;
    constructor(readonly config: Record<string, unknown>) {
      super();
      pools.push(this);
    }
    async connect() {
      await options.connect?.(this);
      return this;
    }
    request() {
      const request = new FakeRequest(options.request ?? (() => undefined));
      requests.push(request);
      return request;
    }
    async close() {
      this.closed += 1;
    }
  }
  const module = {
    ConnectionPool: FakePool,
    Int: () => ({ type: "int" }),
    NVarChar: (length: number) => ({ type: "nvarchar", length }),
  };
  return { module, pools, requests };
}
type FakePool = InstanceType<ReturnType<typeof fakeModule>["module"]["ConnectionPool"]>;

afterEach(() => {
  vi.useRealTimers();
});

describe("SQL catalog trusted coordinates", () => {
  it.each([
    ["fixture-db.database.fabric.microsoft.com", "sql-database", "fixture-db.database.fabric.microsoft.com"],
    ["Fixture-DB.database.fabric.microsoft.com,1433", "sql-database", "fixture-db.database.fabric.microsoft.com"],
    ["tcp:fixture-db.database.fabric.microsoft.com,1433", "sql-database", "fixture-db.database.fabric.microsoft.com"],
    ["abc-123.datawarehouse.fabric.microsoft.com", "warehouse", "abc-123.datawarehouse.fabric.microsoft.com"],
    ["abc-123.datawarehouse.fabric.microsoft.com", "lakehouse-sql-endpoint", "abc-123.datawarehouse.fabric.microsoft.com"],
    ["abc-123.datawarehouse.fabric.microsoft.com", "mirrored-database-sql-endpoint", "abc-123.datawarehouse.fabric.microsoft.com"],
  ] as const)("accepts %s for %s", (value, kind, expected) => {
    expect(trustedSqlHost(value, kind)).toBe(expected);
  });

  it.each([
    "",
    "datawarehouse.fabric.microsoft.com",
    "abc.datawarehouse.fabric.microsoft.com.evil.test",
    "abc.datawarehouse.fabric.microsoft.com,1434",
    "abc.datawarehouse.fabric.microsoft.com,1433,1433",
    "abc.datawarehouse.fabric.microsoft.com;Encrypt=False",
    "https://abc.datawarehouse.fabric.microsoft.com",
    "user@abc.datawarehouse.fabric.microsoft.com",
    "abc .datawarehouse.fabric.microsoft.com",
    "abc_def.datawarehouse.fabric.microsoft.com",
    "abc.database.fabric.microsoft.com",
    `${"a".repeat(64)}.datawarehouse.fabric.microsoft.com`,
    "abc.datawarehouse.fabric.microsoft.com\u0000",
  ])("rejects warehouse host %j", (value) => {
    expect(() => trustedSqlHost(value, "warehouse")).toThrow(SqlCoordinateError);
  });

  it("validates SQL Database names without allowing connection-string syntax", () => {
    expect(trustedSqlDatabaseName(" Sales DB-1 (prod) ")).toBe("Sales DB-1 (prod)");
    for (const value of ["", "a;b", "a=b", "{a}", "[a]", "a'b", 'a"b', "a\\b", "a\nb", "x".repeat(129), 1]) {
      expect(() => trustedSqlDatabaseName(value)).toThrow(SqlCoordinateError);
    }
  });
});

describe("SQL catalog fixed parameters", () => {
  it("binds every placeholder of every fixed query", () => {
    for (const name of Object.keys(SQL_CATALOG_QUERIES) as (keyof typeof SQL_CATALOG_QUERIES)[]) {
      const text = SQL_CATALOG_QUERIES[name];
      const placeholders = [...new Set([...text.matchAll(/@([A-Za-z]+)/g)].map((match) => match[1]))].sort();
      const parameters = sqlCatalogParameters(name, 10);
      expect(parameters.map((parameter) => parameter.name).sort()).toEqual(placeholders);
      expect(parameters.find((parameter) => parameter.name === "rowLimit")).toEqual({ name: "rowLimit", type: "int", value: 11 });
    }
  });
});

describe("SQL driver error classification", () => {
  it.each([
    [{ code: "ELOGIN" }, "connect", "authorization-failed"],
    [{ code: "ELOGIN", originalError: { isTransient: true } }, "connect", "sql-transient"],
    [{ code: "ETIMEOUT" }, "query", "sql-timeout"],
    [{ code: "ECANCEL" }, "query", "cancelled"],
    [{ code: "ESOCKET" }, "connect", "sql-transient"],
    [{ code: "EREQUEST", number: 229 }, "query", "authorization-failed"],
    [{ code: "EREQUEST", originalError: { info: { number: 916 } } }, "query", "authorization-failed"],
    [{ code: "EREQUEST", number: 10928 }, "query", "sql-throttled"],
    [{ code: "EREQUEST", number: 40613 }, "connect", "sql-transient"],
    [{ code: "EREQUEST", number: 208 }, "query", "sql-catalog-query-failed"],
    [new Error("private"), "connect", "sql-connection-failed"],
    ["private", "query", "sql-catalog-query-failed"],
  ] as const)("maps %j during %s to %s", (error, phase, expected) => {
    expect(classifySqlError(error, phase)).toBe(expected);
  });
});

describe("mssql catalog driver", () => {
  it("connects with TLS, certificate validation, the access token and no driver retries", async () => {
    const fake = fakeModule();
    const session = await createMssqlCatalogDriver(async () => ({ default: fake.module })).connect(TARGET, TOKEN, {
      timeoutMs: 7_000,
      requestTimeoutMs: 9_000,
    });
    expect(fake.pools[0].config).toEqual({
      server: TARGET.server,
      port: 1433,
      database: TARGET.database,
      connectionTimeout: 7_000,
      requestTimeout: 9_000,
      pool: { min: 0, max: 1, idleTimeoutMillis: 1_000 },
      options: {
        encrypt: true,
        trustServerCertificate: false,
        readOnlyIntent: false,
        appName: "FabricAtlas-catalog",
        maxRetriesOnTransientErrors: 0,
        abortTransactionOnError: true,
      },
      authentication: { type: "azure-active-directory-access-token", options: { token: TOKEN } },
    });
    await session.close();
    expect(fake.pools[0].closed).toBe(1);
  });

  it("streams typed parameterized queries and stops reading past the row bound", async () => {
    const fake = fakeModule({
      request: (request) => {
        if (request.text !== SQL_CATALOG_QUERIES.schemas) return;
        for (const row of [{ schema_name: "a" }, { schema_name: "b" }, { schema_name: "c" }]) request.emit("row", row);
      },
    });
    const session = await createMssqlCatalogDriver(async () => fake.module).connect(TARGET, TOKEN, {
      timeoutMs: 1_000,
      requestTimeoutMs: 1_000,
    });
    const result = await session.query(SQL_CATALOG_QUERIES.schemas, sqlCatalogParameters("schemas", 2), QUERY_OPTIONS);
    expect(result).toEqual({ rows: [{ schema_name: "a" }, { schema_name: "b" }], truncated: true });
    const request = fake.requests[0];
    expect(request.stream).toBe(true);
    expect(request.text).toBe(SQL_CATALOG_QUERIES.schemas);
    expect(request.cancelled).toBe(1);
    expect(request.inputs).toEqual([
      { name: "rowLimit", type: fake.module.Int, value: 3 },
      { name: "defaultSchemaId", type: fake.module.Int, value: 1 },
      { name: "firstUserSchemaId", type: fake.module.Int, value: 5 },
      { name: "firstRoleSchemaId", type: fake.module.Int, value: 16_384 },
    ]);
    const objects = await session.query(SQL_CATALOG_QUERIES.objects, sqlCatalogParameters("objects", 2), QUERY_OPTIONS);
    expect(objects).toEqual({ rows: [], truncated: false });
    expect(fake.requests[1].inputs.slice(1)).toEqual([
      { name: "tableType", type: { type: "nvarchar", length: 128 }, value: "U" },
      { name: "viewType", type: { type: "nvarchar", length: 128 }, value: "V" },
    ]);
  });

  it("fails closed on oversized streams, server errors, timeouts and cancellation", async () => {
    const oversized = fakeModule({ request: (request) => void request.emit("row", { name: "x".repeat(2_048) }) });
    const big = await createMssqlCatalogDriver(async () => oversized.module).connect(TARGET, TOKEN, { timeoutMs: 1_000, requestTimeoutMs: 1_000 });
    await expect(big.query(SQL_CATALOG_QUERIES.schemas, [], QUERY_OPTIONS)).rejects.toMatchObject({ code: "response-size-exceeded" });
    expect(oversized.requests[0].cancelled).toBe(1);

    const denied = fakeModule({
      request: (request) => void request.emit("error", Object.assign(new Error("private permission detail"), { code: "EREQUEST", number: 229 })),
    });
    const deniedSession = await createMssqlCatalogDriver(async () => denied.module).connect(TARGET, TOKEN, { timeoutMs: 1_000, requestTimeoutMs: 1_000 });
    const failure = deniedSession.query(SQL_CATALOG_QUERIES.schemas, [], QUERY_OPTIONS);
    await expect(failure).rejects.toMatchObject({ code: "authorization-failed" });
    await expect(failure).rejects.not.toThrow("private");

    const hanging = fakeModule({ request: (request) => request.hang() });
    const slow = await createMssqlCatalogDriver(async () => hanging.module).connect(TARGET, TOKEN, { timeoutMs: 1_000, requestTimeoutMs: 1_000 });
    await expect(slow.query(SQL_CATALOG_QUERIES.schemas, [], { ...QUERY_OPTIONS, timeoutMs: 5 })).rejects.toMatchObject({ code: "sql-timeout" });

    const controller = new AbortController();
    const cancelled = fakeModule({
      request: (request) => {
        const pending = request.hang();
        controller.abort();
        return pending;
      },
    });
    const cancelling = await createMssqlCatalogDriver(async () => cancelled.module).connect(TARGET, TOKEN, { timeoutMs: 1_000, requestTimeoutMs: 1_000 });
    await expect(
      cancelling.query(SQL_CATALOG_QUERIES.schemas, [], { ...QUERY_OPTIONS, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "cancelled" });
  });

  it("maps connection failures to fixed codes and always closes the pool", async () => {
    const login = fakeModule({
      connect: async () => {
        throw Object.assign(new Error("Login failed for user 'private@contoso.com'"), { code: "ELOGIN" });
      },
    });
    const failure = createMssqlCatalogDriver(async () => login.module).connect(TARGET, TOKEN, { timeoutMs: 1_000, requestTimeoutMs: 1_000 });
    await expect(failure).rejects.toMatchObject({ code: "authorization-failed" });
    await expect(failure).rejects.not.toThrow("contoso");
    expect(login.pools[0].closed).toBe(1);

    const stalled = fakeModule({ connect: (pool) => new Promise((_resolve, reject) => pool.once("closing", reject)) });
    const originalClose = stalled.module.ConnectionPool.prototype.close;
    stalled.module.ConnectionPool.prototype.close = async function (this: FakePool) {
      this.emit("closing", Object.assign(new Error("closed"), { code: "ECONNCLOSED" }));
      return originalClose.call(this);
    };
    await expect(
      createMssqlCatalogDriver(async () => stalled.module).connect(TARGET, TOKEN, { timeoutMs: 5, requestTimeoutMs: 5 }),
    ).rejects.toMatchObject({ code: "sql-timeout" });

    const controller = new AbortController();
    controller.abort();
    await expect(
      createMssqlCatalogDriver(async () => login.module).connect(TARGET, TOKEN, { timeoutMs: 1_000, requestTimeoutMs: 1_000, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "cancelled" });
  });

  it("reports an unavailable or malformed TDS runtime", async () => {
    const missing = createMssqlCatalogDriver(async () => {
      throw new Error("Cannot find module 'mssql' at private path");
    });
    await expect(missing.connect(TARGET, TOKEN, { timeoutMs: 1_000, requestTimeoutMs: 1_000 })).rejects.toEqual(
      new SqlDriverError("tds-runtime-unavailable"),
    );
    const malformed = createMssqlCatalogDriver(async () => ({ default: {} }));
    await expect(malformed.connect(TARGET, TOKEN, { timeoutMs: 1_000, requestTimeoutMs: 1_000 })).rejects.toMatchObject({
      code: "tds-runtime-unavailable",
    });
  });

  it("recognizes the installed mssql module shape", async () => {
    // The driver is installed only in the Functions package; load it through Node's CommonJS resolver.
    const installed = createRequire(import.meta.url)("../../rayfin/functions/node_modules/mssql") as Record<string, unknown>;
    expect(typeof installed.ConnectionPool).toBe("function");
    const fake = fakeModule();
    // Swap only the pool so no network connection is attempted.
    const loaded = { default: { ...installed, ConnectionPool: fake.module.ConnectionPool } };
    const session = await createMssqlCatalogDriver(async () => loaded).connect(TARGET, TOKEN, { timeoutMs: 1_000, requestTimeoutMs: 1_000 });
    await session.query(SQL_CATALOG_QUERIES.foreignKeys, sqlCatalogParameters("foreignKeys", 1), QUERY_OPTIONS);
    expect(fake.requests[0].inputs[0].type).toBe(installed.Int);
  }, 60_000);
});
