import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  createPingResult,
  FUNCTIONS_CONTRACT_VERSION,
  type PingResult,
} from "../../rayfin/functions/src/ping";
import type { AppFunctionsSchema } from "../../rayfin/functions/src/types";
import type { WorkspaceDiscoveryResult } from "../../rayfin/functions/src/workspace-discovery";
import type { AtlasRayfinClient } from "./rayfin-client";

const mocks = vi.hoisted(() => ({
  config: undefined as Record<string, unknown> | undefined,
}));

vi.mock("@microsoft/rayfin-client", () => ({
  RayfinClient: class {
    constructor(config: Record<string, unknown>) {
      mocks.config = config;
    }
  },
}));

describe("Rayfin client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_RAYFIN_API_URL", "https://example.test/api");
    vi.stubEnv("VITE_RAYFIN_PUBLISHABLE_KEY", "pk-test");
    vi.stubEnv("VITE_RAYFIN_FUNCTIONS_URL", undefined);
    mocks.config = undefined;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("bounds stalled Fabric GraphQL requests for responsive cancellation", async () => {
    const { getRayfinClient } = await import("./rayfin-client");

    getRayfinClient();

    expect(mocks.config).toMatchObject({ timeout: 30_000 });
  });

  it("keeps the data API, session auth storage and publishable key configuration", async () => {
    const { getRayfinClient } = await import("./rayfin-client");

    getRayfinClient();

    expect(mocks.config).toMatchObject({
      baseUrl: "https://example.test/api",
      publishableKey: "pk-test",
      authStorage: window.sessionStorage,
      useProxy: false,
    });
  });

  it("still requires the API URL and publishable key", async () => {
    vi.stubEnv("VITE_RAYFIN_PUBLISHABLE_KEY", "");
    const { getRayfinClient } = await import("./rayfin-client");

    expect(() => getRayfinClient()).toThrow("Missing required env vars");
    expect(mocks.config).toBeUndefined();
  });

  it("uses the deployed Functions route when no local host is configured", async () => {
    const { getRayfinClient } = await import("./rayfin-client");

    getRayfinClient();

    expect(mocks.config).toHaveProperty("functionsBaseUrl", undefined);
  });

  it("uses the local Functions host during Vite development", async () => {
    vi.stubEnv("VITE_RAYFIN_FUNCTIONS_URL", " http://localhost:7071 ");
    const { getRayfinClient } = await import("./rayfin-client");

    getRayfinClient();

    expect(mocks.config).toMatchObject({ functionsBaseUrl: "http://localhost:7071" });
  });

  it("ignores the local Functions host in production builds", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_RAYFIN_FUNCTIONS_URL", "http://localhost:7071");
    const { getRayfinClient } = await import("./rayfin-client");

    getRayfinClient();

    expect(mocks.config).toHaveProperty("functionsBaseUrl", undefined);
  });

  it.each(["localhost:7071", "ftp://localhost:7071", "http://functions.example.test"])(
    "rejects the unsafe local Functions host %s",
    async (functionsUrl) => {
      vi.stubEnv("VITE_RAYFIN_FUNCTIONS_URL", functionsUrl);
      const { getRayfinClient } = await import("./rayfin-client");

      expect(() => getRayfinClient()).toThrow("Invalid VITE_RAYFIN_FUNCTIONS_URL");
      expect(mocks.config).toBeUndefined();
    },
  );
});

describe("Rayfin Functions contract", () => {
  it("returns a fixed, JSON-safe ping payload", () => {
    const result = createPingResult();

    expect(result).toStrictEqual({
      status: "ok",
      service: "fabric-atlas",
      contractVersion: FUNCTIONS_CONTRACT_VERSION,
    });
    expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
  });

  it("types ping as a no-input client call returning the ping payload", () => {
    type Functions = AtlasRayfinClient["functions"];

    expectTypeOf<keyof AppFunctionsSchema>().toEqualTypeOf<
      | "ping"
      | "workspaceDiscover"
      | "workspaceCollectCore"
      | "workspaceCollectDefinitions"
      | "workspaceCollectItemRelations"
      | "workspaceCollectKqlMetadata"
      | "workspaceCollectPowerBi"
      | "workspaceCollectSqlMetadata"
      | "workspaceCollectAccessPolicyEvidence"
      | "searchCatalogPreview"
      | "workspaceCollectPowerBiScanner"
      | "workspaceCollectSourceProvenance"
      | "syncStart"
      | "syncContinue"
      | "syncStatus"
      | "syncCancel"
      | "syncGraphStart"
      | "syncGraphContinue"
      | "syncGraphStatus"
      | "syncGraphCancel"
    >();
    expectTypeOf<AppFunctionsSchema["ping"]["input"]>().toEqualTypeOf<Record<string, never>>();
    expectTypeOf<AppFunctionsSchema["ping"]["output"]>().toEqualTypeOf<PingResult>();
    expectTypeOf<AppFunctionsSchema["workspaceDiscover"]["input"]>()
      .toEqualTypeOf<Record<string, never>>();
    expectTypeOf<AppFunctionsSchema["workspaceDiscover"]["output"]>()
      .toEqualTypeOf<WorkspaceDiscoveryResult>();
    expectTypeOf<keyof Functions>().toEqualTypeOf<keyof AppFunctionsSchema>();
    expectTypeOf<Functions["ping"]["invoke"]>().toBeCallableWith();
    expectTypeOf<Functions["ping"]["invoke"]>().returns.toEqualTypeOf<Promise<PingResult>>();
    expectTypeOf<Functions["workspaceDiscover"]["invoke"]>().toBeCallableWith();
  });
});
