import { describe, expect, it } from "vitest";
import { readAtlasMcpRuntimeConfig } from "./runtime-config";

const CLIENT = "6A1B2C3D-4E5F-4A6B-8C7D-8E9F0A1B2C3D";
const TENANT = "0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e";

describe("Atlas MCP runtime configuration", () => {
  it("stays disabled unless explicitly enabled", () => {
    for (const value of [undefined, "", "false", "yes", "TRUE "]) {
      const settings = readAtlasMcpRuntimeConfig({
        ATLAS_MCP_ENABLED: value,
        ATLAS_MCP_CLIENT_ID: CLIENT,
        ATLAS_MCP_TENANT_ID: TENANT,
      });
      if (value === "TRUE ") {
        expect(settings.enabled).toBe(true);
      } else {
        expect(settings).toEqual({
          enabled: false,
          reason: expect.stringContaining("Atlas MCP is disabled"),
        });
      }
    }
  });

  it("requires a public client ID and a specific tenant", () => {
    expect(
      readAtlasMcpRuntimeConfig({ ATLAS_MCP_ENABLED: "true", ATLAS_MCP_CLIENT_ID: "atlas" }),
    ).toMatchObject({ enabled: false, reason: expect.stringContaining("ATLAS_MCP_CLIENT_ID") });
    expect(
      readAtlasMcpRuntimeConfig({
        ATLAS_MCP_ENABLED: "true",
        ATLAS_MCP_CLIENT_ID: CLIENT,
        ATLAS_MCP_TENANT_ID: "organizations",
      }),
    ).toMatchObject({ enabled: false, reason: expect.stringContaining("ATLAS_MCP_TENANT_ID") });
  });

  it("normalizes identifiers and falls back to the deployment tenant", () => {
    expect(
      readAtlasMcpRuntimeConfig(
        { ATLAS_MCP_ENABLED: "1", ATLAS_MCP_CLIENT_ID: ` ${CLIENT} ` },
        { tenantId: TENANT.toUpperCase() },
      ),
    ).toEqual({
      enabled: true,
      config: { clientId: CLIENT.toLowerCase(), tenantId: TENANT },
    });
  });
});
