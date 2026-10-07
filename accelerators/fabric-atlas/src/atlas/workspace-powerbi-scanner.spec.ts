// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { AppFunctionsSchema } from "../../rayfin/functions/src/types";
import { SYNCHRONIZER_AUTHORITY_ID } from "../../rayfin/functions/src/synchronizer-gate";
import {
  POWERBI_SCANNER_LIMITS, POWERBI_SCOPE, type ScannerDependencies,
} from "../../rayfin/functions/src/powerbi-scanner-rest";
import {
  projectPowerBiScanner, type ScannerExpectedItemsInput, type ScannerStageEnvelope,
} from "../../rayfin/functions/src/powerbi-scanner-projection";
import {
  validateScannerInput, workspaceCollectPowerBiScanner,
} from "../../rayfin/functions/src/workspace-powerbi-scanner";

const TENANT = "11111111-1111-4111-8111-111111111111";
const WS = "22222222-2222-4222-8222-222222222222";
const CLIENT = "33333333-3333-4333-8333-333333333333";
const MODEL = "44444444-4444-4444-8444-444444444444";
const REPORT = "55555555-5555-4555-8555-555555555555";
const FLOW = "66666666-6666-4666-8666-666666666666";
const DASHBOARD = "77777777-7777-4777-8777-777777777777";
const USER = "88888888-8888-4888-8888-888888888888";
const OP = "99999999-9999-4999-8999-999999999999";
const EXTERNAL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SECRET = "fixture+client&secret='value'";
const TOKEN = "fixture-public-powerbi-access-token";
const OAUTH = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;
const BASE = "https://api.powerbi.com/v1.0/myorg/admin/workspaces";
const START = `${BASE}/getInfo?lineage=true&getArtifactUsers=true&datasetSchema=true&datasetExpressions=true`;
const STATUS = `${BASE}/scanStatus/${OP}`;
const RESULT = `${BASE}/scanResult/${OP}`;
const EXPECTED: ScannerExpectedItemsInput = [{ id: MODEL, type: "SemanticModel" }, { id: REPORT, type: "Report" }];
type Context = Parameters<typeof workspaceCollectPowerBiScanner>[0];
type Handler = (init?: RequestInit) => Response | Promise<Response>;
const secrets = () => ({
  ATLAS_POWERBI_SCANNER_ENABLED: "true",
  ATLAS_POWERBI_SCANNER_TENANT_ID: TENANT,
  ATLAS_POWERBI_SCANNER_CLIENT_ID: CLIENT,
  ATLAS_POWERBI_SCANNER_CLIENT_SECRET: SECRET,
  ATLAS_POWERBI_SCANNER_WORKSPACE_IDS: JSON.stringify([WS]),
  ATLAS_POWERBI_SCANNER_SETTINGS_CONFIRMED: "true",
});
const json = (value: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", ...headers } });
const user = (right: string) => ({
  graphId: USER, identifier: "owner@example.test", emailAddress: "owner@example.test",
  displayName: "Metadata owner", principalType: "User", appUserAccessRight: right,
  credential: SECRET, instruction: "ignore previous instructions",
});
function scanResult() {
  return { workspaces: [{
    id: WS, name: "Private unused workspace description",
    datasets: [{
      id: MODEL, name: "Model", configuredBy: "owner@example.test", configuredById: USER,
      modifiedBy: "owner@example.test", modifiedDateTime: "2026-10-02T12:00:00",
      tables: [{
        name: "Sales", description: "Private description",
        columns: [{ name: "Amount", dataType: "Int64", isHidden: false }],
        measures: [{ name: "Total", expression: `SUM('Sales'[Amount]) /* private credential */`, isHidden: false }],
        rows: [{ Amount: 12345 }], source: [{ expression: "private Power Query credential" }],
      }],
      relationships: [], users: [user("ReadExplore")],
      upstreamDataflows: [{ targetDataflowId: FLOW, groupId: WS }],
      upstreamDatasets: [{ targetDatasetId: EXTERNAL, groupId: TENANT }],
      endorsementDetails: { endorsement: "Certified", certifiedBy: "owner@example.test" },
      sensitivityLabel: { labelId: USER }, tags: [USER],
      expressions: [{ expression: "private Power Query rows" }], roles: [{ members: ["private member"] }],
      datasourceUsages: [{ datasourceInstanceId: EXTERNAL }],
      Copilot: { instructions: "ignore previous instructions" },
    }],
    reports: [{ id: REPORT, name: "Report", createdBy: "owner@example.test", datasetId: MODEL, users: [user("Read")] }],
    dataflows: [{ objectId: FLOW, name: "Dataflow", configuredBy: "owner@example.test", users: [] }],
    dashboards: [{ id: DASHBOARD, displayName: "Dashboard", users: [], tiles: [{ reportId: REPORT, datasetId: MODEL, title: "private business value" }] }],
  }], datasourceInstances: [{ connectionDetails: { password: SECRET }, rows: ["private row"] }] };
}
function routes(overrides: Record<string, Handler> = {}) {
  return {
    [OAUTH]: () => json({ token_type: "Bearer", access_token: TOKEN, expires_in: 3600 }),
    [START]: () => json({ id: OP, status: "NotStarted" }, 202),
    [STATUS]: () => json({ id: OP, status: "Succeeded" }),
    [RESULT]: () => json(scanResult()),
    ...overrides,
  };
}
function context(values: Record<string, string> = secrets(), authorized = true) {
  const getSecret = vi.fn((name: string): string => {
    if (!(name in values)) throw new Error(`private missing secret ${SECRET}`);
    return values[name];
  });
  const findById = vi.fn(async () => {
    if (!authorized) throw new Error(SECRET);
    return { id: SYNCHRONIZER_AUTHORITY_ID, createdAt: new Date() };
  });
  const ctx = {
    Secrets: new Proxy({}, { get: (_object, name) => getSecret(String(name)) }),
    get Tokens(): never { throw new Error("Platform/browser tokens must not be read"); },
    getDataClient: () => ({ SynchronizerAuthority: { findById, create: vi.fn() } }),
  } as unknown as Context;
  return { ctx, getSecret, findById };
}
function collect(
  responses: Record<string, Handler> = routes(), values = secrets(), dependencies: ScannerDependencies = {},
  expectedItems = EXPECTED,
) {
  const { ctx, getSecret, findById } = context(values);
  const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
    const handler = responses[String(url)];
    if (!handler) throw new Error("Unexpected fixture endpoint");
    return handler(init);
  });
  const result = workspaceCollectPowerBiScanner(ctx, 1, TENANT, WS, expectedItems, null, {
    fetch: fetchImpl, sleep: async () => undefined, ...dependencies,
  });
  return { result, fetchImpl, getSecret, findById };
}
afterEach(() => vi.restoreAllMocks());

describe("optional scanner Secret Store and caller boundary", () => {
  it("is disabled by default without reading credentials or making requests", async () => {
    const { result, fetchImpl, getSecret } = collect(routes(), {} as ReturnType<typeof secrets>);
    const envelope = await result;
    expect(envelope.sections.scanner).toEqual({ status: "unsupported", code: "adapter-disabled" });
    expect(envelope.readyForScannerMerge).toBe(false);
    expect(envelope.items).toEqual([]);
    expect(getSecret.mock.calls).toEqual([["ATLAS_POWERBI_SCANNER_ENABLED"]]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("cannot be enabled through invocation parameters or a malformed switch", async () => {
    const disabled = collect(routes(), { ...secrets(), ATLAS_POWERBI_SCANNER_ENABLED: "false" });
    expect((await disabled.result).sections.scanner.code).toBe("adapter-disabled");
    expect(disabled.fetchImpl).not.toHaveBeenCalled();
    const malformed = collect(routes(), { ...secrets(), ATLAS_POWERBI_SCANNER_ENABLED: "TRUE" });
    expect((await malformed.result).sections.scanner.code).toBe("scanner-configuration-required");
    expect(malformed.fetchImpl).not.toHaveBeenCalled();
  });
  it("requires explicit operator confirmation of tenant settings before credentials/OAuth", async () => {
    const values = secrets();
    delete (values as Partial<typeof values>).ATLAS_POWERBI_SCANNER_SETTINGS_CONFIRMED;
    const { result, fetchImpl, getSecret } = collect(routes(), values);
    expect((await result).sections.scanner.code).toBe("tenant-settings-unconfirmed");
    expect(getSecret.mock.calls).not.toContainEqual(["ATLAS_POWERBI_SCANNER_CLIENT_SECRET"]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it.each([
    { ATLAS_POWERBI_SCANNER_TENANT_ID: "common" },
    { ATLAS_POWERBI_SCANNER_CLIENT_ID: "invalid" },
    { ATLAS_POWERBI_SCANNER_CLIENT_SECRET: "" },
    { ATLAS_POWERBI_SCANNER_WORKSPACE_IDS: "[]" },
    { ATLAS_POWERBI_SCANNER_WORKSPACE_IDS: JSON.stringify([WS, WS.toUpperCase()]) },
    { ATLAS_POWERBI_SCANNER_WORKSPACE_IDS: '{"endpoint":"https://private.invalid"}' },
  ])("fails closed on missing/malformed server configuration", async (values) => {
    const { result, fetchImpl } = collect(routes(), { ...secrets(), ...values });
    const envelope = await result;
    expect(envelope.sections.scanner.code).toBe("scanner-configuration-required");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(JSON.stringify(envelope)).not.toContain(SECRET);
  });
  it("does not expose an exception from a missing deployed client-secret accessor", async () => {
    const values = secrets();
    delete (values as Partial<typeof values>).ATLAS_POWERBI_SCANNER_CLIENT_SECRET;
    const { result, fetchImpl } = collect(routes(), values);
    expect((await result).sections.scanner.code).toBe("scanner-configuration-required");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("rejects unapproved tenant/workspace scope before any outbound request", async () => {
    const { ctx } = context();
    const fetchImpl = vi.fn();
    const tenant = await workspaceCollectPowerBiScanner(ctx, 1, EXTERNAL, WS, [], null, { fetch: fetchImpl });
    const workspace = await workspaceCollectPowerBiScanner(ctx, 1, TENANT, EXTERNAL, [], null, { fetch: fetchImpl });
    expect(tenant.sections.scanner.code).toBe("scanner-scope-not-approved");
    expect(workspace.sections.scanner.code).toBe("scanner-scope-not-approved");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("authorizes the synchronizer before even reading the enable switch", async () => {
    const { ctx, getSecret } = context(secrets(), false);
    const fetchImpl = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(workspaceCollectPowerBiScanner(ctx, 1, TENANT, WS, [], null, { fetch: fetchImpl }))
      .rejects.toThrow("configured Atlas administrator");
    expect(getSecret).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(SECRET);
  });
  it.each([
    [2, TENANT, WS, [], null],
    [1, "common", WS, [], null],
    [1, TENANT, `${WS}?token=private`, [], null],
    [1, TENANT, WS, [{ id: MODEL, type: "SemanticModel", token: SECRET }], null],
    [1, TENANT, WS, [{ id: MODEL, type: "Notebook" }], null],
    [1, TENANT, WS, [...EXPECTED, ...EXPECTED], null],
    [1, TENANT, WS, [], "private"],
  ])("strictly validates identifiers/types without echoing caller input", (...args) => {
    expect(() => validateScannerInput(...args as [unknown, unknown, unknown, unknown, unknown]))
      .toThrow("Use protocolVersion 1");
  });
});

describe("public OAuth and scanner protocol", () => {
  it("uses public client credentials, the fixed Power BI default scope and scanner APIs only", async () => {
    const { result, fetchImpl, findById } = collect();
    const envelope = await result;
    expect(findById).toHaveBeenCalledWith(SYNCHRONIZER_AUTHORITY_ID);
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([OAUTH, START, STATUS, RESULT]);
    const oauth = fetchImpl.mock.calls[0][1]!;
    const form = new URLSearchParams(String(oauth.body));
    expect([...form.keys()].sort()).toEqual(["client_id", "client_secret", "grant_type", "scope"]);
    expect(form.get("client_secret")).toBe(SECRET);
    expect(form.get("client_id")).toBe(CLIENT);
    expect(form.get("scope")).toBe(POWERBI_SCOPE);
    expect(form.get("grant_type")).toBe("client_credentials");
    expect(oauth.headers).not.toHaveProperty("Authorization");
    for (const [url, init] of fetchImpl.mock.calls) {
      expect(String(url)).not.toContain(SECRET);
      expect(init?.redirect).toBe("manual");
    }
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1]?.body))).toEqual({ workspaces: [WS] });
    expect(START).not.toContain("datasourceDetails");
    expect(fetchImpl.mock.calls[1][1]?.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    expect(envelope.authoritative).toBe(false);
    expect(envelope.readyForScannerMerge).toBe(true);
    expect(JSON.stringify(envelope)).not.toContain(SECRET);
    expect(JSON.stringify(envelope)).not.toContain(TOKEN);
  });
  it("requires a successful status poll before obtaining results and ignores Location URLs", async () => {
    let calls = 0;
    const { result, fetchImpl } = collect(routes({
      [START]: () => json({ id: OP, status: "Succeeded" }, 202, { location: "https://private.invalid/result" }),
      [STATUS]: () => json({ id: OP, status: ++calls === 1 ? "Running" : "Succeeded" }),
    }));
    expect((await result).readyForScannerMerge).toBe(true);
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([OAUTH, START, STATUS, STATUS, RESULT]);
  });
  it.each([
    { token_type: "Bearer", access_token: TOKEN, expires_in: 1 },
    { token_type: "Unknown", access_token: TOKEN, expires_in: 3600 },
    { token_type: "Bearer", access_token: "invalid token", expires_in: 3600 },
    { token_type: "Bearer", expires_in: 3600 },
  ])("rejects malformed/short-lived OAuth results before scanner invocation", async (body) => {
    const { result, fetchImpl } = collect(routes({ [OAUTH]: () => json(body) }));
    expect((await result).sections.scanner.code).toBe("oauth-response-invalid");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it.each([400, 401, 403])("sanitizes OAuth HTTP %s failures without provider details", async (status) => {
    const { result, fetchImpl } = collect(routes({ [OAUTH]: () => json({ error_description: SECRET }, status) }));
    const envelope = await result;
    expect(envelope.sections.scanner).toEqual({ status: "unsupported", code: "oauth-credentials-rejected" });
    expect(JSON.stringify(envelope)).not.toContain(SECRET);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403])("reports tenant admin API configuration on scanner HTTP %s", async (status) => {
    const { result } = collect(routes({ [START]: () => json({ error: SECRET }, status) }));
    const envelope = await result;
    expect(envelope.sections.scanner).toEqual({ status: "unsupported", code: "tenant-admin-settings-required" });
    expect(envelope.blockers[0].requiredSetup).toContain("security group");
    expect(envelope.items).toEqual([]);
    expect(JSON.stringify(envelope)).not.toContain(SECRET);
  });
  it("never retries an ambiguous scan-start failure and never leaks network error details", async () => {
    for (const handler of [
      () => json({ detail: SECRET }, 503),
      () => { throw new TypeError(SECRET); },
    ]) {
      const { result, fetchImpl } = collect(routes({ [START]: handler }));
      const envelope = await result;
      expect(envelope.sections.scanner.code).toBe("scan-start-outcome-unknown");
      expect(fetchImpl.mock.calls.filter(([url]) => String(url) === START)).toHaveLength(1);
      expect(JSON.stringify(envelope)).not.toContain(SECRET);
    }
  });
  it("bounds throttling retries and honors a deferred Retry-After", async () => {
    const { result, fetchImpl } = collect(routes({ [START]: () => json({ message: SECRET }, 429, { "retry-after": "0" }) }));
    expect((await result).sections.scanner.code).toBe("rate-limited");
    expect(fetchImpl.mock.calls.filter(([url]) => String(url) === START)).toHaveLength(3);
    const deferred = await collect(routes({ [STATUS]: () => json({}, 429, { "retry-after": "60" }) })).result;
    expect(deferred.sections.scanner.code).toBe("retry-after-deferred");
  });
  it.each(["Failed", "Unknown"])("fails closed on scan status %s and does not fetch results", async (status) => {
    const { result, fetchImpl } = collect(routes({ [STATUS]: () => json({ id: OP, status, error: SECRET }) }));
    const envelope = await result;
    expect(envelope.sections.scanner.status).toBe("failed");
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).not.toContain(RESULT);
    expect(JSON.stringify(envelope)).not.toContain(SECRET);
  });
  it("bounds polls, HTTP attempts, result size, output size, deadline and cancellation", async () => {
    const pending = collect(routes({ [STATUS]: () => json({ status: "Running" }) }), secrets(), { limits: { maxPolls: 2 } });
    expect((await pending.result).sections.scanner.code).toBe("scan-incomplete");
    expect(pending.fetchImpl.mock.calls.map(([url]) => String(url))).not.toContain(RESULT);
    expect((await collect(routes(), secrets(), { limits: { maxRequests: 1 } }).result).sections.scanner.code).toBe("request-budget-exhausted");
    expect((await collect(routes(), secrets(), { limits: { maxResultBytes: 20 } }).result).sections.scanner.code).toBe("response-size-exceeded");
    expect((await collect(routes(), secrets(), { limits: { maxEnvelopeBytes: 20 } }).result).sections.scanner.code).toBe("response-size-exceeded");
    const controller = new AbortController();
    controller.abort();
    const cancelled = collect(routes(), secrets(), { signal: controller.signal });
    expect((await cancelled.result).sections.scanner.code).toBe("cancelled");
    expect(cancelled.fetchImpl).not.toHaveBeenCalled();
    let now = 0;
    const expired = await collect(routes({ [START]: () => {
      now = 149_999; return json({ id: OP }, 202);
    } }), secrets(), { now: () => now }).result;
    expect(expired.sections.scanner.code).toBe("deadline-exhausted");
  });
  it("times out stalled requests and stalled streamed bodies", async () => {
    for (const handler of [
      () => new Promise<Response>(() => undefined),
      () => new Response(new ReadableStream({ start() {} })),
    ]) {
      const envelope = await collect(routes({ [STATUS]: handler }), secrets(), { limits: { requestTimeoutMs: 15 } }).result;
      expect(envelope.sections.scanner.code).toBe("request-timeout");
      expect(envelope.items).toEqual([]);
    }
  });
  it("rejects redirects, foreign operation IDs and malformed JSON without exposing bodies", async () => {
    const cases: Record<string, Handler>[] = [
      { [OAUTH]: () => new Response(null, { status: 302, headers: { location: `https://private.invalid/${SECRET}` } }) },
      { [STATUS]: () => json({ id: EXTERNAL, status: "Succeeded" }) },
      { [RESULT]: () => new Response(SECRET, { status: 200 }) },
    ];
    for (const overrides of cases) {
      const { result, fetchImpl } = collect(routes(overrides));
      const envelope = await result;
      expect(envelope.sections.scanner.status).toBe("failed");
      expect(envelope.items).toEqual([]);
      expect(JSON.stringify(envelope)).not.toContain(SECRET);
      expect(fetchImpl.mock.calls.every(([url]) => [OAUTH, START, STATUS, RESULT].includes(String(url)))).toBe(true);
    }
  });
});

describe("scanner metadata projection and honest coverage", () => {
  it("preserves existing model/RawSync contracts and same-workspace lineage", async () => {
    const envelope = await collect().result;
    expect(envelope.schema[MODEL][0]).toMatchObject({
      name: "Sales", source: "Power BI admin scanner",
      measures: [{ name: "Total", expression: "SUM('Sales'[Amount])", expressionStatus: "sanitized" }],
    });
    expect(envelope.itemMetadata[MODEL]).toMatchObject({
      scannerMatched: true, ownerAvailable: true,
      owner: { displayName: "owner@example.test", source: "workspaceInfo.configuredBy" },
      endorsement: { value: "Certified" }, sensitivity: { labelId: USER }, tags: [{ id: USER }],
    });
    expect(envelope.itemMetadata[MODEL].owner).not.toHaveProperty("principalId");
    expect(envelope.itemMetadata[MODEL]).not.toHaveProperty("modifiedDateTime");
    expect(envelope.access[0]).toMatchObject({ itemId: MODEL, principalId: USER, principalType: "User", accessRight: "ReadExplore" });
    expect(envelope.lineage).toContainEqual({ source: FLOW, target: MODEL, relation: "dataflow" });
    expect(envelope.lineage).toContainEqual({ source: MODEL, target: REPORT, relation: "report" });
    expect(envelope.lineage).toContainEqual({ source: REPORT, target: DASHBOARD, relation: "dashboard report" });
    expect(envelope.boundaryReferences).toContainEqual({
      sourceItemId: EXTERNAL, targetItemId: MODEL, sourceWorkspaceId: TENANT, relation: "semantic model", reason: "external-workspace",
    });
    expect(envelope.lineage.some((edge) => edge.source === EXTERNAL)).toBe(false);
    expect(envelope.capabilities.engineDependencies.status).toBe("unsupported");
    expect(envelope.capabilities.reportPages.code).toBe("report-pages-not-collected");
    const text = JSON.stringify(envelope);
    for (const forbidden of [SECRET, TOKEN, "private", "Private", "instructions", '"rows":', "connectionDetails", "datasourceUsages", "roles", "sourceQuery"]) {
      expect(text).not.toContain(forbidden);
    }
  });
  it("never treats absent schema/expressions/users as empty complete metadata", async () => {
    const payload = scanResult();
    const dataset = payload.workspaces[0].datasets[0];
    delete (dataset as Partial<typeof dataset>).tables;
    delete (dataset as Partial<typeof dataset>).users;
    const envelope = await collect(routes({ [RESULT]: () => json(payload) })).result;
    expect(envelope.sections.schema.code).toBe("detailed-metadata-setting-required");
    expect(envelope.sections.expressions.code).toBe("expression-metadata-setting-required");
    expect(envelope.sections.access.code).toBe("scanner-artifact-users-required");
    expect(envelope.readyForScannerMerge).toBe(false);
    expect(envelope.blockers.map((blocker) => blocker.code)).toEqual(expect.arrayContaining([
      "detailed-metadata-setting-required", "expression-metadata-setting-required", "scanner-artifact-users-required",
    ]));
  });
  it("marks omitted expression fields as a tenant metadata blocker", async () => {
    const payload = scanResult();
    delete (payload.workspaces[0].datasets[0].tables[0].measures[0] as { expression?: string }).expression;
    const envelope = await collect(routes({ [RESULT]: () => json(payload) })).result;
    expect(envelope.sections.expressions.code).toBe("expression-metadata-setting-required");
    expect(envelope.readyForScannerMerge).toBe(false);
  });
  it("omits DAX inline rows/string values without blaming a configured tenant setting", async () => {
    const payload = scanResult();
    payload.workspaces[0].datasets[0].tables[0].measures[0].expression = 'DATATABLE("private",INTEGER,{{12345}})';
    const envelope = await collect(routes({ [RESULT]: () => json(payload) })).result;
    expect(envelope.sections.expressions.code).toBe("metadata-only-policy");
    expect(envelope.schema[MODEL][0].measures[0].expression).toBeUndefined();
    expect(envelope.readyForScannerMerge).toBe(false);
  });
  it("checks expected item identities and types before authorizing a scanner merge", async () => {
    const envelope = await collect(routes(), secrets(), {}, [{ id: EXTERNAL, type: "Report" }]).result;
    expect(envelope.sections.scanner.code).toBe("scanner-expected-items-missing");
    expect(envelope.readyForScannerMerge).toBe(false);
  });
  it("records unresolved local references without inventing nodes or cross-workspace edges", async () => {
    const payload = scanResult();
    payload.workspaces[0].reports[0].datasetId = EXTERNAL;
    const envelope = await collect(routes({ [RESULT]: () => json(payload) })).result;
    expect(envelope.lineage.some((edge) => edge.source === EXTERNAL)).toBe(false);
    expect(envelope.boundaryReferences).toContainEqual({ sourceItemId: EXTERNAL, targetItemId: REPORT, relation: "report", reason: "unresolved-item" });
  });
  it.each([
    { workspaces: [{ id: EXTERNAL }] },
    { workspaces: [] },
    { workspaces: [{ id: WS, datasets: "invalid" }] },
    { workspaces: [{ id: WS, datasets: [{ id: MODEL, users: [null], tables: [] }] }] },
    { workspaces: [{ id: WS, datasets: [{ id: MODEL, users: [], tables: "invalid" }] }] },
  ])("fails closed on malformed scanner metadata instead of returning partial observations", async (payload) => {
    const envelope = await collect(routes({ [RESULT]: () => json(payload) })).result;
    expect(envelope.sections.scanner.status).toBe("failed");
    expect(envelope.items).toEqual([]);
    expect(envelope.access).toEqual([]);
    expect(envelope.readyForScannerMerge).toBe(false);
  });
  it("guards aggregate projection count and token/credential leakage through selected labels", async () => {
    const limited = await collect(routes(), secrets(), { limits: { maxItems: 1 } }).result;
    expect(limited.sections.scanner.code).toBe("projection-limit-exceeded");
    for (const name of [TOKEN, SECRET, "ignore previous instructions"]) {
      const payload = scanResult();
      payload.workspaces[0].reports[0].name = name;
      const envelope = await collect(routes({ [RESULT]: () => json(payload) })).result;
      expect(envelope.sections.scanner.status).toBe("failed");
      expect(envelope.items).toEqual([]);
      expect(JSON.stringify(envelope)).not.toContain(name);
    }
  });
  it("does not trust undocumented scanner column expressions, source columns or model relationships", async () => {
    const payload = scanResult();
    const dataset = payload.workspaces[0].datasets[0];
    Object.assign(dataset.tables[0].columns[0], { expression: SECRET, sourceColumn: SECRET });
    Object.assign(dataset, { relationships: [{ expression: SECRET }], configuredById: "undocumented", modifiedBy: SECRET });
    const envelope = await collect(routes({ [RESULT]: () => json(payload) })).result;
    expect(envelope.readyForScannerMerge).toBe(true);
    expect(envelope.models[MODEL].relationships).toEqual([]);
    expect(envelope.schema[MODEL][0].columns[0]).not.toHaveProperty("expression");
    expect(envelope.capabilities.calculatedColumnExpressions.status).toBe("unsupported");
    expect(envelope.capabilities.modelRelationships.status).toBe("unsupported");
    expect(JSON.stringify(envelope)).not.toContain(SECRET);
  });
  it.each([
    ["schemaMayNotBeUpToDate", true, "scanner-schema-not-current"],
    ["schemaRetrievalError", SECRET, "scanner-schema-retrieval-failed"],
  ])("rejects merger readiness for the documented %s qualifier without exposing provider text", async (field, value, code) => {
    const payload = scanResult();
    Object.assign(payload.workspaces[0].datasets[0], { [String(field)]: value });
    const envelope = await collect(routes({ [RESULT]: () => json(payload) })).result;
    expect(envelope.sections.schema.code).toBe(code);
    expect(envelope.readyForScannerMerge).toBe(false);
    expect(JSON.stringify(envelope)).not.toContain(SECRET);
  });
  it("supports the documented DataflowUserAccessRight spelling and whole-organization access", async () => {
    const payload = scanResult();
    Object.assign(payload.workspaces[0].dataflows[0], {
      users: [{ principalType: "None", DataflowUserAccessRight: "Read", displayName: "Entire organization" }],
    });
    const envelope = await collect(routes({ [RESULT]: () => json(payload) })).result;
    expect(envelope.access).toContainEqual({
      itemId: FLOW, principalId: "entire-tenant", principalName: "Entire organization",
      principalType: "None", tenantWide: true, accessRight: "Read",
    });
  });
  it("reuses the reviewed model projection directly, without fabricated getDefinition payloads", () => {
    const result = projectPowerBiScanner(scanResult(), {
      tenantId: TENANT, workspaceId: WS, expectedItems: EXPECTED, correlationId: null,
    }, { ...POWERBI_SCANNER_LIMITS });
    expect(result.models[MODEL].dependencies).toContainEqual({
      table: "Sales", object: "Total", objectType: "measure", referencedTable: "Sales", referencedObject: "Amount",
      referencedObjectType: "column", source: "static-qualified-reference",
    });
  });
});

describe("deployed Secret Store and generated scanner contracts", () => {
  it("has only names/descriptions in YAML and a CLI-generated typed secret registry", () => {
    const yaml = readFileSync(resolve("rayfin/rayfin.yml"), "utf8");
    const registry = readFileSync(resolve("rayfin/functions/src/secrets.generated.ts"), "utf8");
    for (const name of Object.keys(secrets())) {
      expect(yaml).toContain(`name: ${name}`);
      expect(registry).toContain(`${name}: string;`);
    }
    expect(registry).toContain("AUTO-GENERATED");
    expect(yaml).not.toMatch(/^\s*value:/m);
    expect(yaml).not.toContain(SECRET);
    const handler = readFileSync(resolve("rayfin/functions/src/workspace-powerbi-scanner.ts"), "utf8");
    expect(handler).toContain("ctx.Secrets.ATLAS_POWERBI_SCANNER_CLIENT_SECRET");
    expect(handler).not.toMatch(/process\.env|ctx\.Tokens|ctx\.accessToken|ctx\.getSecret|console\./);
  });
  it("registers a deployed no-audience handler with no credential/token/endpoint input", () => {
    expectTypeOf<AppFunctionsSchema["workspaceCollectPowerBiScanner"]["input"]>().toEqualTypeOf<{
      protocolVersion: 1; tenantId: string; workspaceId: string; expectedItems: ScannerExpectedItemsInput; correlationId: string | null;
    }>();
    expectTypeOf<AppFunctionsSchema["workspaceCollectPowerBiScanner"]["output"]>().toEqualTypeOf<ScannerStageEnvelope>();
    const runtime = JSON.parse(readFileSync(resolve("rayfin/functions/runtimemetadata.json"), "utf8"));
    const binding = runtime.functions.find((entry: { functionName: string }) => entry.functionName === "workspaceCollectPowerBiScanner");
    expect(binding.contextAudiences).toEqual([]);
    expect(binding.delegateParameters.map((parameter: { name: string }) => parameter.name))
      .toEqual(["ctx", "protocolVersion", "tenantId", "workspaceId", "expectedItems", "correlationId"]);
    const schema = readFileSync(resolve("rayfin/functions/src/types.ts"), "utf8");
    const input = schema.split("workspaceCollectPowerBiScanner:")[1]?.split("output:")[0];
    expect(input).toBeDefined();
    expect(input).not.toMatch(/secret|token|credential|endpoint|enabled/i);
  });
});
