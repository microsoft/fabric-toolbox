// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  DEFINITION_PROJECTION_LIMITS,
  projectDefinition,
} from "../../rayfin/functions/src/definition-projections";
import { SYNCHRONIZER_AUTHORITY_ID } from "../../rayfin/functions/src/synchronizer-gate";
import type { AppFunctionsSchema } from "../../rayfin/functions/src/types";
import {
  collectWorkspaceDefinitions,
  validateCollectDefinitionsInput,
  workspaceCollectDefinitions,
  type CollectDefinitionDependencies,
  type DefinitionItemInput,
  type DefinitionStageEnvelope,
} from "../../rayfin/functions/src/workspace-definitions";
import { parseFabricItemMetadata } from "./item-metadata";
import { validateSyncEnrichment, type RawSync } from "./live-sync";

const WS = "11111111-1111-4111-8111-111111111111";
const ONTOLOGY = "22222222-2222-4222-8222-222222222222";
const GRAPH = "33333333-3333-4333-8333-333333333333";
const AGENT = "44444444-4444-4444-8444-444444444444";
const NOTEBOOK = "55555555-5555-4555-8555-555555555555";
const LAKEHOUSE = "66666666-6666-4666-8666-666666666666";
const OPERATION = "77777777-7777-4777-8777-777777777777";
const CORRELATION = "88888888-8888-4888-8888-888888888888";
const TOKEN = "fixture-fabric-token";
const BASE = `https://api.fabric.microsoft.com/v1/workspaces/${WS}`;
const ROUTE = {
  [ONTOLOGY]: `${BASE}/ontologies/${ONTOLOGY}/getDefinition`,
  [GRAPH]: `${BASE}/graphModels/${GRAPH}/getDefinition`,
  [AGENT]: `${BASE}/dataAgents/${AGENT}/getDefinition`,
};
const OPERATION_URL = `https://api.fabric.microsoft.com/v1/operations/${OPERATION}`;

type CollectContext = Parameters<typeof workspaceCollectDefinitions>[0];
type Handler = (init?: RequestInit) => Response | Promise<Response>;
type Routes = Record<string, Handler | Handler[]>;

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function encode(value: unknown): string {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value), "utf8").toString("base64");
}

function part(path: string, value: unknown, payloadType = "InlineBase64") {
  return { path, payload: encode(value), payloadType };
}

function definition(parts: unknown[]) {
  return { definition: { parts } };
}

function ontologyDefinition() {
  return definition([
    part(".platform", { metadata: { displayName: "private platform name" } }),
    part("definition.json", {}),
    part("EntityTypes/100/definition.json", {
      id: "100",
      name: "Equipment",
      namespace: "usertypes",
      entityIdParts: ["p1"],
      displayNamePropertyId: "p2",
      properties: [
        { id: "p1", name: "Id", valueType: "String" },
        { id: "p2", name: "Name", valueType: "String" },
      ],
      timeseriesProperties: [{ id: "t1", name: "Temperature", valueType: "Double" }],
      graphModelId: GRAPH.toUpperCase(),
    }),
    part("EntityTypes/200/definition.json", {
      id: "200",
      name: "Site",
      entityIdParts: ["s1"],
      properties: [{ id: "s1", name: "SiteId", valueType: "String" }],
    }),
    part("EntityTypes/100/DataBindings/b1.json", {
      id: "b1",
      dataBindingConfiguration: {
        dataBindingType: "TimeSeries",
        timestampColumn: "ts",
        connectionString: "Server=private;Password=private-secret;",
        sourceTableProperties: {
          itemId: LAKEHOUSE.toUpperCase(),
          workspaceId: WS,
          sourceType: "LakehouseTable",
          sourceSchema: "dbo",
          sourceTableName: "equipment",
        },
        propertyBindings: [
          { sourceColumnName: "equipment_id", targetPropertyId: "p1" },
          { sourceColumnName: "ghost", targetPropertyId: "missing" },
        ],
      },
    }),
    { path: "EntityTypes/100/Documents/private.json", payload: "not base64!", payloadType: "InlineBase64" },
    part("RelationshipTypes/r1/definition.json", {
      id: "r1",
      name: "locatedAt",
      source: { entityTypeId: "100" },
      target: { entityTypeId: "200" },
    }),
    part("RelationshipTypes/r1/Contextualizations/c1.json", {
      id: "c1",
      dataBindingTable: { itemId: LAKEHOUSE, sourceTableName: "equipment_site", sourceType: "LakehouseTable" },
      sourceKeyRefBindings: [{ sourceColumnName: "equipment_id", targetPropertyId: "p1" }],
      targetKeyRefBindings: [{ sourceColumnName: "site_id", targetPropertyId: "s1" }],
    }),
    part("Future/forward-compatible.json", { private: "unknown content" }),
  ]);
}

function graphDefinition() {
  return definition([
    part(".platform", {}),
    part("stylingConfiguration.json", { private: "styling" }),
    part("graphType.json", {
      ontologyItemId: ONTOLOGY,
      nodeTypes: [
        {
          alias: "Equipment",
          labels: ["Equipment"],
          primaryKeyProperties: ["Id"],
          properties: [{ name: "Id", type: "STRING" }, { name: "Name", type: "STRING" }],
        },
        { alias: "Site", labels: ["Site"], primaryKeyProperties: ["SiteId"], properties: [{ name: "SiteId", type: "STRING" }] },
      ],
      edgeTypes: [
        {
          alias: "locatedAt",
          labels: ["locatedAt"],
          sourceNodeType: { alias: "Equipment" },
          destinationNodeType: { alias: "Site" },
          properties: [],
        },
      ],
    }),
    part("graphDefinition.json", {
      queries: ["MATCH (n) RETURN private"],
      nodeTables: [
        {
          id: "nt1",
          nodeTypeAlias: "Equipment",
          dataSourceName: "equipment",
          propertyMappings: [
            { propertyName: "Id", sourceColumn: "equipment_id" },
            { propertyName: "Unknown", sourceColumn: "private_column" },
          ],
        },
      ],
      edgeTables: [
        {
          id: "et1",
          edgeTypeAlias: "locatedAt",
          dataSourceName: "equipment",
          propertyMappings: [],
          sourceNodeKeyColumns: ["equipment_id"],
          destinationNodeKeyColumns: ["site_id"],
        },
      ],
    }),
    part("dataSources.json", {
      dataSources: [
        {
          name: "equipment",
          type: "DeltaTable",
          properties: { path: `abfss://${WS}@onelake.dfs.fabric.microsoft.com/${LAKEHOUSE}/Tables/equipment` },
        },
      ],
    }),
  ]);
}

function dataAgentSource(displayName: string) {
  return {
    artifactId: LAKEHOUSE,
    workspaceId: WS,
    displayName,
    type: "lakehouse_tables",
    dataSourceInstructions: "private instructions",
    elements: [
      {
        id: "dbo",
        display_name: "dbo",
        type: "lakehouse_tables.schema",
        is_selected: true,
        children: [
          {
            id: "t-sales",
            display_name: "sales",
            type: "lakehouse_tables.table",
            is_selected: true,
            children: [
              { id: "c-amount", display_name: "amount", type: "lakehouse_tables.column", data_type: "decimal", is_selected: true },
              { id: "c-notes", display_name: "notes", type: "lakehouse_tables.column", is_selected: false },
            ],
          },
        ],
      },
    ],
  };
}

function dataAgentDefinition() {
  return definition([
    part(".platform", {}),
    part("DataAgentV1.json", { private: "agent body" }),
    part("Files/Config/data_agent.json", { aiInstructions: "private Password=private-secret" }),
    part("Files/Config/publish_info.json", { description: "private published description" }),
    part("Files/Config/draft/stage_config.json", { aiInstructions: "private stage instructions" }),
    part("Files/Config/published/stage_config.json", { aiInstructions: "private stage instructions" }),
    part("Files/Config/draft/lakehouse-src/datasource.json", dataAgentSource("Draft lakehouse")),
    part("Files/Config/published/lakehouse-src/datasource.json", dataAgentSource("Sales lakehouse")),
    part("Files/Config/published/lakehouse-src/fewshots.json", {
      fewShots: [{ question: "private question", query: "SELECT private" }],
    }),
  ]);
}

function lroAccepted(headers: Record<string, string> = {}): Response {
  return new Response(null, {
    status: 202,
    headers: {
      location: `https://private.analysis.windows.net/v1/operations/${OPERATION}`,
      "x-ms-operation-id": OPERATION,
      "retry-after": "30",
      ...headers,
    },
  });
}

function routes(overrides: Routes = {}): Routes {
  return {
    [ROUTE[ONTOLOGY]]: () => json(ontologyDefinition()),
    [ROUTE[GRAPH]]: () => lroAccepted(),
    [OPERATION_URL]: [
      () => json({ status: "Running" }, { headers: { "retry-after": "0" } }),
      () => json({ status: "Succeeded" }),
    ],
    [`${OPERATION_URL}/result`]: () => json(graphDefinition()),
    [ROUTE[AGENT]]: () => json(dataAgentDefinition()),
    ...overrides,
  };
}

function fabricFetch(table: Routes) {
  const calls = new Map<string, number>();
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    const route = table[url];
    if (!route) throw new Error(`Unexpected fixture URL ${url}`);
    const count = calls.get(url) ?? 0;
    calls.set(url, count + 1);
    const handler = Array.isArray(route) ? route[Math.min(count, route.length - 1)] : route;
    return handler(init);
  });
}

const MIXED_BATCH: DefinitionItemInput[] = [
  { id: ONTOLOGY, type: "Ontology" },
  { id: GRAPH, type: "GraphModel" },
  { id: AGENT, type: "DataAgent" },
  { id: NOTEBOOK, type: "Notebook" },
];

function collect(
  table: Routes,
  items: DefinitionItemInput[] = MIXED_BATCH,
  options: Omit<CollectDefinitionDependencies, "fetch"> = {},
) {
  const fetchImpl = fabricFetch(table);
  const sleep = options.sleep ?? vi.fn(async () => undefined);
  const result = collectWorkspaceDefinitions(
    TOKEN,
    { workspaceId: WS, correlationId: null, items },
    { ...options, fetch: fetchImpl, sleep },
  );
  return { result, fetchImpl, sleep };
}

function urls(fetchImpl: ReturnType<typeof fabricFetch>): string[] {
  return fetchImpl.mock.calls.map(([input]) => String(input));
}

function itemStatus(envelope: DefinitionStageEnvelope, id: string) {
  const item = envelope.items.find((candidate) => candidate.id === id);
  return { status: item?.status, code: item?.code };
}

function context(
  findById: () => Promise<unknown>,
  token: () => string = () => TOKEN,
): CollectContext {
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

const authorized = () =>
  vi.fn(async () => ({ id: SYNCHRONIZER_AUTHORITY_ID, createdAt: new Date() }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("workspaceCollectDefinitions contract", () => {
  it("binds the Fabric audience with a flat typed batch signature", () => {
    const metadata = JSON.parse(
      readFileSync(resolve("rayfin", "functions", "runtimemetadata.json"), "utf8"),
    ) as {
      functions: {
        functionName: string;
        contextAudiences: string[];
        delegateParameters: Record<string, unknown>[];
      }[];
    };
    const fn = metadata.functions.find((candidate) => candidate.functionName === "workspaceCollectDefinitions");
    expect(fn?.contextAudiences).toEqual(["Fabric"]);
    expect(fn?.delegateParameters).toEqual([
      expect.objectContaining({ name: "ctx", type: "RayfinContext<AtlasSchema, AudienceType.Fabric>" }),
      expect.objectContaining({ name: "protocolVersion", type: "1" }),
      expect.objectContaining({ name: "workspaceId", type: "SyncUuidInput" }),
      // A custom alias bypasses the SDK's coercing array converter; the strict validator owns it.
      expect.objectContaining({ name: "items", type: "DefinitionItemsInput", hasDefault: false }),
      expect.objectContaining({ name: "correlationId", type: "SyncUuidInput | null", hasDefault: true }),
    ]);
  });

  it("generates exact client types without token, URL or endpoint inputs", () => {
    expectTypeOf<AppFunctionsSchema["workspaceCollectDefinitions"]["input"]>().toEqualTypeOf<{
      protocolVersion: 1;
      workspaceId: string;
      items: { id: string; type: string }[];
      correlationId: string | null;
    }>();
    expectTypeOf<AppFunctionsSchema["workspaceCollectDefinitions"]["output"]>()
      .toEqualTypeOf<DefinitionStageEnvelope>();
  });
});

describe("workspaceCollectDefinitions input validation", () => {
  it("accepts a bounded batch and normalizes UUID case", () => {
    expect(
      validateCollectDefinitionsInput(1, WS.toUpperCase(), [{ id: ONTOLOGY.toUpperCase(), type: "Ontology" }], null),
    ).toEqual({ workspaceId: WS, correlationId: null, items: [{ id: ONTOLOGY, type: "Ontology" }] });
  });

  it.each([
    ["string protocol", "1", [{ id: ONTOLOGY, type: "Ontology" }], null],
    ["empty batch", 1, [], null],
    ["oversized batch", 1, Array.from({ length: 9 }, (_, index) => ({
      id: `${String(index + 1).repeat(8)}-1111-4111-8111-111111111111`,
      type: "Ontology",
    })), null],
    ["duplicate items", 1, [{ id: ONTOLOGY, type: "Ontology" }, { id: ONTOLOGY.toUpperCase(), type: "GraphModel" }], null],
    ["extra endpoint field", 1, [{ id: ONTOLOGY, type: "Ontology", url: "https://example.test" }], null],
    ["missing type", 1, [{ id: ONTOLOGY }], null],
    ["path-like type", 1, [{ id: ONTOLOGY, type: "Ontology/../items" }], null],
    ["non-RFC item ID", 1, [{ id: "11111111-1111-1111-1111-111111111111", type: "Ontology" }], null],
    ["non-array items", 1, { id: ONTOLOGY, type: "Ontology" }, null],
    ["empty correlation", 1, [{ id: ONTOLOGY, type: "Ontology" }], ""],
  ])("rejects %s with a fixed message", (_name, protocolVersion, items, correlationId) => {
    expect(() => validateCollectDefinitionsInput(protocolVersion, WS, items, correlationId)).toThrow(
      "Use protocolVersion 1, a strict workspace UUID, 1-8 unique {id, type} items and a strict correlation UUID or null.",
    );
  });
});

describe("workspaceCollectDefinitions authorization", () => {
  it("fails closed before reading the token or calling Fabric", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const token = vi.fn(() => TOKEN);
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      workspaceCollectDefinitions(
        context(vi.fn().mockRejectedValue(new Error("policy denied")), token),
        1,
        WS,
        MIXED_BATCH,
        null,
        { fetch: fetchImpl },
      ),
    ).rejects.toThrow("Definition collection requires the configured Atlas administrator.");
    expect(token).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns a fixed error when the declared Fabric token is unavailable", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const failure = workspaceCollectDefinitions(
      context(authorized(), () => {
        throw new Error(`binding failed for ${TOKEN}`);
      }),
      1,
      WS,
      MIXED_BATCH,
      null,
      { fetch: fetchImpl },
    );
    await expect(failure).rejects.toThrow("The Fabric application token was unavailable.");
    await expect(failure).rejects.not.toThrow(TOKEN);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("runs the sentinel gate before the first definition request", async () => {
    const order: string[] = [];
    const findById = vi.fn(async () => {
      order.push("gate");
      return { id: SYNCHRONIZER_AUTHORITY_ID, createdAt: new Date() };
    });
    const table = routes();
    const fetchImpl = fabricFetch(table);
    fetchImpl.mockImplementationOnce(async () => {
      order.push("fabric");
      return json(ontologyDefinition());
    });
    const envelope = await workspaceCollectDefinitions(
      context(findById),
      1,
      WS,
      [{ id: ONTOLOGY, type: "Ontology" }],
      CORRELATION,
      { fetch: fetchImpl, sleep: async () => undefined },
    );
    expect(order).toEqual(["gate", "fabric"]);
    expect(envelope.correlationId).toBe(CORRELATION);
  });
});

describe("workspaceCollectDefinitions projections", () => {
  it("projects a mixed batch into reviewed metadata, config facts and per-item evidence", async () => {
    const { result, fetchImpl, sleep } = collect(routes());
    const envelope = await result;

    expect(envelope).toMatchObject({
      contractVersion: 1,
      stage: "definitions",
      authoritative: false,
      workspaceId: WS,
      errors: [],
      sections: { definitions: { status: "complete", code: "partial-unsupported" } },
      capabilities: { definitionEnrichment: { status: "complete", code: "partial-unsupported" } },
    });
    expect(envelope).not.toHaveProperty("correlationId");
    expect(envelope.items).toEqual([
      {
        id: ONTOLOGY,
        type: "Ontology",
        status: "complete",
        code: "forward-compatible-parts-skipped",
        unknownParts: 1,
        references: { sourceItemIds: [LAKEHOUSE], ontologyItemIds: [], graphModelItemIds: [GRAPH] },
      },
      {
        id: GRAPH,
        type: "GraphModel",
        status: "complete",
        references: { sourceItemIds: [LAKEHOUSE], ontologyItemIds: [ONTOLOGY], graphModelItemIds: [] },
      },
      {
        id: AGENT,
        type: "DataAgent",
        status: "complete",
        references: { sourceItemIds: [LAKEHOUSE], ontologyItemIds: [], graphModelItemIds: [] },
      },
      { id: NOTEBOOK, type: "Notebook", status: "unsupported", code: "item-type-unsupported" },
    ]);

    expect(envelope.artifactMetadata[ONTOLOGY]).toEqual({
      kind: "ontology",
      entities: [
        {
          id: "100",
          name: "Equipment",
          namespace: "usertypes",
          keyPropertyIds: ["p1"],
          displayNamePropertyId: "p2",
          properties: [
            { id: "p1", name: "Id", valueType: "String", timeSeries: false },
            { id: "p2", name: "Name", valueType: "String", timeSeries: false },
            { id: "t1", name: "Temperature", valueType: "Double", timeSeries: true },
          ],
        },
        {
          id: "200",
          name: "Site",
          keyPropertyIds: ["s1"],
          properties: [{ id: "s1", name: "SiteId", valueType: "String", timeSeries: false }],
        },
      ],
      relationships: [{ id: "r1", name: "locatedAt", sourceEntityId: "100", targetEntityId: "200" }],
      bindings: [
        {
          id: "b1",
          entityId: "100",
          bindingType: "TimeSeries",
          sourceItemId: LAKEHOUSE,
          sourceWorkspaceId: WS,
          sourceType: "LakehouseTable",
          sourceSchema: "dbo",
          sourceObject: "equipment",
          timestampColumn: "ts",
          propertyBindings: [{ sourceColumn: "equipment_id", targetPropertyId: "p1" }],
        },
      ],
      contextualizations: [
        {
          id: "c1",
          relationshipId: "r1",
          sourceItemId: LAKEHOUSE,
          sourceType: "LakehouseTable",
          sourceObject: "equipment_site",
          sourceKeyBindings: [{ sourceColumn: "equipment_id", targetPropertyId: "p1" }],
          targetKeyBindings: [{ sourceColumn: "site_id", targetPropertyId: "s1" }],
        },
      ],
    });
    expect(envelope.artifactMetadata[GRAPH]).toEqual({
      kind: "graphModel",
      dataSources: [
        { name: "equipment", sourceItemId: LAKEHOUSE, sourceObject: "equipment", sourceWorkspaceId: WS, sourceType: "DeltaTable" },
      ],
      nodeTypes: [
        {
          alias: "Equipment",
          labels: ["Equipment"],
          primaryKeyProperties: ["Id"],
          properties: [{ name: "Id", dataType: "STRING" }, { name: "Name", dataType: "STRING" }],
        },
        { alias: "Site", labels: ["Site"], primaryKeyProperties: ["SiteId"], properties: [{ name: "SiteId", dataType: "STRING" }] },
      ],
      edgeTypes: [
        { alias: "locatedAt", labels: ["locatedAt"], sourceNodeType: "Equipment", destinationNodeType: "Site", properties: [] },
      ],
      mappings: [
        {
          id: "nt1",
          kind: "node",
          typeAlias: "Equipment",
          dataSourceName: "equipment",
          sourceItemId: LAKEHOUSE,
          sourceObject: "equipment",
          sourceWorkspaceId: WS,
          propertyMappings: [{ propertyName: "Id", sourceColumn: "equipment_id" }],
        },
        {
          id: "et1",
          kind: "edge",
          typeAlias: "locatedAt",
          dataSourceName: "equipment",
          sourceItemId: LAKEHOUSE,
          sourceObject: "equipment",
          sourceWorkspaceId: WS,
          propertyMappings: [],
          sourceNodeKeyColumns: ["equipment_id"],
          destinationNodeKeyColumns: ["site_id"],
        },
      ],
    });
    const amount = {
      id: "c-amount",
      displayName: "amount",
      elementType: "lakehouse_tables.column",
      sourceArtifactId: LAKEHOUSE,
      dataType: "decimal",
      parentId: "t-sales",
      parentName: "sales",
      parentPath: ["sales"],
      state: "published",
    };
    const sales = {
      id: "t-sales",
      displayName: "sales",
      elementType: "lakehouse_tables.table",
      sourceArtifactId: LAKEHOUSE,
      parentPath: [],
      state: "published",
    };
    expect(envelope.artifactMetadata[AGENT]).toEqual({
      kind: "dataAgent",
      sources: [
        {
          artifactId: LAKEHOUSE,
          workspaceId: WS,
          displayName: "Sales lakehouse",
          sourceType: "lakehouse_tables",
          elements: [{ ...sales, selected: true, children: [{ ...amount, selected: true, children: [] }] }],
          selectedElements: [sales, amount],
        },
      ],
    });
    for (const [itemId, type] of [[ONTOLOGY, "Ontology"], [GRAPH, "GraphModel"], [AGENT, "DataAgent"]]) {
      expect(parseFabricItemMetadata(type, envelope.artifactMetadata[itemId])).toBeDefined();
    }
    expect(envelope.artifactMetadata).not.toHaveProperty(NOTEBOOK);

    expect(envelope.config).toEqual(expect.arrayContaining([
      { itemId: ONTOLOGY, section: "Metadata capability", label: "Definition enrichment", value: "forward-compatible-parts-skipped" },
      { itemId: ONTOLOGY, section: "Metadata capability", label: "Forward-compatible definition parts skipped", value: "1" },
      { itemId: ONTOLOGY, section: "Ontology entity types", label: "Equipment", value: "id 100 | 2 properties | 1 time-series properties" },
      { itemId: ONTOLOGY, section: "Ontology data bindings", label: "Equipment:b1", value: `LakehouseTable | ${LAKEHOUSE} | dbo.equipment | 1 property bindings` },
      { itemId: ONTOLOGY, section: "Ontology relationship types", label: "locatedAt", value: "Equipment -> Site" },
      { itemId: GRAPH, section: "Metadata capability", label: "Definition enrichment", value: "complete" },
      { itemId: GRAPH, section: "Graph edge types", label: "locatedAt", value: "Equipment -> Site | 0 properties" },
      { itemId: GRAPH, section: "Graph node mappings", label: "Equipment", value: "equipment | 2 property mappings" },
      { itemId: AGENT, section: "Data agent sources", label: "published:Sales lakehouse", value: `lakehouse_tables | ${LAKEHOUSE}` },
      { itemId: AGENT, section: "Data agent selected elements", label: "published:Sales lakehouse:dbo / sales / notes", value: "lakehouse_tables.column | selected no" },
      { itemId: AGENT, section: "Data agent", label: "State", value: "published" },
    ]));
    expect(envelope.config.some((entry) => entry.itemId === NOTEBOOK)).toBe(false);

    expect(urls(fetchImpl)).toEqual([
      ROUTE[ONTOLOGY],
      ROUTE[GRAPH],
      OPERATION_URL,
      OPERATION_URL,
      `${OPERATION_URL}/result`,
      ROUTE[AGENT],
    ]);
    expect(fetchImpl.mock.calls.map(([, init]) => init?.method)).toEqual([
      "POST", "POST", "GET", "GET", "GET", "POST",
    ]);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init).toMatchObject({
        redirect: "manual",
        headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
      });
      expect(init?.body).toBeUndefined();
    }
    // The 202 Retry-After of 30 seconds is capped; the Running poll's 0 is raised to 1 second.
    expect(sleep).toHaveBeenNthCalledWith(1, 5_000);
    expect(sleep).toHaveBeenNthCalledWith(2, 1_000);
  });

  it("never returns tokens, raw parts, instructions, queries or descriptions", async () => {
    const serialized = JSON.stringify(await collect(routes()).result);
    for (const forbidden of [
      TOKEN,
      "private",
      "Password",
      "Server=",
      "instructions",
      "SELECT",
      "MATCH",
      "payload",
      "InlineBase64",
      "connectionString",
      "analysis.windows.net",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("cannot be consumed as a resumable production enrichment", async () => {
    const envelope = await collect(routes()).result;
    expect(() => validateSyncEnrichment(envelope as unknown as RawSync, [ONTOLOGY])).toThrow(
      "Fabric returned an invalid resumable sync response.",
    );
  });
});

describe("workspaceCollectDefinitions route allowlist", () => {
  it.each(["Notebook", "Lakehouse", "FutureFabricThing", "constructor", "toString", "hasOwnProperty"])(
    "reports %s as unsupported without a request",
    async (type) => {
      const { result, fetchImpl } = collect(routes(), [{ id: NOTEBOOK, type }]);
      const envelope = await result;
      expect(envelope.items).toEqual([{ id: NOTEBOOK, type, status: "unsupported", code: "item-type-unsupported" }]);
      expect(envelope.sections.definitions).toEqual({ status: "unsupported", code: "item-type-unsupported" });
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );
});

describe("workspaceCollectDefinitions long-running operation safety", () => {
  it("derives the operation from Location without requesting the Location host", async () => {
    const table = routes({
      [ROUTE[GRAPH]]: () =>
        new Response(null, {
          status: 202,
          headers: { location: `https://private.analysis.windows.net/v1/operations/${OPERATION}/` },
        }),
    });
    const { result, fetchImpl } = collect(table, [{ id: GRAPH, type: "GraphModel" }]);
    expect(itemStatus(await result, GRAPH)).toEqual({ status: "complete", code: undefined });
    expect(urls(fetchImpl).every((url) => url.startsWith("https://api.fabric.microsoft.com/v1/"))).toBe(true);
  });

  it.each([
    ["a non-UUID operation", { "x-ms-operation-id": "../../admin" }, "invalid-definition"],
    ["no operation identity", { "x-ms-operation-id": "", location: "" }, "invalid-definition"],
  ])("rejects %s", async (_name, headers, code) => {
    const table = routes({ [ROUTE[GRAPH]]: () => lroAccepted(headers) });
    const { result, fetchImpl } = collect(table, [{ id: GRAPH, type: "GraphModel" }]);
    expect(itemStatus(await result, GRAPH)).toEqual({ status: "failed", code });
    expect(urls(fetchImpl)).toEqual([ROUTE[GRAPH]]);
  });

  it("reports failed and incomplete operations", async () => {
    const failed = await collect(
      routes({ [OPERATION_URL]: () => json({ status: "Failed", error: { message: "private" } }) }),
      [{ id: GRAPH, type: "GraphModel" }],
    ).result;
    expect(itemStatus(failed, GRAPH)).toEqual({ status: "failed", code: "operation-failed" });
    expect(JSON.stringify(failed)).not.toContain("private");

    const running = collect(
      routes({ [OPERATION_URL]: () => json({ status: "Running" }) }),
      [{ id: GRAPH, type: "GraphModel" }],
      { limits: { maxLroPolls: 2 } },
    );
    expect(itemStatus(await running.result, GRAPH)).toEqual({ status: "failed", code: "operation-incomplete" });
    expect(urls(running.fetchImpl).filter((url) => url === OPERATION_URL)).toHaveLength(2);

    const unknown = await collect(
      routes({ [OPERATION_URL]: () => json({ status: "Exploded" }) }),
      [{ id: GRAPH, type: "GraphModel" }],
    ).result;
    expect(itemStatus(unknown, GRAPH)).toEqual({ status: "failed", code: "invalid-definition" });
  });

  it("rejects redirects on POST without following them or retrying", async () => {
    const table = routes({
      [ROUTE[ONTOLOGY]]: () => new Response(null, { status: 307, headers: { location: "https://example.test/steal" } }),
    });
    const { result, fetchImpl } = collect(table, [
      { id: ONTOLOGY, type: "Ontology" },
      { id: AGENT, type: "DataAgent" },
    ]);
    const envelope = await result;
    expect(itemStatus(envelope, ONTOLOGY)).toEqual({ status: "failed", code: "redirect-rejected" });
    expect(itemStatus(envelope, AGENT)).toEqual({ status: "complete", code: undefined });
    expect(urls(fetchImpl)).toEqual([ROUTE[ONTOLOGY], ROUTE[AGENT]]);
  });
});

describe("workspaceCollectDefinitions permission and throttling evidence", () => {
  it.each([
    [403, "unsupported", "read-write-permission-required"],
    [401, "unsupported", "read-write-permission-required"],
    [404, "unsupported", "endpoint-unsupported"],
    [400, "unsupported", "endpoint-unsupported"],
    [423, "unsupported", "encrypted-label-blocked"],
    [409, "failed", "upstream-http-error"],
  ])("maps HTTP %s to %s/%s and keeps later items", async (status, itemState, code) => {
    const table = routes({
      [ROUTE[ONTOLOGY]]: () => json({ message: "private upstream detail" }, { status }),
    });
    const envelope = await collect(table, [
      { id: ONTOLOGY, type: "Ontology" },
      { id: AGENT, type: "DataAgent" },
    ]).result;
    expect(itemStatus(envelope, ONTOLOGY)).toEqual({ status: itemState, code });
    expect(itemStatus(envelope, AGENT)).toEqual({ status: "complete", code: undefined });
    expect(envelope.artifactMetadata).not.toHaveProperty(ONTOLOGY);
    expect(envelope.config).toContainEqual({
      itemId: ONTOLOGY, section: "Metadata capability", label: "Definition enrichment", value: code,
    });
    expect(JSON.stringify(envelope)).not.toContain("private");
  });

  it("retries transient failures and stops the batch on persistent throttling", async () => {
    const retried = collect(
      routes({ [ROUTE[ONTOLOGY]]: [() => json({}, { status: 503 }), () => json(ontologyDefinition())] }),
      [{ id: ONTOLOGY, type: "Ontology" }],
    );
    expect(itemStatus(await retried.result, ONTOLOGY).status).toBe("complete");

    const throttled = collect(
      routes({ [ROUTE[ONTOLOGY]]: () => json({}, { status: 429, headers: { "retry-after": "0" } }) }),
      [{ id: ONTOLOGY, type: "Ontology" }, { id: AGENT, type: "DataAgent" }],
    );
    const envelope = await throttled.result;
    expect(itemStatus(envelope, ONTOLOGY)).toEqual({ status: "failed", code: "rate-limited" });
    expect(itemStatus(envelope, AGENT)).toEqual({ status: "failed", code: "not-attempted" });
    expect(envelope.sections.definitions).toEqual({ status: "failed", code: "rate-limited" });
    expect(envelope.errors).toEqual([`definitions:${ONTOLOGY}: rate-limited`]);
    expect(urls(throttled.fetchImpl)).not.toContain(ROUTE[AGENT]);
  });
});

describe("workspaceCollectDefinitions malformed definitions", () => {
  const malformed: [string, unknown][] = [
    ["invalid base64", definition([{ path: "EntityTypes/1/definition.json", payload: "not base64!", payloadType: "InlineBase64" }])],
    ["non-canonical base64", definition([{ path: "EntityTypes/1/definition.json", payload: "e30", payloadType: "InlineBase64" }])],
    ["an unsupported payload type", definition([part("EntityTypes/1/definition.json", {}, "InlineText")])],
    ["non-object JSON", definition([part("EntityTypes/1/definition.json", [1, 2])])],
    ["invalid JSON", definition([part("EntityTypes/1/definition.json", "{not json")])],
    ["invalid UTF-8", definition([{ path: "EntityTypes/1/definition.json", payload: "/w==", payloadType: "InlineBase64" }])],
    ["a traversal path", definition([part("EntityTypes/../definition.json", {})])],
    ["an absolute path", definition([part("/EntityTypes/1/definition.json", {})])],
    ["a control character path", definition([part("EntityTypes/1\n/definition.json", {})])],
    ["non-array parts", { definition: { parts: {} } }],
    ["too many parts", definition(Array.from({ length: 501 }, (_, index) => part(`Future/${index}.json`, {})))],
    ["a missing definition", { parts: [] }],
    ["a lossy numeric identifier", definition([part("EntityTypes/1/definition.json", '{"id":3117068036374594013,"name":"Lossy"}')])],
  ];

  it.each(malformed)("fails only the item with %s", async (_name, body) => {
    const envelope = await collect(
      routes({ [ROUTE[ONTOLOGY]]: () => json(body) }),
      [{ id: ONTOLOGY, type: "Ontology" }, { id: AGENT, type: "DataAgent" }],
    ).result;
    expect(itemStatus(envelope, ONTOLOGY)).toEqual({ status: "failed", code: "invalid-definition" });
    expect(itemStatus(envelope, AGENT)).toEqual({ status: "complete", code: undefined });
    expect(envelope.artifactMetadata).not.toHaveProperty(ONTOLOGY);
    expect(envelope.config.filter((entry) => entry.itemId === ONTOLOGY)).toEqual([
      { itemId: ONTOLOGY, section: "Metadata capability", label: "Definition enrichment", value: "invalid-definition" },
    ]);
    expect(envelope.errors).toEqual([`definitions:${ONTOLOGY}: invalid-definition`]);
  });

  it("rejects credential-like projected names instead of returning them", async () => {
    for (const name of ["Server=tcp:private;Password=private-secret;", `Bearer ${"a".repeat(32)}`]) {
      const envelope = await collect(
        routes({
          [ROUTE[ONTOLOGY]]: () =>
            json(definition([part("EntityTypes/1/definition.json", { id: "1", name, properties: [] })])),
        }),
        [{ id: ONTOLOGY, type: "Ontology" }],
      ).result;
      expect(itemStatus(envelope, ONTOLOGY)).toEqual({ status: "failed", code: "unsafe-content-rejected" });
      expect(JSON.stringify(envelope)).not.toContain("private");
      expect(JSON.stringify(envelope)).not.toContain("a".repeat(32));
    }
  });

  it("bounds declared response bytes and the decoded definition budget", async () => {
    const declared = await collect(
      routes({
        [ROUTE[ONTOLOGY]]: () => new Response("{}", { headers: { "content-length": String(64 * 1024) } }),
      }),
      [{ id: ONTOLOGY, type: "Ontology" }],
      { limits: { maxDefinitionResponseBytes: 1_024 } },
    ).result;
    expect(itemStatus(declared, ONTOLOGY)).toEqual({ status: "failed", code: "response-size-exceeded" });

    const oversized = definition([
      part("EntityTypes/1/definition.json", { id: "1", name: "x".repeat(DEFINITION_PROJECTION_LIMITS.maxDecodedBytes) }),
    ]);
    let code: unknown;
    try {
      projectDefinition("Ontology", oversized);
    } catch (error) {
      code = (error as { code?: unknown }).code;
    }
    expect(code).toBe("response-size-exceeded");
  });

  it("stops before the aggregate projection budget is exceeded", async () => {
    const { result, fetchImpl } = collect(
      routes(),
      [{ id: ONTOLOGY, type: "Ontology" }, { id: AGENT, type: "DataAgent" }, { id: GRAPH, type: "GraphModel" }],
      { limits: { maxProjectionBytes: 4_000 } },
    );
    const envelope = await result;
    expect(itemStatus(envelope, ONTOLOGY).status).toBe("complete");
    expect(itemStatus(envelope, AGENT)).toEqual({ status: "failed", code: "response-size-exceeded" });
    expect(itemStatus(envelope, GRAPH)).toEqual({ status: "failed", code: "not-attempted" });
    expect(urls(fetchImpl)).not.toContain(ROUTE[GRAPH]);
  });
});

describe("workspaceCollectDefinitions cancellation, deadline and budgets", () => {
  it("cancels an in-flight request without retrying and skips later items", async () => {
    const controller = new AbortController();
    const table = routes({
      [ROUTE[ONTOLOGY]]: (init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError")));
          controller.abort();
        }),
    });
    const { result, fetchImpl } = collect(
      table,
      [{ id: ONTOLOGY, type: "Ontology" }, { id: AGENT, type: "DataAgent" }],
      { signal: controller.signal },
    );
    const envelope = await result;
    expect(itemStatus(envelope, ONTOLOGY)).toEqual({ status: "failed", code: "cancelled" });
    expect(itemStatus(envelope, AGENT)).toEqual({ status: "failed", code: "not-attempted" });
    expect(urls(fetchImpl)).toEqual([ROUTE[ONTOLOGY]]);
  });

  it("does not start any request after cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const { result, fetchImpl } = collect(routes(), [{ id: ONTOLOGY, type: "Ontology" }], {
      signal: controller.signal,
    });
    const envelope = await result;
    expect(itemStatus(envelope, ONTOLOGY)).toEqual({ status: "failed", code: "not-attempted" });
    expect(envelope.errors).toEqual(["definitions: cancelled"]);
    expect(envelope.sections.definitions).toEqual({ status: "failed", code: "cancelled" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("stops starting items when too little execution budget remains", async () => {
    let now = 0;
    const table = routes({
      [ROUTE[ONTOLOGY]]: () => {
        now += 140_000;
        return json(ontologyDefinition());
      },
    });
    const { result, fetchImpl } = collect(
      table,
      [{ id: ONTOLOGY, type: "Ontology" }, { id: AGENT, type: "DataAgent" }],
      { now: () => now },
    );
    const envelope = await result;
    expect(itemStatus(envelope, ONTOLOGY).status).toBe("complete");
    expect(itemStatus(envelope, AGENT)).toEqual({ status: "failed", code: "not-attempted" });
    expect(envelope.errors).toEqual(["definitions: deadline-exhausted"]);
    expect(urls(fetchImpl)).not.toContain(ROUTE[AGENT]);
  });

  it("refuses an LRO poll that would outlive the deadline", async () => {
    let now = 0;
    const table = routes({
      [ROUTE[GRAPH]]: () => {
        now += 146_000;
        return lroAccepted();
      },
    });
    const envelope = await collect(table, [{ id: GRAPH, type: "GraphModel" }], { now: () => now }).result;
    expect(itemStatus(envelope, GRAPH)).toEqual({ status: "failed", code: "deadline-exhausted" });
  });

  it("enforces the total request budget across LRO polls", async () => {
    const { result, fetchImpl } = collect(
      routes(),
      [{ id: GRAPH, type: "GraphModel" }, { id: AGENT, type: "DataAgent" }],
      { limits: { maxRequests: 2 } },
    );
    const envelope = await result;
    expect(itemStatus(envelope, GRAPH)).toEqual({ status: "failed", code: "request-budget-exhausted" });
    expect(itemStatus(envelope, AGENT)).toEqual({ status: "failed", code: "not-attempted" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
