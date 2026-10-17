import { afterEach, describe, expect, it, vi } from "vitest";

describe("Atlas feature flags", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("registers every gated Preview capability", async () => {
    const { ATLAS_FEATURE_FLAGS } = await import("./feature-flags");
    const { PREVIEW_API_REGISTRY } = await import("./preview-api");

    expect(Object.keys(ATLAS_FEATURE_FLAGS).sort()).toEqual(
      Object.keys(PREVIEW_API_REGISTRY).sort(),
    );
    expect(
      Object.values(ATLAS_FEATURE_FLAGS).every(
        (flag) =>
          flag.environmentVariable.startsWith("VITE_ATLAS_FEATURE_") &&
          typeof flag.enabled === "boolean",
      ),
    ).toBe(true);
  });

  it("enables only the deployed Functions foundation by default", async () => {
    const { ATLAS_FEATURE_FLAGS } = await import("./feature-flags");

    expect(ATLAS_FEATURE_FLAGS["fabric-app-functions"].enabled).toBe(true);
    expect(
      Object.values(ATLAS_FEATURE_FLAGS)
        .filter((flag) => flag.id !== "fabric-app-functions")
        .every((flag) => !flag.enabled),
    ).toBe(true);
  });

  it("accepts explicit environment overrides and rejects ambiguous values", async () => {
    vi.stubEnv("VITE_ATLAS_FEATURE_ITEM_RELATIONS", "yes");
    vi.stubEnv("VITE_ATLAS_FEATURE_FABRIC_APP_FUNCTIONS", "off");
    vi.stubEnv("VITE_ATLAS_FEATURE_CATALOG_SEARCH", "unexpected");

    const { ATLAS_FEATURE_FLAGS } = await import("./feature-flags");

    expect(ATLAS_FEATURE_FLAGS["item-relations"].enabled).toBe(true);
    expect(ATLAS_FEATURE_FLAGS["fabric-app-functions"].enabled).toBe(false);
    expect(ATLAS_FEATURE_FLAGS["catalog-search"].enabled).toBe(false);
  });
});
