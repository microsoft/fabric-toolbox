import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectBrowserWorkspace, pythonCollectorRollbackEnabled, type BrowserCollectorClient,
} from "./browser-collector-sync";
import { mapSyncToAtlas, validateRawSync, type CompatibilityPlan, type RawSync } from "./live-sync";
import { createItemRelationsEvidence } from "./item-relations-evidence";

const WS = "11111111-1111-4111-8111-111111111111";
const RUN = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const MODEL = "44444444-4444-4444-8444-444444444444";
const REPORT = "55555555-5555-4555-8555-555555555555";
const ONTOLOGY = "66666666-6666-4666-8666-666666666666";
const SQL = "77777777-7777-4777-8777-777777777777";
const KQL = "88888888-8888-4888-8888-888888888888";
const FOREIGN = "99999999-9999-4999-8999-999999999999";
const NOW = "2026-10-02T12:00:00.000Z";
const identity = { id: USER, name: "Fixture", email: "fixture@example.test" };
const items = [
  { id: MODEL, type: "SemanticModel" }, { id: REPORT, type: "Report" },
  { id: ONTOLOGY, type: "Ontology" }, { id: SQL, type: "SQLDatabase" }, { id: KQL, type: "KQLDatabase" },
];
const complete = () => ({ status: "complete" as const });
const unsupported = (code: string) => ({ status: "unsupported" as const, code });
const table = (name: string, source: string) => ({
  name, source, objectType: "Model table", columns: [{ name: "Id", dataType: "Int64" }], measures: [],
});
function core() {
  const missing = unsupported("collector-not-migrated");
  return {
    schemaVersion: 2, syncMode: "base", correlationId: RUN,
    workspace: { id: WS, displayName: "Fixture" }, items,
    roleAssignments: [{ role: "Admin", principal: { id: USER, displayName: "Fixture", type: "User" } }],
    jobs: [], lineage: [], access: [], config: [], objectEdges: [], schema: {}, artifactMetadata: {},
    itemMetadata: Object.fromEntries(items.map((item) => [item.id, { scannerMatched: false, ownerAvailable: false }])),
    capabilities: Object.fromEntries(["endorsement", "sensitivity", "tags", "ownership", "definitionEnrichment", "kqlSchema", "sqlSchema", "objectLineage"].map((name) => [name, missing])),
    sections: {
      workspace: complete(), items: complete(), roleAssignments: complete(), jobs: complete(),
      ...Object.fromEntries(["scanner", "schema", "lineage", "access", "config", "definitions", "kqlSchema", "sqlSchema"].map((name) => [name, missing])),
    }, errors: [], syncedAt: NOW,
  };
}
const common = (stage: string, requested: { id: string; type: string; [key: string]: unknown }[]) => ({
  contractVersion: 1, stage, authoritative: false, workspaceId: WS, correlationId: RUN,
  items: requested, errors: [], syncedAt: NOW,
});
function harness() {
  const sequence: string[] = [];
  let active = 0;
  let maxActive = 0;
  const fn = (name: string, result: (input: Record<string, unknown>) => unknown) => ({
    invoke: vi.fn(async (input: Record<string, unknown>) => {
      sequence.push(name);
      active++;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active--;
      expect(JSON.stringify(input)).not.toMatch(/accessToken|fabricToken|definitionToken|kustoToken|sqlToken/);
      return result(input);
    }),
  });
  const functions = {
    workspaceCollectCore: fn("core", () => core()),
    workspaceCollectSourceProvenance: fn("provenance", (input) => ({
      ...common("source-provenance", (input.items as { id: string; type: string }[]).map((item) => ({
        ...item, ...complete(), shortcuts: { ...complete(), shortcuts: [], truncated: false },
      }))),
      collectedAt: NOW, summary: complete(),
    })),
    workspaceCollectDefinitions: fn("definitions", () => ({
      ...common("definitions", [{ id: ONTOLOGY, type: "Ontology", ...complete() }]),
      artifactMetadata: { [ONTOLOGY]: { kind: "ontology", entities: [], relationships: [], bindings: [], contextualizations: [] } },
      config: [{ itemId: ONTOLOGY, section: "Definition", label: "Collected", value: "Rayfin" }],
      sections: { definitions: complete() }, capabilities: { definitionEnrichment: complete() },
    })),
    workspaceCollectSqlMetadata: fn("sql", () => ({
      ...common("sql-metadata", [{ id: SQL, type: "SQLDatabase", ...complete() }]),
      catalogs: { [SQL]: { ...complete(), source: "fabric-sql-database-catalog", schemas: [] } },
      schema: { [SQL]: [table("dbo.Customers", "Fabric SQL system catalog")] }, artifactMetadata: {},
      config: [], sections: { sqlProperties: complete(), sqlSchema: complete() }, capabilities: { sqlSchema: complete() },
    })),
    workspaceCollectKqlMetadata: fn("kql", () => ({
      ...common("kql-metadata", [{ id: KQL, type: "KQLDatabase", ...complete() }]),
      schemas: { [KQL]: { ...complete(), source: "fabric-kql-database-definition", tables: [{ name: "Events", columns: [{ name: "Id", dataType: "long" }] }] } },
      artifactMetadata: {}, config: [], sections: { kqlProperties: complete(), kqlSchema: complete() },
      capabilities: { kqlSchema: complete() }, blockers: [],
    })),
    workspaceCollectPowerBi: fn("powerbi", () => ({
      ...common("powerbi-metadata", [
        { id: MODEL, type: "SemanticModel", schema: complete(), expressions: complete(), definition: complete(), identity: complete(), pages: unsupported("not-applicable") },
        { id: REPORT, type: "Report", schema: unsupported("not-applicable"), pages: complete(), definition: complete(), identity: complete() },
      ]),
      schema: { [MODEL]: [table("Sales", "Fabric semantic model definition (TMSL)")] },
      models: {}, reports: { [REPORT]: { pages: [{ name: "overview", displayName: "Overview", order: 0 }] } },
      itemMetadata: {}, config: [],
    })),
    workspaceCollectItemRelations: fn("relations", (input) => ({
      ...createItemRelationsEvidence(WS, NOW, (input.itemIds as string[]).flatMap((itemId) =>
        ["upstream", "downstream"].map((direction) => ({ itemId, direction, status: "failed", failureCode: "failed", attemptedAt: NOW })) as never)),
      authoritative: false, correlationId: RUN,
    })),
  };
  const compatibility = vi.fn(async (plan: CompatibilityPlan): Promise<RawSync> => {
    sequence.push(`python-${plan.stage}`);
    const common = {
      schemaVersion: 2, syncMode: "compatibility", compatibilityVersion: 1,
      compatibilityStage: plan.stage, workspace: { id: WS }, correlationId: RUN,
      requestedItemIds: plan.items.map((item) => item.id),
      completedItemIds: plan.items.map((item) => item.id), remainingItemIds: [], itemFailures: {},
      compatibilityCollectors: Object.fromEntries(plan.items.map((item) => [item.id, item.collectors])),
      compatibilityStatus: Object.fromEntries(plan.items.map((item) => [item.id, {}])),
      schema: {}, config: [], jobs: [], access: [], lineage: [], objectEdges: [], artifactMetadata: {}, itemMetadata: {},
      sections: {}, capabilities: {}, errors: [], syncedAt: NOW,
    };
    if (plan.stage === "scanner") return {
      ...common,
      schema: Object.fromEntries(plan.schemaItemIds.map((id) => [id, [table("Sales", "Power BI admin scanner")]])),
      lineage: [{ source: MODEL, target: REPORT, relation: "report" }],
      itemMetadata: Object.fromEntries(items.map((item) => [item.id, { scannerMatched: item.id === MODEL || item.id === REPORT, ownerAvailable: false }])),
      sections: Object.fromEntries(["scanner", "schema", "config", "lineage", "access"].map((name) => [name, complete()])),
      capabilities: Object.fromEntries(["endorsement", "sensitivity", "tags", "ownership"].map((name) => [name, complete()])),
    };
    return {
      ...common, sections: { kqlSchema: unsupported("token-unavailable") },
      capabilities: { kqlSchema: unsupported("token-unavailable") },
    };
  });
  const legacy = vi.fn(async () => ({} as RawSync));
  return {
    functions, compatibility, legacy, sequence, maxActive: () => maxActive,
    deps: { client: { functions } as unknown as BrowserCollectorClient, compatibility, legacy },
  };
}
function storageHarness(type: "Lakehouse" | "Warehouse", available = true) {
  const h = harness();
  const storageCore = core();
  storageCore.items = storageCore.items.map((item) => item.id === SQL ? { ...item, type } : item);
  h.functions.workspaceCollectCore.invoke.mockResolvedValueOnce(storageCore);
  h.functions.workspaceCollectSqlMetadata.invoke.mockResolvedValueOnce({
    ...common("sql-metadata", [{ id: SQL, type, ...complete() }]),
    catalogs: {
      [SQL]: available
        ? {
            ...complete(),
            ...(type === "Lakehouse" ? { lakehouseTables: complete() } : {}),
          }
        : unsupported("token-unavailable"),
    },
    schema: available
      ? {
          [SQL]: [table(
            "dbo.Orders",
            type === "Lakehouse" ? "Fabric Lakehouse Tables REST" : "Fabric Warehouse system catalog",
          )],
        }
      : {},
    artifactMetadata: {},
    config: [],
    sections: {
      sqlProperties: complete(),
      sqlSchema: available ? complete() : unsupported("token-unavailable"),
    },
    capabilities: { sqlSchema: available ? complete() : unsupported("token-unavailable") },
  });
  return h;
}
afterEach(() => vi.unstubAllEnvs());

describe("active browser collector composition", () => {
  it("calls all supported Rayfin stages serially and plans only exact Python gaps", async () => {
    const h = harness();
    const result = await collectBrowserWorkspace(WS, identity, RUN, undefined, undefined, h.deps);
    expect(h.sequence).toEqual(["core", "provenance", "definitions", "sql", "kql", "powerbi", "python-scanner", "python-items", "relations"]);
    expect(h.maxActive()).toBe(1);
    expect(h.legacy).not.toHaveBeenCalled();
    expect(h.compatibility.mock.calls[0][0].schemaItemIds).toEqual([]);
    expect(h.compatibility.mock.calls[1][0].items).toEqual([{ id: KQL, type: "KQLDatabase", collectors: ["kqlDataPlane"] }]);
    expect(result.raw.schema?.[MODEL]?.[0].source).toBe("Fabric semantic model definition (TMSL)");
    expect(result.raw.schema?.[SQL]?.[0].source).toBe("Fabric SQL system catalog");
    expect(result.raw.collectorSources?.[`definitions:${ONTOLOGY}`]?.source).toBe("rayfin");
    expect(result.raw.collectorSources?.[`kqlDataPlane:${KQL}`]).toEqual({ source: "unsupported", code: "token-unavailable" });
    validateRawSync(result.raw, WS);
    expect(result.itemRelationsCollection?.workspaceItemCount).toBe(items.length);
  });
  it("keeps Item Relations Preview evidence out of authoritative lineage", async () => {
    const h = harness();
    const result = await collectBrowserWorkspace(WS, identity, RUN, undefined, undefined, h.deps);
    expect(result.raw.lineage).toEqual([{ source: MODEL, target: REPORT, relation: "report" }]);
    expect(result.itemRelationsCollection?.evidence.queries).toHaveLength(items.length * 2);
  });
  it("retains distinct scanner item grants and deduplicates repeated grants", async () => {
    const h = harness();
    const original = h.compatibility.getMockImplementation()!;
    const grant = {
      itemId: REPORT, principalId: FOREIGN, principalName: "External reviewer",
      principalEmail: "reviewer@example.test", principalType: "User",
      userType: "Guest", accessRight: "Read",
    };
    h.compatibility.mockImplementation(async (plan) => {
      const result = await original(plan);
      return plan.stage === "scanner"
        ? { ...result, access: [grant, { ...grant }, { ...grant, accessRight: "ReadWrite" }] }
        : result;
    });

    const result = await collectBrowserWorkspace(WS, identity, RUN, undefined, undefined, h.deps);
    const atlas = mapSyncToAtlas(result.raw, { fabricId: WS, displayName: "Fixture", capacity: "", region: "" });

    expect(result.raw.access).toEqual([grant, { ...grant, accessRight: "ReadWrite" }]);
    expect(atlas.grants.filter((entry) => entry.source === "directShare")).toEqual([
      expect.objectContaining({ itemFabricId: REPORT, principalRef: FOREIGN, accessLevel: "view", flag: "external" }),
      expect.objectContaining({ itemFabricId: REPORT, principalRef: FOREIGN, accessLevel: "edit", flag: "external" }),
    ]);
    expect(atlas.principals).toContainEqual(expect.objectContaining({ principalId: FOREIGN, external: true }));
  });
  it("publishes active stage coverage instead of Core migration placeholders", async () => {
    const h = harness();
    const result = await collectBrowserWorkspace(WS, identity, RUN, undefined, undefined, h.deps);

    expect(result.raw.sections?.definitions).toEqual(complete());
    expect(result.raw.capabilities?.definitionEnrichment).toEqual(complete());
    expect(result.raw.sections?.sqlSchema).toEqual(complete());
    expect(result.raw.capabilities?.sqlSchema).toEqual(complete());
    expect(result.raw.sections?.kqlSchema).toEqual({ status: "complete", code: "partial-unsupported" });
    expect(result.raw.capabilities?.kqlSchema).toEqual({ status: "complete", code: "partial-unsupported" });
    expect(JSON.stringify(result.raw.sections)).not.toContain("collector-not-migrated");
    expect(JSON.stringify(result.raw.capabilities)).not.toContain("collector-not-migrated");
  });
  it.each([
    ["Lakehouse", "Fabric Lakehouse Tables REST"],
    ["Warehouse", "Fabric Warehouse system catalog"],
  ] as const)("keeps %s schema in the Rayfin collector with %s", async (type, source) => {
    const h = storageHarness(type);
    const result = await collectBrowserWorkspace(WS, identity, RUN, undefined, undefined, h.deps);

    expect(result.raw.schema?.[SQL]).toEqual([table("dbo.Orders", source)]);
    expect(result.raw.sections?.sqlSchema).toEqual(complete());
    expect(result.raw.capabilities?.sqlSchema).toEqual(complete());
    expect(h.compatibility.mock.calls[0][0].schemaItemIds).toEqual([]);
    expect(h.functions.workspaceCollectSqlMetadata.invoke).toHaveBeenCalledTimes(1);
    expect(h.legacy).not.toHaveBeenCalled();
    expect(result.raw.config).toContainEqual({
      itemId: SQL, section: "Storage schema coverage", label: "Status",
      value: "complete",
    });
  });
  it.each(["Lakehouse", "Warehouse"] as const)("publishes unsupported %s coverage instead of 'Storage schema inventory was unavailable. The previous snapshot was preserved.'", async (type) => {
    const h = storageHarness(type, false);
    const collected = collectBrowserWorkspace(WS, identity, RUN, undefined, undefined, h.deps);
    await expect(collected).resolves.toMatchObject({
      raw: {
        sections: { storageSchema: unsupported("storage-schema-unavailable") },
        capabilities: { storageSchema: unsupported("storage-schema-unavailable") },
      },
    });
    const { raw } = await collected;
    expect(raw.schema?.[SQL]).toBeUndefined();
    expect(raw.items).toContainEqual({ id: SQL, type });
    expect(raw.roleAssignments).toEqual(core().roleAssignments);
    expect(raw.lineage).toContainEqual({ source: MODEL, target: REPORT, relation: "report" });
    expect(raw.collectorSources?.[`storageSchema:${SQL}`]).toEqual({ source: "unsupported", code: "storage-schema-unavailable" });
    expect(raw.config).toContainEqual({
      itemId: SQL, section: "Storage schema coverage", label: "Status", value: "unsupported: storage-schema-unavailable",
    });
    validateRawSync(raw, WS);
  });
  it("reports mixed storage availability per item without discarding the collected warehouse", async () => {
    const h = harness();
    const collectedCore = core();
    collectedCore.items = collectedCore.items.map((item) => ({
      ...item, type: item.id === SQL ? "Lakehouse" : item.id === ONTOLOGY ? "Warehouse" : item.type,
    }));
    h.functions.workspaceCollectCore.invoke.mockResolvedValueOnce(collectedCore);
    h.functions.workspaceCollectSqlMetadata.invoke.mockResolvedValueOnce({
      ...common("sql-metadata", [
        { id: ONTOLOGY, type: "Warehouse", ...complete() },
        { id: SQL, type: "Lakehouse", ...complete() },
      ]),
      catalogs: { [ONTOLOGY]: complete(), [SQL]: unsupported("token-unavailable") },
      schema: { [ONTOLOGY]: [table("dbo.CollectedOrders", "Fabric SQL system catalog")] },
      artifactMetadata: {}, config: [], sections: { sqlSchema: { status: "complete", code: "partial-unsupported" } },
    });
    const original = h.compatibility.getMockImplementation()!;
    h.compatibility.mockImplementation(async (plan) => {
      const result = await original(plan);
      result.schema = {};
      if (plan.stage === "scanner") result.sections!.storageSchema = unsupported("scanner-schema-unavailable");
      else result.sections!.lakehouseTables = unsupported("endpoint-unsupported");
      return result;
    });
    const { raw } = await collectBrowserWorkspace(WS, identity, RUN, undefined, undefined, h.deps);
    expect(raw.schema?.[SQL]).toBeUndefined();
    expect(raw.schema?.[ONTOLOGY]).toEqual([table("dbo.CollectedOrders", "Fabric SQL system catalog")]);
    expect(raw.sections?.storageSchema).toEqual({ status: "complete", code: "partial-unsupported" });
    expect(raw.config).toEqual(expect.arrayContaining([
      { itemId: ONTOLOGY, section: "Storage schema coverage", label: "Status", value: "complete" },
      { itemId: SQL, section: "Storage schema coverage", label: "Status", value: "unsupported: storage-schema-unavailable" },
    ]));
    validateRawSync(raw, WS);
  });
  it("does not call an empty unsupported scanner result a verified empty storage inventory", async () => {
    const h = storageHarness("Warehouse", false);
    const original = h.compatibility.getMockImplementation()!;
    h.compatibility.mockImplementation(async (plan) => {
      const result = await original(plan);
      if (plan.stage === "scanner") result.schema = { [SQL]: [] };
      return result;
    });
    const { raw } = await collectBrowserWorkspace(WS, identity, RUN, undefined, undefined, h.deps);
    expect(raw.schema?.[SQL]).toBeUndefined();
    expect(raw.sections?.storageSchema).toEqual(unsupported("storage-schema-unavailable"));
  });
  it("accepts a verified empty Lakehouse inventory from Rayfin", async () => {
    const h = harness();
    const storageCore = core();
    storageCore.items = storageCore.items.map((item) =>
      item.id === SQL ? { ...item, type: "Lakehouse" } : item,
    );
    h.functions.workspaceCollectCore.invoke.mockResolvedValueOnce(storageCore);
    h.functions.workspaceCollectSqlMetadata.invoke.mockResolvedValueOnce({
      ...common("sql-metadata", [{ id: SQL, type: "Lakehouse", ...complete() }]),
      catalogs: { [SQL]: { ...complete(), lakehouseTables: complete() } },
      schema: { [SQL]: [] },
      artifactMetadata: {},
      config: [],
      sections: { sqlProperties: complete(), sqlSchema: complete() },
      capabilities: { sqlSchema: complete() },
    });
    const { raw } = await collectBrowserWorkspace(
      WS,
      identity,
      RUN,
      undefined,
      undefined,
      h.deps,
    );

    expect(h.compatibility.mock.calls[0][0].schemaItemIds).not.toContain(SQL);
    expect(raw.schema?.[SQL]).toEqual([]);
    expect(raw.collectorSources?.[`sqlSchema:${SQL}`]).toEqual({ source: "rayfin" });
    expect(raw.sections?.storageSchema).toEqual(complete());
  });
  it("keeps a successful Rayfin Lakehouse schema when another Lakehouse fails", async () => {
    const h = harness();
    const storageCore = core();
    storageCore.items = storageCore.items.map((item) => ({
      ...item,
      type:
        item.id === SQL || item.id === ONTOLOGY ? "Lakehouse" : item.type,
    }));
    h.functions.workspaceCollectCore.invoke.mockResolvedValueOnce(storageCore);
    h.functions.workspaceCollectSqlMetadata.invoke.mockResolvedValueOnce({
      ...common("sql-metadata", [
        { id: ONTOLOGY, type: "Lakehouse", ...complete() },
        { id: SQL, type: "Lakehouse", ...complete() },
      ]),
      catalogs: {
        [ONTOLOGY]: { status: "failed", code: "upstream-failure" },
        [SQL]: { ...complete(), lakehouseTables: complete() },
      },
      schema: {
        [SQL]: [table("silver.Valid", "Fabric Lakehouse Tables REST")],
      },
      artifactMetadata: {},
      config: [],
      sections: {
        sqlProperties: complete(),
        sqlSchema: { status: "complete", code: "partial-unsupported" },
      },
      capabilities: { sqlSchema: { status: "complete", code: "partial-unsupported" } },
    });

    const { raw } = await collectBrowserWorkspace(
      WS,
      identity,
      RUN,
      undefined,
      undefined,
      h.deps,
    );

    expect(raw.schema?.[SQL]).toEqual([
      table("silver.Valid", "Fabric Lakehouse Tables REST"),
    ]);
    expect(raw.schema?.[ONTOLOGY]).toBeUndefined();
    expect(raw.sections?.storageSchema).toEqual({
      status: "complete",
      code: "partial-unsupported",
    });
  });
  it("keeps usable partial Lakehouse REST inventory from Rayfin", async () => {
    const h = storageHarness("Lakehouse");
    h.functions.workspaceCollectSqlMetadata.invoke.mockReset();
    h.functions.workspaceCollectSqlMetadata.invoke.mockResolvedValueOnce({
      ...common("sql-metadata", [{ id: SQL, type: "Lakehouse", ...complete() }]),
      catalogs: {
        [SQL]: {
          status: "complete",
          code: "partial-unsupported",
          lakehouseTables: unsupported("endpoint-unsupported"),
        },
      },
      schema: {
        [SQL]: [
          table("dbo.Orders", "Fabric SQL analytics endpoint system catalog"),
          table("silver.Orders", "Fabric Lakehouse Tables REST"),
        ],
      },
      artifactMetadata: {},
      config: [],
      sections: { sqlProperties: complete(), sqlSchema: { status: "complete", code: "partial-unsupported" } },
      capabilities: { sqlSchema: { status: "complete", code: "partial-unsupported" } },
    });
    const result = await collectBrowserWorkspace(WS, identity, RUN, undefined, undefined, h.deps);
    expect(result.raw.schema?.[SQL]?.map((entry) => entry.name)).toEqual(["dbo.Orders", "silver.Orders"]);
    expect(result.raw.sections?.storageSchema).toEqual({ status: "complete", code: "partial-unsupported" });
    expect(result.raw.collectorSources?.[`storageSchema:${SQL}`]).toEqual({ source: "rayfin" });
  });
  it("rejects foreign or truncated provenance instead of publishing misleading coverage", async () => {
    for (const invalid of [{ workspaceId: FOREIGN }, { stopCode: "deadline-exhausted" }]) {
      const h = harness();
      h.functions.workspaceCollectSourceProvenance.invoke.mockResolvedValueOnce({
        ...common("source-provenance", [{ id: KQL, type: "KQLDatabase", ...complete() }]),
        collectedAt: NOW, summary: complete(), ...invalid,
      });
      await expect(collectBrowserWorkspace(WS, identity, RUN, undefined, undefined, h.deps)).rejects.toThrow("invalid");
    }
  });
  it("differentially preserves catalog identities, roles and source-to-consumer scanner bindings", async () => {
    const h = harness();
    const { raw } = await collectBrowserWorkspace(WS, identity, RUN, undefined, undefined, h.deps);
    const mapped = mapSyncToAtlas(raw, { id: WS, displayName: "Fixture" } as never);
    expect(mapped.items.map((item) => item.fabricId).sort()).toEqual(items.map((item) => item.id).sort());
    expect(mapped.edges).toContainEqual(expect.objectContaining({ source: MODEL, target: REPORT }));
    expect(raw.roleAssignments).toEqual(core().roleAssignments);
    expect(raw.items).toEqual(core().items);
    expect(raw.itemMetadata?.[MODEL]?.scannerMatched).toBe(true);
    expect(raw.schema?.[MODEL]?.[0].columns).toEqual(table("Sales", "legacy").columns);
  });
  it("requests scanner schema only for an unsupported model definition and page fallback only for legacy reports", async () => {
    const h = harness();
    h.functions.workspaceCollectPowerBi.invoke.mockImplementationOnce(async () => ({
      ...common("powerbi-metadata", [
        { id: MODEL, type: "SemanticModel", schema: unsupported("read-write-permission-required") },
        { id: REPORT, type: "Report", pages: unsupported("pbir-legacy-pages-unsupported") },
      ]), schema: {}, models: {}, reports: {}, itemMetadata: {}, config: [],
    }));
    const result = await collectBrowserWorkspace(WS, identity, RUN, undefined, undefined, h.deps);
    expect(h.compatibility.mock.calls[0][0].schemaItemIds).toEqual([MODEL]);
    expect(h.compatibility.mock.calls[1][0].items).toContainEqual({ id: REPORT, type: "Report", collectors: ["reportPages"] });
    expect(result.raw.schema?.[MODEL]?.[0].source).toBe("Power BI admin scanner");
  });
  it("does not call Python definitions/SQL when their Rayfin evidence is complete", async () => {
    const h = harness();
    await collectBrowserWorkspace(WS, identity, RUN, undefined, undefined, h.deps);
    const plans = h.compatibility.mock.calls.flatMap(([plan]) => plan.items);
    expect(plans.some((item) => item.collectors.includes("definitions") || item.collectors.includes("sqlDataPlane"))).toBe(false);
  });
  it("does not route a migrated definition collector back through Python", async () => {
    const h = harness();
    h.functions.workspaceCollectDefinitions.invoke.mockImplementationOnce(async () => ({
      ...common("definitions", [{ id: ONTOLOGY, type: "Ontology", ...unsupported("read-write-permission-required") }]),
      artifactMetadata: {}, config: [],
    }));
    const result = await collectBrowserWorkspace(WS, identity, RUN, undefined, undefined, h.deps);
    expect(h.compatibility.mock.calls.flatMap(([plan]) => plan.items)
      .some((item) => item.collectors.includes("definitions"))).toBe(false);
    expect(result.raw.collectorSources?.[`definitions:${ONTOLOGY}`]).toEqual({
      source: "unsupported",
      code: "read-write-permission-required",
    });
  });
  it.each(["workspace", "correlation", "duplicate", "foreign-schema"])("rejects %s mismatch without legacy authority downgrade", async (kind) => {
    const h = harness();
    h.functions.workspaceCollectSqlMetadata.invoke.mockImplementationOnce(async () => ({
      ...common("sql-metadata", kind === "duplicate" ? [{ id: SQL, type: "SQLDatabase", ...complete() }, { id: SQL, type: "SQLDatabase", ...complete() }] : [{ id: SQL, type: "SQLDatabase", ...complete() }]),
      workspaceId: kind === "workspace" ? FOREIGN : WS,
      correlationId: kind === "correlation" ? FOREIGN : RUN,
      schema: kind === "foreign-schema" ? { [FOREIGN]: [] } : {},
      catalogs: { [SQL]: complete() }, config: [],
    }));
    await expect(collectBrowserWorkspace(WS, identity, RUN, undefined, undefined, h.deps)).rejects.toThrow("invalid");
    expect(h.legacy).not.toHaveBeenCalled();
  });
  it("requires scanner access completion and never promotes missing access to empty evidence", async () => {
    const h = harness();
    const original = h.compatibility.getMockImplementation()!;
    h.compatibility.mockImplementation(async (plan) => {
      const result = await original(plan);
      if (plan.stage === "scanner") result.sections!.access = { status: "failed", code: "scanner-user-information-unavailable" };
      return result;
    });
    await expect(collectBrowserWorkspace(WS, identity, RUN, undefined, undefined, h.deps)).rejects.toThrow("incomplete");
    expect(h.legacy).not.toHaveBeenCalled();
  });
  it("checks the exact compatibility plan echo rather than accepting broader Python work", async () => {
    const h = harness();
    const original = h.compatibility.getMockImplementation()!;
    h.compatibility.mockImplementation(async (plan) => {
      const result = await original(plan);
      if (plan.stage === "items") result.compatibilityCollectors![KQL] = ["definitions", "jobs", "kqlDataPlane"];
      return result;
    });
    await expect(collectBrowserWorkspace(WS, identity, RUN, undefined, undefined, h.deps)).rejects.toThrow("invalid");
  });
  it("preserves cancellation and bounds stalled invocations", async () => {
    const h = harness();
    const controller = new AbortController();
    controller.abort();
    await expect(collectBrowserWorkspace(WS, identity, RUN, undefined, controller.signal, h.deps)).rejects.toThrow("cancelled");
    expect(h.functions.workspaceCollectCore.invoke).not.toHaveBeenCalled();
    h.functions.workspaceCollectCore.invoke.mockImplementationOnce(() => new Promise(() => undefined));
    await expect(collectBrowserWorkspace(WS, identity, RUN, undefined, undefined, { ...h.deps, timeoutMs: 10 })).rejects.toThrow("deadline");
    expect(h.legacy).not.toHaveBeenCalled();
  });
  it("does not make Preview transport failure a snapshot-authority failure", async () => {
    const h = harness();
    h.functions.workspaceCollectItemRelations.invoke.mockRejectedValueOnce(new Error("private transport detail"));
    const result = await collectBrowserWorkspace(WS, identity, RUN, undefined, undefined, h.deps);
    expect(result.itemRelationsCollection).toBeUndefined();
    expect(result.raw.collectorSources?.itemRelations).toEqual({ source: "unsupported", code: "preview-evidence-unavailable" });
    expect(JSON.stringify(result.raw)).not.toContain("private transport detail");
  });
  it("has an easy explicit Python rollback with no Rayfin invocation or v2 scheduling", async () => {
    const h = harness();
    const active = await collectBrowserWorkspace(WS, identity, RUN, undefined, undefined, h.deps);
    for (const fn of Object.values(h.functions)) fn.invoke.mockClear();
    h.legacy.mockResolvedValue(active.raw);
    vi.stubEnv("VITE_ATLAS_COLLECTOR_ROLLBACK", "true");
    expect(pythonCollectorRollbackEnabled()).toBe(true);
    const rolledBack = await collectBrowserWorkspace(WS, identity, RUN, undefined, undefined, h.deps);
    expect(rolledBack.raw.collectorSources?.core.source).toBe("python-rollback");
    expect(h.legacy).toHaveBeenCalledTimes(1);
    expect(Object.values(h.functions).every((fn) => fn.invoke.mock.calls.length === 0)).toBe(true);
  });
});
