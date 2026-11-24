import { describe, expect, it, vi } from "vitest";
import {
  CATALOG_SEARCH_PAGE_SIZE,
  CATALOG_SEARCH_TIMEOUT_MS,
  applyCatalogSearchEnvelope,
  catalogEntryTypeLabel,
  catalogSearchAvailability,
  catalogSearchCoverageText,
  catalogSnapshotLookup,
  describeCatalogSearch,
  failedCatalogSearchEnvelope,
  idleCatalogSearchView,
  isCatalogSearchQuery,
  parseCatalogSearchEnvelope,
  resolveCatalogEntry,
  searchOneLakeCatalog,
  type CatalogSearchEntry,
  type CatalogSearchEnvelope,
  type CatalogSearchInvoker,
} from "./catalog-search";
import { SAMPLE_DATA } from "./model";
import { navigationForSearch } from "./navigation";
import { buildSearchIndex, searchIndex } from "./search";

const WS = "11111111-1111-4111-8111-111111111111";
const EXTERNAL = "66666666-6666-4666-8666-666666666666";
const NOW = Date.parse("2026-10-02T12:00:00.000Z");
const PORTAL = "https://app.fabric.microsoft.com";

function entry(id: string, displayName: string, overrides: Partial<CatalogSearchEntry> = {}): CatalogSearchEntry {
  return {
    key: `item:${id}`,
    id,
    catalogEntryType: "FabricItem",
    type: "Report",
    displayName,
    workspaceId: WS,
    workspaceDisplayName: "Partner workspace",
    ...overrides,
  };
}

function envelope(
  entries: CatalogSearchEntry[],
  overrides: Partial<CatalogSearchEnvelope> = {},
): CatalogSearchEnvelope {
  return {
    contractVersion: 1,
    source: "onelake-catalog-search",
    apiVersion: "v1-preview",
    authoritative: false,
    identity: "fabric-application",
    status: "complete",
    retryable: false,
    searchedAt: "2026-10-02T12:00:00.000Z",
    entries,
    coverage: {
      pagesFetched: 1,
      entriesReceived: entries.length,
      entriesReturned: entries.length,
      entriesSkipped: 0,
      duplicatesDropped: 0,
      descriptionsTruncated: 0,
      moreAvailable: false,
    },
    continuationToken: null,
    ...overrides,
  };
}

function invoker(result: unknown | (() => Promise<unknown>)) {
  const invoke = vi.fn(async () =>
    typeof result === "function" ? (result as () => Promise<unknown>)() : result,
  );
  return { client: { functions: { searchCatalogPreview: { invoke } } } as CatalogSearchInvoker, invoke };
}

describe("Catalog Search availability", () => {
  it("is off by default and synchronizer-only when enabled", () => {
    expect(catalogSearchAvailability({ enabled: false, isPreview: false, canSync: true })).toBe("disabled");
    expect(catalogSearchAvailability({ enabled: true, isPreview: true, canSync: true })).toBe("preview-data");
    expect(catalogSearchAvailability({ enabled: true, isPreview: false, canSync: false })).toBe("not-authorized");
    expect(catalogSearchAvailability({ enabled: true, isPreview: false, canSync: true })).toBe("available");
  });

  it("mirrors the Function's strict search-text rule", () => {
    expect(isCatalogSearchQuery("  sales  ")).toBe(true);
    expect(isCatalogSearchQuery("*")).toBe(false);
    expect(isCatalogSearchQuery("")).toBe(false);
    expect(isCatalogSearchQuery("a".repeat(201))).toBe(false);
    expect(isCatalogSearchQuery("sales\u202E")).toBe(false);
  });
});

describe("searchOneLakeCatalog", () => {
  it("invokes the Function with a fixed bounded first-page request", async () => {
    const { client, invoke } = invoker(envelope([entry(EXTERNAL, "Partner sales")]));
    const result = await searchOneLakeCatalog({ kind: "search", search: " partner   sales " }, { client, now: () => NOW });
    expect(invoke).toHaveBeenCalledWith(
      {
        protocolVersion: 1,
        search: "partner sales",
        itemTypes: [],
        workspaceIds: [],
        pageSize: CATALOG_SEARCH_PAGE_SIZE,
        continuationToken: null,
      },
      { timeoutMs: CATALOG_SEARCH_TIMEOUT_MS },
    );
    expect(result.entries.map((value) => value.id)).toEqual([EXTERNAL]);
  });

  it("sends a continuation token alone", async () => {
    const { client, invoke } = invoker(envelope([]));
    await searchOneLakeCatalog({ kind: "continue", continuationToken: "t1" }, { client });
    expect(invoke).toHaveBeenCalledWith(
      expect.objectContaining({ search: null, pageSize: null, continuationToken: "t1" }),
      expect.anything(),
    );
  });

  it("never invokes the Function for an unsearchable query", async () => {
    const { client, invoke } = invoker(envelope([]));
    const result = await searchOneLakeCatalog({ kind: "search", search: "***" }, { client });
    expect(invoke).not.toHaveBeenCalled();
    expect(result.failureCode).toBe("invalid-input");
  });

  it("turns an invocation failure into an honest retryable unavailable state", async () => {
    const { client } = invoker(() => Promise.reject(new Error("Function host 502")));
    const result = await searchOneLakeCatalog({ kind: "search", search: "sales" }, { client, now: () => NOW });
    expect(result).toMatchObject({ status: "failed", failureCode: "unavailable", retryable: true, entries: [] });
  });

  it("rejects an envelope that claims authority or carries untrusted entries", async () => {
    const authoritative = invoker({ ...envelope([]), authoritative: true });
    await expect(
      searchOneLakeCatalog({ kind: "search", search: "sales" }, { client: authoritative.client }),
    ).resolves.toMatchObject({ failureCode: "malformed-response" });
    expect(
      parseCatalogSearchEnvelope(envelope([{ ...entry(EXTERNAL, "x"), id: "not-a-uuid" }]), "now").failureCode,
    ).toBe("malformed-response");
  });

  it("keeps only contract fields from the Function response", () => {
    const parsed = parseCatalogSearchEnvelope(
      { ...envelope([entry(EXTERNAL, "Sales")]), extra: "drop me", scope: { search: "sales" } },
      "now",
    );
    expect(parsed).not.toHaveProperty("extra");
    expect(parsed.entries).toEqual([entry(EXTERNAL, "Sales")]);
  });
});

describe("Catalog Search view state", () => {
  const view = { ...idleCatalogSearchView("sales") };

  it("appends pages first-wins without reordering earlier entries", () => {
    const first = applyCatalogSearchEnvelope(
      view,
      envelope([entry(EXTERNAL, "A"), entry(WS, "B")], { continuationToken: "t1" }),
      false,
    );
    const second = applyCatalogSearchEnvelope(
      first,
      envelope([entry(WS, "B again"), entry("77777777-7777-4777-8777-777777777777", "C")]),
      true,
    );
    expect(second.entries.map((value) => value.displayName)).toEqual(["A", "B", "C"]);
    expect(second).toMatchObject({ phase: "ready", duplicatesDropped: 1, pagesFetched: 2, continuationToken: null });
  });

  it("keeps shown entries when a later page fails", () => {
    const first = applyCatalogSearchEnvelope(view, envelope([entry(EXTERNAL, "A")], { continuationToken: "t1" }), false);
    const failed = applyCatalogSearchEnvelope(
      first,
      { ...failedCatalogSearchEnvelope("throttled", "now"), continuationToken: "t1", retryable: true },
      true,
    );
    expect(failed.entries.map((value) => value.displayName)).toEqual(["A"]);
    expect(failed).toMatchObject({ failureCode: "throttled", retryable: true, continuationToken: "t1" });
  });

  it("caps accumulated entries and stops offering more", () => {
    const capped = applyCatalogSearchEnvelope(
      view,
      envelope([entry(EXTERNAL, "A"), entry(WS, "B")], { continuationToken: "t1" }),
      false,
      1,
    );
    expect(capped).toMatchObject({ capped: true, continuationToken: null });
    expect(capped.entries).toHaveLength(1);
  });

  it("describes empty results without claiming absence", () => {
    const empty = applyCatalogSearchEnvelope(view, envelope([]), false);
    expect(
      describeCatalogSearch({ availability: "available", view: empty, validQuery: true, inSnapshot: 0 }).detail,
    ).toMatch(/does not prove that an asset is absent/);
    expect(catalogSearchCoverageText(empty)).toMatch(/OneLake Catalog Search \(Preview\), 1 page .*snapshot evidence is unchanged/);
  });

  it("explains synchronizer-only and preview-data states", () => {
    expect(
      describeCatalogSearch({ availability: "not-authorized", view, validQuery: true, inSnapshot: 0 }).detail,
    ).toMatch(/Atlas application identity, not your account/);
    expect(
      describeCatalogSearch({ availability: "preview-data", view, validQuery: true, inSnapshot: 0 }).detail,
    ).toMatch(/Preview data never calls Fabric/);
  });

  it("names the permission failure without hiding kept entries", () => {
    const failed = applyCatalogSearchEnvelope(view, failedCatalogSearchEnvelope("permission-denied", "now"), false);
    expect(
      describeCatalogSearch({ availability: "available", view: failed, validQuery: true, inSnapshot: 0 }),
    ).toMatchObject({ title: "Catalog Search permission denied", tone: "warning" });
  });
});

describe("Catalog Search navigation", () => {
  const index = buildSearchIndex(SAMPLE_DATA);
  const lookup = catalogSnapshotLookup(index);
  const snapshotItem = SAMPLE_DATA.items[0];

  it("opens a synchronized item in Atlas by its stable ID", () => {
    const resolution = resolveCatalogEntry(
      entry(snapshotItem.fabricId.toLowerCase(), "Renamed in catalog"),
      lookup,
    );
    expect(resolution.kind).toBe("snapshot");
    if (resolution.kind !== "snapshot") return;
    expect(navigationForSearch(resolution.result)).toMatchObject({
      tab: "catalog",
      focus: expect.objectContaining({ itemId: snapshotItem.fabricId }),
    });
  });

  it("opens the synchronized workspace overview for a workspace entry", () => {
    const workspaceId = SAMPLE_DATA.workspace.fabricId.toLowerCase();
    const resolution = resolveCatalogEntry(
      entry(workspaceId, "Workspace", { key: `workspace:${workspaceId}`, catalogEntryType: "Workspace", type: "Workspace" }),
      lookup,
    );
    expect(resolution.kind === "snapshot" && navigationForSearch(resolution.result).tab).toBe("overview");
  });

  it("opens an entry outside the snapshot in its Fabric workspace", () => {
    expect(resolveCatalogEntry(entry(EXTERNAL, "Partner sales"), lookup, PORTAL)).toEqual({
      kind: "external",
      url: `${PORTAL}/groups/${WS}/list?experience=power-bi`,
    });
    expect(
      resolveCatalogEntry(entry(EXTERNAL, "No workspace", { workspaceId: undefined }), lookup, `${PORTAL}/`),
    ).toEqual({ kind: "external", url: PORTAL });
  });

  it("never changes local snapshot search when catalog results are absent", () => {
    const before = searchIndex(index, snapshotItem.displayName, { limit: 14 });
    applyCatalogSearchEnvelope(idleCatalogSearchView(snapshotItem.displayName), envelope([]), false);
    resolveCatalogEntry(entry(EXTERNAL, "Partner sales"), lookup);
    expect(searchIndex(index, snapshotItem.displayName, { limit: 14 })).toEqual(before);
    expect(index).toEqual(buildSearchIndex(SAMPLE_DATA));
  });

  it("labels known and future item types readably", () => {
    expect(catalogEntryTypeLabel("SemanticModel")).toBe("Semantic model");
    expect(catalogEntryTypeLabel("Workspace")).toBe("Workspace");
    expect(catalogEntryTypeLabel("MirroredAzureDatabricksCatalog")).toBe("Mirrored Azure Databricks catalog");
    expect(catalogEntryTypeLabel("Microsoft.WaaS.BusinessProcessSolutions")).toBe(
      "Business Process Solutions (Microsoft.WaaS)",
    );
  });
});
