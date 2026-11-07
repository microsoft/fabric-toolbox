// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CATALOG_SEARCH_FILTER_TYPES } from "../../rayfin/functions/src/catalog-search";
import {
  MIRRORING_ITEM_TYPES,
  MLV_ITEM_TYPES,
  SHORTCUT_ITEM_TYPES,
} from "../../rayfin/functions/src/workspace-source-provenance";
import { ATLAS_FEATURE_FLAGS } from "./feature-flags";
import {
  COVERAGE_DIMENSIONS,
  FABRIC_DOCUMENTED_ITEM_TYPES,
  ITEM_FAMILY_ADAPTERS,
  MLV_REFRESH_JOB_TYPE,
  derivedItemFamilies,
  documentedItemFamilies,
  inventoryGapList,
  itemFamilyCapability,
  itemFamilyLabel,
  observedItemFamilies,
} from "./item-families";
import { ITEM_TYPES, SAMPLE_DATA, type Item, type Job } from "./model";
import { PREVIEW_API_REGISTRY } from "./preview-api";

function item(fabricId: string, itemType: string): Item {
  return {
    fabricId,
    displayName: fabricId,
    itemType: itemType as Item["itemType"],
    health: "unknown",
    endorsement: "none",
    tags: [],
  };
}

function job(itemFabricId: string, jobType: string): Job {
  return {
    itemFabricId,
    itemName: itemFabricId,
    jobType,
    status: "completed",
    startedAt: "2026-10-02T10:00:00.000Z",
    durationSec: 30,
  } as Job;
}

describe("item family capability registry", () => {
  it("registers every documented Fabric item type, matching the Catalog Search allowlist", () => {
    expect([...FABRIC_DOCUMENTED_ITEM_TYPES].sort()).toEqual(
      CATALOG_SEARCH_FILTER_TYPES.filter((type) => type !== "Workspace").sort(),
    );
    const registered = new Set(documentedItemFamilies().map((family) => family.key));
    for (const type of FABRIC_DOCUMENTED_ITEM_TYPES) {
      expect(registered.has(type), type).toBe(true);
      expect(itemFamilyCapability(type)).toMatchObject({ kind: "fabric-item", documentedItemType: true });
    }
    for (const type of Object.keys(ITEM_TYPES)) expect(registered.has(type), type).toBe(true);
  });

  it("states all five coverage dimensions independently with an explanation", () => {
    for (const family of [...documentedItemFamilies(), ...derivedItemFamilies()]) {
      expect(Object.keys(family.coverage).sort()).toEqual([...COVERAGE_DIMENSIONS].sort());
      for (const dimension of COVERAGE_DIMENSIONS) {
        expect(family.coverage[dimension].detail.trim().length, `${family.key}.${dimension}`).toBeGreaterThan(10);
      }
      if (family.definitionUrl) {
        expect(family.definitionUrl).toMatch(/^https:\/\/learn\.microsoft\.com\/en-us\/rest\/api\/fabric\/articles\/item-management\/definitions\//);
      }
    }
  });

  it("tracks published adapters and their collected coverage", () => {
    for (const family of [...documentedItemFamilies(), ...derivedItemFamilies()]) {
      const adapterDimensions = COVERAGE_DIMENSIONS.filter(
        (dimension) => family.coverage[dimension].state === "adapter-only",
      );
      if (adapterDimensions.length) expect(family.adapters.length, family.key).toBeGreaterThan(0);
    }
    expect(ITEM_FAMILY_ADAPTERS["sql-metadata"].published).toBe(true);
    expect(ITEM_FAMILY_ADAPTERS["source-provenance"].published).toBe(true);
    expect(itemFamilyCapability("MirroredDatabase").coverage.objects.state).toBe("collected");
  });

  it("matches adapters to the item types the provenance stage actually reads", () => {
    const withAdapter = documentedItemFamilies()
      .filter((family) => family.adapters.includes("source-provenance"))
      .map((family) => family.key)
      .sort();
    expect(withAdapter).toEqual(
      [...new Set([...SHORTCUT_ITEM_TYPES, ...MIRRORING_ITEM_TYPES, ...MLV_ITEM_TYPES])].sort(),
    );
  });

  it("distinguishes Materialized Lake Views from KQL materialized views", () => {
    const mlv = itemFamilyCapability("MaterializedLakeView");
    const kqlView = itemFamilyCapability("KQLMaterializedView");
    expect(mlv).toMatchObject({ kind: "derived", documentedItemType: false, parentTypes: ["Lakehouse"], maturity: "ga" });
    expect(kqlView).toMatchObject({ kind: "derived", documentedItemType: false, parentTypes: ["KQLDatabase"] });
    expect(mlv.coverage.catalog.state).toBe("not-applicable");
    expect(mlv.coverage.lineage.detail).toMatch(/Not treated as directed lineage/);
    expect(kqlView.coverage.objects.state).toBe("collected");
    expect(FABRIC_DOCUMENTED_ITEM_TYPES).not.toContain("MaterializedLakeView" as never);
  });

  it("preserves unknown and Workload Hub item types with an explicit fallback", () => {
    expect(itemFamilyCapability("Microsoft.WaaS.BusinessProcessSolutions")).toMatchObject({
      kind: "workload-item",
      label: "Business Process Solutions (Microsoft.WaaS)",
      coverage: { catalog: { state: "collected" }, objects: { state: "unsupported" } },
    });
    expect(itemFamilyCapability("FutureFabricThing")).toMatchObject({
      kind: "unknown-item",
      label: "Future Fabric Thing",
      coverage: { objects: { state: "unsupported" } },
    });
    expect(itemFamilyCapability(undefined).label).toBe("Item");
    expect(itemFamilyLabel("Reflex")).toBe("Activator");
  });

  it("defers Event Schema Sets because the documented contract is user-identity only", () => {
    const family = itemFamilyCapability("EventSchemaSet");
    expect(family).toMatchObject({ maturity: "preview", coverage: { objects: { state: "deferred" } } });
    expect(family.coverage.objects.detail).toMatch(/user identity only/);
    expect(family.followUp).toMatch(/delegated-user/i);
  });

  it("keeps Fabric Apps at top-level identity until dependent items are exposed", () => {
    expect(itemFamilyCapability("AppBackend").coverage.objects).toMatchObject({ state: "unsupported" });
    expect(itemFamilyCapability("OrgApp").coverage.objects.detail).toMatch(/only when a documented contract exposes them/);
  });
});

describe("observed families and inventory gap list", () => {
  it("adds MLV awareness only from refresh jobs on a Lakehouse", () => {
    const data = {
      items: [item("lh-1", "Lakehouse"), item("lh-2", "Lakehouse"), item("nb-1", "Notebook"), item("wk-1", "Org.Asmdb.SyncHub")],
      jobs: [job("lh-1", MLV_REFRESH_JOB_TYPE), job("lh-1", MLV_REFRESH_JOB_TYPE), job("nb-1", MLV_REFRESH_JOB_TYPE)],
    };
    const observed = observedItemFamilies(data);
    expect(observed.map((entry) => [entry.capability.key, entry.itemCount])).toEqual([
      ["Lakehouse", 2],
      ["Notebook", 1],
      ["Org.Asmdb.SyncHub", 1],
      ["MaterializedLakeView", 0],
    ]);
    expect(observed.at(-1)?.evidence).toBe("2 refresh jobs on 1 Lakehouse");
    expect(observedItemFamilies({ items: data.items, jobs: [] }).some((entry) => entry.capability.key === "MaterializedLakeView")).toBe(false);
  });

  it("lists API-backed gaps with observed families first and follow-ups attached", () => {
    const observed = observedItemFamilies({
      items: [item("mirror", "MirroredDatabase"), item("wk", "Microsoft.WaaS.BusinessProcessSolutions")],
      jobs: [],
    });
    const gaps = inventoryGapList(observed);
    expect(gaps[0].key).toBe("Microsoft.WaaS.BusinessProcessSolutions");
    expect(gaps.some((gap) => gap.key === "MirroredDatabase")).toBe(false);
    const eventSchemaSet = gaps.find((gap) => gap.key === "EventSchemaSet")!;
    expect(eventSchemaSet).toMatchObject({ observedItems: 0, definitionUrl: expect.stringContaining("eventschemaset-definition") });
    expect(gaps.every((gap) => gap.gaps.every((entry) => ["unsupported", "deferred", "adapter-only"].includes(entry.state)))).toBe(true);
    expect(gaps.some((gap) => gap.key === "SemanticModel")).toBe(false);
  });

  it("covers every family in the preview snapshot without throwing", () => {
    for (const entry of observedItemFamilies(SAMPLE_DATA)) {
      expect(entry.capability.coverage.catalog.state).not.toBe("unsupported");
    }
  });

  it("keeps IQ Sharing gated: no family, adapter or default-on flag", () => {
    expect(PREVIEW_API_REGISTRY["iq-sharing"].maturity).toBe("unconfirmed");
    expect(ATLAS_FEATURE_FLAGS["iq-sharing"].defaultEnabled).toBe(false);
    expect(documentedItemFamilies().some((family) => /iq.?sharing/i.test(family.key))).toBe(false);
  });
});
