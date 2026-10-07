import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ATLAS_CONFIG } from "./config";
import { loadFromDb, runFabricSync } from "./backend";
import { createItemRelationsEvidence } from "./item-relations-evidence";
import type { CompatibilityPlan, RawSync } from "./live-sync";
import { AtlasProvider, useAtlas } from "./store";
import { MapView } from "./views/Map";

const fixture = vi.hoisted(() => ({
  client: {} as { data: Record<string, unknown>; functions: Record<string, unknown> },
  compatibility: vi.fn(),
  unavailable: false,
}));
vi.mock("@/lib/rayfin-client", () => ({ getRayfinClient: () => fixture.client }));
vi.mock("./live-sync", async (original) => ({
  ...await original<typeof import("./live-sync")>(),
  createCompatibilityInvoker: (workspaceId: string, _identity: unknown, correlationId: string) =>
    (plan: CompatibilityPlan) => fixture.compatibility(workspaceId, correlationId, plan),
}));

const FIRST = "11111111-1111-4111-8111-111111111111";
const SECOND = "22222222-2222-4222-8222-222222222222";
const ADMIN = "33333333-3333-4333-8333-333333333333";
const GUEST = "44444444-4444-4444-8444-444444444444";
const NOW = "2026-10-02T12:00:00.000Z";
const user = { id: ADMIN, name: "Collector", email: "collector@example.test" };
const complete = () => ({ status: "complete" as const });
const unsupported = (code: string) => ({ status: "unsupported" as const, code });
const estate = (workspaceId: string) => workspaceId === FIRST
  ? { lake: "10000000-0000-4000-8000-000000000001", model: "10000000-0000-4000-8000-000000000002", ontology: "10000000-0000-4000-8000-000000000003", mirror: "10000000-0000-4000-8000-000000000004", name: "First", table: "gold.FirstSales" }
  : { lake: "20000000-0000-4000-8000-000000000001", model: "20000000-0000-4000-8000-000000000002", ontology: "20000000-0000-4000-8000-000000000003", mirror: "20000000-0000-4000-8000-000000000004", name: "Second", table: "gold.SecondSales" };
const table = (workspaceId: string) => ({
  name: estate(workspaceId).table, source: "Downstream semantic model", objectType: "Table",
  columns: [{ name: "Id", dataType: "Int64" }], measures: [],
});
const lakeTable = (workspaceId: string) => ({
  ...table(workspaceId),
  source: "Fabric Lakehouse Tables REST",
});

function memoryEntity() {
  const rows: Record<string, unknown>[] = [];
  return {
    rows,
    async create(row: Record<string, unknown>) {
      const stored = { id: crypto.randomUUID(), ...row };
      rows.push(stored);
      return stored;
    },
    async update(where: { id: string }, values: Record<string, unknown>) {
      Object.assign(rows.find((row) => row.id === where.id)!, values);
    },
    async delete(where: { id: string }) {
      const index = rows.findIndex((row) => row.id === where.id);
      if (index >= 0) rows.splice(index, 1);
    },
    async findById(id: string) { return rows.find((row) => row.id === id) ?? null; },
    select() {
      let filter: Record<string, unknown> = {};
      let limit = Number.POSITIVE_INFINITY;
      const read = () => rows.filter((row) => Object.entries(filter).every(([key, condition]) => {
        const expected = condition && typeof condition === "object" && "eq" in condition
          ? (condition as { eq: unknown }).eq : condition;
        return String(row[key] ?? "").toLowerCase() === String(expected ?? "").toLowerCase();
      })).slice(0, limit);
      const query = {
        where(value: Record<string, unknown>) { filter = value; return query; },
        orderBy() { return query; },
        first(value: number) { limit = value; return query; },
        after() { return query; },
        async execute() { return read(); },
        async executePaginated() { return { items: read(), hasNextPage: false }; },
      };
      return query;
    },
  };
}

function installBoundaries() {
  const names = [
    "Workspace", "FabricItem", "LineageEdge", "Principal", "AccessGrant", "JobRun", "ConfigEntry",
    "Comment", "SyncRun", "WorkspaceScope", "SavedView", "FindingAck", "GovernancePolicy",
    "GovernanceException", "OperationalIncident", "ItemRelationsEvidenceSnapshot",
  ];
  const data = Object.fromEntries(names.map((name) => [name, memoryEntity()]));
  for (const id of [FIRST, SECOND]) data.WorkspaceScope.rows.push({
    id, displayName: estate(id).name, workspaceType: "Workspace", selectedAt: NOW,
  });
  const invoke = (output: (input: Record<string, unknown>) => unknown) => ({ invoke: vi.fn(async (input: Record<string, unknown>) => output(input)) });
  const context = (input: Record<string, unknown>, stage: string) => ({
    contractVersion: 1, stage, authoritative: false, workspaceId: input.workspaceId,
    correlationId: input.correlationId, errors: [], syncedAt: NOW,
  });
  fixture.client = { data, functions: {
    workspaceCollectCore: invoke((input) => {
      const e = estate(String(input.workspaceId));
      const missing = unsupported("collector-not-migrated");
      return {
        schemaVersion: 2, syncMode: "base", correlationId: input.correlationId,
        workspace: { id: input.workspaceId, displayName: e.name },
        items: [{ id: e.lake, type: "Lakehouse", displayName: `${e.name} lake` }, { id: e.model, type: "SemanticModel", displayName: `${e.name} model` }, { id: e.ontology, type: "Ontology", displayName: `${e.name} ontology` }, { id: e.mirror, type: "MirroredDatabase", displayName: `${e.name} Oracle mirror` }],
        roleAssignments: [{ role: "Admin", principal: { id: ADMIN, displayName: "Collector", type: "User" } }],
        jobs: [], lineage: [], access: [], config: [], objectEdges: [], schema: {}, artifactMetadata: {},
        itemMetadata: Object.fromEntries([e.lake, e.model, e.ontology, e.mirror].map((id) => [id, { scannerMatched: false, ownerAvailable: false }])),
        sections: Object.fromEntries(["workspace", "items", "roleAssignments", "jobs", "scanner", "schema", "lineage", "access", "config", "definitions", "kqlSchema", "sqlSchema"].map((name) => [name, ["workspace", "items", "roleAssignments", "jobs"].includes(name) ? complete() : missing])),
        capabilities: Object.fromEntries(["endorsement", "sensitivity", "tags", "ownership", "definitionEnrichment", "kqlSchema", "sqlSchema", "objectLineage"].map((name) => [name, missing])),
        errors: [], syncedAt: NOW,
      };
    }),
    workspaceCollectSourceProvenance: invoke((input) => {
      const e = estate(String(input.workspaceId));
      return {
        ...context(input, "source-provenance"), collectedAt: NOW, summary: { status: "complete", code: "partial-unsupported" },
        items: (input.items as { id: string; type: string }[]).map((item) => item.type === "Lakehouse" ? {
          ...item, status: "complete", code: "partial-unsupported",
          shortcuts: { ...complete(), truncated: false, shortcuts: [
            { name: "MirrorOrders", path: "Tables/silver", targetType: "OneLake", oneLake: { workspaceId: input.workspaceId, itemId: e.mirror, path: "Tables/OPS/ORDERS" } },
          ] },
          materializedLakeViews: { ...unsupported("read-write-permission-required"), definitions: [], truncated: false },
        } : {
          ...item, ...complete(), mirroring: {
            ...complete(), properties: complete(), replication: { ...complete(), state: "Running" },
            definition: { ...complete(), sourceType: "Oracle", connectionId: ADMIN,
              externalStorages: [], tableSelection: "selected", tables: [{ schema: "OPS", table: "ORDERS" }], tablesTruncated: false },
          },
        }),
        password: "PROVENANCE_SECRET_CANARY", businessRows: ["BUSINESS_DATA_CANARY"],
      };
    }),
    workspaceCollectSqlMetadata: invoke((input) => {
      const workspaceId = String(input.workspaceId);
      const e = estate(workspaceId);
      const lake = e.lake;
      const mirror = e.mirror;
      return {
        ...context(input, "sql-metadata"),
        items: (input.items as { id: string; type: string }[]).map((item) => ({ ...item, ...complete() })),
        catalogs: {
          [lake]: fixture.unavailable
            ? unsupported("token-unavailable")
            : { ...complete(), lakehouseTables: complete() },
          [mirror]: fixture.unavailable
            ? unsupported("token-unavailable")
            : complete(),
        },
        schema: fixture.unavailable ? {} : {
          [lake]: [lakeTable(workspaceId)],
          [mirror]: [{
            name: "OPS.ORDERS",
            source: "Fabric mirrored database SQL endpoint system catalog",
            objectType: "SQL endpoint table",
            columns: [
              { name: "ORDER_ID", dataType: "bigint" },
              { name: "CUSTOMER_ID", dataType: "bigint" },
            ],
            measures: [],
          }],
        },
        artifactMetadata: {},
        config: [],
        sections: {
          sqlProperties: complete(),
          sqlSchema: fixture.unavailable ? unsupported("token-unavailable") : complete(),
        },
        capabilities: {
          sqlSchema: fixture.unavailable ? unsupported("token-unavailable") : complete(),
        },
      };
    }),
    workspaceCollectDefinitions: invoke((input) => ({
      ...context(input, "definitions"),
      items: (input.items as { id: string; type: string }[]).map((item) => ({ ...item, ...complete() })),
      artifactMetadata: { [estate(String(input.workspaceId)).ontology]: { kind: "ontology", entities: [], relationships: [], bindings: [], contextualizations: [] } },
      config: [], sections: { definitions: complete() }, capabilities: { definitionEnrichment: complete() },
    })),
    workspaceCollectPowerBi: invoke((input) => ({
      ...context(input, "powerbi-metadata"),
      items: [{ id: estate(String(input.workspaceId)).model, type: "SemanticModel", schema: complete() }],
      schema: { [estate(String(input.workspaceId)).model]: [table(String(input.workspaceId))] },
      config: [], models: {}, reports: {}, sections: { schema: complete() }, capabilities: { modelSchema: complete() },
    })),
    workspaceCollectItemRelations: invoke((input) => ({
      ...createItemRelationsEvidence(String(input.workspaceId), NOW, (input.itemIds as string[]).flatMap((itemId) =>
        (["upstream", "downstream"] as const).map((direction) => ({ itemId, direction, status: "failed" as const, failureCode: "failed" as const, attemptedAt: NOW })))),
      authoritative: false, correlationId: input.correlationId,
    })),
  } };
  fixture.compatibility.mockImplementation(async (workspaceId: string, correlationId: string, plan: CompatibilityPlan): Promise<RawSync> => {
    const e = estate(workspaceId);
    const grant = { itemId: e.model, principalId: GUEST, principalType: "User", userType: "Guest", principalName: "Reviewer", accessRight: "Read" };
    return {
      schemaVersion: 2, syncMode: "compatibility", compatibilityVersion: 1, compatibilityStage: plan.stage,
      workspace: { id: workspaceId }, correlationId, requestedItemIds: plan.items.map((item) => item.id),
      completedItemIds: plan.items.map((item) => item.id), remainingItemIds: [], itemFailures: {},
      compatibilityCollectors: Object.fromEntries(plan.items.map((item) => [item.id, item.collectors])),
      schema: {},
      config: [], jobs: [], access: plan.stage === "scanner" ? [grant, { ...grant }] : [],
      lineage: plan.stage === "scanner" ? [{ source: e.lake, target: e.model, relation: "Direct Lake" }] : [],
      objectEdges: [], artifactMetadata: {}, itemMetadata: {},
      sections: plan.stage === "scanner"
        ? Object.fromEntries(["scanner", "access", "lineage", "schema", "config"].map((name) => [name, complete()]))
        : { lakehouseTables: unsupported("endpoint-unsupported") },
      capabilities: plan.stage === "scanner" ? Object.fromEntries(["endorsement", "sensitivity", "tags", "ownership"].map((name) => [name, complete()])) : {},
      errors: [], syncedAt: NOW,
    };
  });
  return data;
}

function Harness() {
  const atlas = useAtlas();
  const [noteError, setNoteError] = useState("");
  return <>
    <button onClick={() => atlas.selectWorkspace(SECOND)}>Second workspace</button>
    <button onClick={() => void atlas.addComment("Foreign target", estate(FIRST).lake).catch((error: Error) => setNoteError(error.message))}>Post foreign target</button>
    <output data-testid="hydrating">{String(atlas.hydrating)}</output>
    <output data-testid="workspace">{atlas.data.workspace.fabricId}</output>
    <output data-testid="schema">{JSON.stringify(atlas.data.schema)}</output>
    <output data-testid="grants">{JSON.stringify(atlas.data.grants)}</output>
    <output data-testid="note-error">{noteError}</output>
    <MapView key={atlas.activeWorkspaceId} itemRelationsEnabled={false} />
  </>;
}

describe("two-workspace collection, publication and hydration", () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/#map");
    vi.unstubAllEnvs();
    fixture.unavailable = false;
    fixture.compatibility.mockReset();
    ATLAS_CONFIG.workspaceId = FIRST;
    ATLAS_CONFIG.workspaceName = "First";
    ATLAS_CONFIG.syncAdminSubject = ADMIN;
    ATLAS_CONFIG.syncAdminEmail = user.email;
    ATLAS_CONFIG.previousSyncWriters = [];
  });

  it("retains each workspace's Rayfin schemas, unique scanner grants and real coverage after switching", async () => {
    const data = installBoundaries();
    await runFabricSync(false, user, undefined, undefined, FIRST);
    await runFabricSync(false, user, undefined, undefined, SECOND);
    const reloaded = await loadFromDb(false, SECOND);
    expect(reloaded?.schema?.[estate(SECOND).lake]).toEqual(expect.arrayContaining([
      lakeTable(SECOND),
      expect.objectContaining({ name: "silver.MirrorOrders", objectType: "Shortcut", columns: [] }),
    ]));
    expect(reloaded?.schema?.[estate(FIRST).lake]).toBeUndefined();
    expect(reloaded?.grants.filter((grant) => grant.source === "directShare")).toHaveLength(1);
    expect(reloaded?.workspace.syncSections?.definitions).toEqual(complete());
    expect(reloaded?.workspace.syncSections?.sqlSchema).toEqual(complete());
    expect(reloaded?.workspace.syncSections?.storageSchema).toEqual(complete());
    for (const workspaceId of [FIRST, SECOND]) {
      const hydrated = await loadFromDb(false, workspaceId);
      const e = estate(workspaceId);
      expect(hydrated?.edges).toContainEqual(expect.objectContaining({
        source: e.mirror, target: e.lake, relation: "onelake-shortcut",
      }));
      expect(hydrated?.schema?.[e.mirror]).toEqual([
        expect.objectContaining({
          name: "OPS.ORDERS",
          objectType: "SQL endpoint table",
          columns: [
            { name: "ORDER_ID", dataType: "bigint" },
            { name: "CUSTOMER_ID", dataType: "bigint" },
          ],
        }),
      ]);
      expect(hydrated?.config).toContainEqual(expect.objectContaining({
        itemFabricId: e.mirror, label: "mirroring-source",
        value: expect.stringContaining(`provider=Oracle; connection=${ADMIN}`),
      }));
      expect(hydrated?.workspace.syncSections?.sourceProvenance).toEqual({ status: "complete", code: "partial-unsupported" });
      expect(JSON.stringify(hydrated)).not.toMatch(/PROVENANCE_SECRET_CANARY|BUSINESS_DATA_CANARY/);
    }

    render(<AtlasProvider isPreview={false} currentUser={user}><Harness /></AtlasProvider>);
    await waitFor(() => expect(screen.getByTestId("hydrating")).toHaveTextContent("false"));
    expect(screen.getByTestId("schema")).toHaveTextContent("gold.FirstSales");
    fireEvent.click(screen.getByRole("button", { name: /^First lake, Lakehouse/ }));
    fireEvent.click(screen.getByRole("button", { name: "objects" }));
    expect(screen.getByRole("button", { name: /^gold.FirstSales, 1 columns/ })).toBeVisible();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Second workspace" })); });
    await waitFor(() => expect(screen.getByTestId("workspace")).toHaveTextContent(SECOND));
    await waitFor(() => expect(screen.getByTestId("hydrating")).toHaveTextContent("false"));
    expect(screen.getByTestId("schema")).toHaveTextContent("gold.SecondSales");
    expect(screen.getByTestId("schema")).not.toHaveTextContent("gold.FirstSales");
    expect(screen.getByTestId("grants")).toHaveTextContent(estate(SECOND).model);
    expect(screen.getByTestId("grants")).not.toHaveTextContent(estate(FIRST).model);
    fireEvent.click(screen.getByRole("button", { name: "items" }));
    fireEvent.click(screen.getByRole("button", { name: /^Second lake, Lakehouse/ }));
    fireEvent.click(screen.getByRole("button", { name: "objects" }));
    expect(screen.getByRole("button", { name: /^gold.SecondSales, 1 columns/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /^gold.FirstSales, 1 columns/ })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Schema" }), { key: "Enter" });
    const inspector = within(screen.getByRole("complementary", { name: "Item details inspector" }));
    expect(inspector.getByRole("button", { name: "gold.SecondSales" })).toBeVisible();
    expect(inspector.getByRole("button", { name: "silver.MirrorOrders" })).toBeVisible();
    fireEvent.click(inspector.getByRole("button", { name: "gold.SecondSales" }));
    expect(inspector.getByText("Id")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Post foreign target" }));
    await waitFor(() => expect(screen.getByTestId("note-error")).toHaveTextContent("The selected note target is not in the active workspace."));
    expect(data.Comment.rows).toHaveLength(0);
  });

  it("publishes a partial FGI-ORACLE-like snapshot when optional storage schema becomes unavailable", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW));
    installBoundaries();
    const previous = await runFabricSync(false, user, undefined, undefined, SECOND);
    vi.setSystemTime(new Date(Date.parse(NOW) + 60_000));
    fixture.unavailable = true;
    await expect(runFabricSync(false, user, undefined, undefined, SECOND))
      .resolves.toMatchObject({ workspace: { fabricId: SECOND } });
    const reloaded = await loadFromDb(false, SECOND);
    const e = estate(SECOND);
    expect(reloaded?.workspace.snapshotId).not.toBe(previous?.workspace.snapshotId);
    expect(reloaded?.items.map((item) => item.fabricId)).toEqual(expect.arrayContaining([e.lake, e.mirror, e.model]));
    expect(reloaded?.schema?.[e.lake]).toEqual([
      expect.objectContaining({ name: "silver.MirrorOrders", objectType: "Shortcut", columns: [] }),
    ]);
    expect(reloaded?.schema?.[e.lake]).not.toContainEqual(lakeTable(SECOND));
    expect(reloaded?.schema?.[e.mirror]).toEqual([
      expect.objectContaining({ name: "OPS.ORDERS", objectType: "Mirrored table", columns: [] }),
    ]);
    expect(reloaded?.edges).toContainEqual(expect.objectContaining({ source: e.mirror, target: e.lake, relation: "onelake-shortcut" }));
    expect(reloaded?.grants.filter((grant) => grant.source === "directShare")).toHaveLength(1);
    expect(reloaded?.workspace.syncSections?.storageSchema).toEqual({ status: "complete", code: "partial-unsupported" });
    expect(reloaded?.config).toContainEqual(expect.objectContaining({
      itemFabricId: e.lake, section: "Storage schema coverage", label: "Status", value: "complete: partial-unsupported",
    }));
    expect(reloaded?.config).toContainEqual(expect.objectContaining({
      itemFabricId: e.lake, section: "Collector capability", label: "storageSchema", value: "rayfin: source-provenance-only",
    }));
    expect(JSON.stringify(reloaded)).not.toMatch(/PROVENANCE_SECRET_CANARY|BUSINESS_DATA_CANARY/);
  });
  it("still preserves the published snapshot when required access evidence is incomplete", async () => {
    installBoundaries();
    const previous = await runFabricSync(false, user, undefined, undefined, SECOND);
    fixture.unavailable = true;
    const original = fixture.compatibility.getMockImplementation()!;
    fixture.compatibility.mockImplementation(async (workspaceId: string, correlationId: string, plan: CompatibilityPlan) => {
      const result = await original(workspaceId, correlationId, plan) as RawSync;
      if (plan.stage === "scanner") result.sections!.access = { status: "failed", code: "scanner-user-information-unavailable" };
      return result;
    });
    await expect(runFabricSync(false, user, undefined, undefined, SECOND)).rejects.toThrow(
      "Collector metadata was incomplete or invalid. The previous snapshot was preserved.",
    );
    const reloaded = await loadFromDb(false, SECOND);
    expect(reloaded?.workspace.snapshotId).toBe(previous?.workspace.snapshotId);
    expect(reloaded?.schema?.[estate(SECOND).lake]).toContainEqual(lakeTable(SECOND));
  });
});
