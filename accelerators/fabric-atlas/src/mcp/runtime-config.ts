// Runtime switches for the local Atlas MCP server. The server stays disabled
// unless an operator opts in explicitly; identifiers are validated so a typo
// cannot fall back to a multi-tenant authority.

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AtlasMcpRuntimeConfig {
  /** Public client (no secret) registration with delegated Item.Execute.All. */
  clientId: string;
  /** Tenant that owns the Atlas Fabric app item. */
  tenantId: string;
}

export type AtlasMcpRuntimeSettings =
  | { enabled: true; config: AtlasMcpRuntimeConfig }
  | { enabled: false; reason: string };

export function readAtlasMcpRuntimeConfig(
  env: Readonly<Record<string, string | undefined>>,
  defaults: { tenantId?: string } = {},
): AtlasMcpRuntimeSettings {
  const enabled = env.ATLAS_MCP_ENABLED?.trim().toLowerCase();
  if (enabled !== "true" && enabled !== "1") {
    return {
      enabled: false,
      reason:
        "Atlas MCP is disabled. Set ATLAS_MCP_ENABLED=true only after the gates in docs/atlas-mcp.md are complete.",
    };
  }
  const clientId = env.ATLAS_MCP_CLIENT_ID?.trim() ?? "";
  if (!UUID.test(clientId)) {
    return {
      enabled: false,
      reason:
        "ATLAS_MCP_CLIENT_ID must be the application (client) ID of the Atlas MCP public client registration.",
    };
  }
  const tenantId =
    env.ATLAS_MCP_TENANT_ID?.trim() || defaults.tenantId?.trim() || "";
  if (!UUID.test(tenantId)) {
    return {
      enabled: false,
      reason:
        "ATLAS_MCP_TENANT_ID must be the ID of the tenant that owns the Atlas Fabric app item.",
    };
  }
  return {
    enabled: true,
    config: {
      clientId: clientId.toLowerCase(),
      tenantId: tenantId.toLowerCase(),
    },
  };
}
