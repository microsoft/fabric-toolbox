import { ATLAS_CONFIG } from "@/atlas/config";
import { isFeatureEnabled } from "@/atlas/feature-flags";
import { withSnapshotCache } from "@/atlas/mcp/data-source";
import { createAtlasMcpServer } from "@/atlas/mcp/server";
import { APP_VERSION } from "@/atlas/release";
import { getRayfinClient } from "@/lib/rayfin-client";
import { createAppAudienceSession } from "./app-audience-session";
import { createDeviceCodeTokenProvider } from "./device-code-token";
import { createRayfinAtlasMcpDataSource } from "./rayfin-data-source";
import { rayfinSessionPort } from "./rayfin-session-port";
import { readAtlasMcpRuntimeConfig } from "./runtime-config";
import { serveStdio } from "./stdio";

// Local stdio entry point for the read-only Atlas MCP server.
// Build with `npm run build:mcp`; see docs/atlas-mcp.md for the gates.

function log(message: string): void {
  process.stderr.write(`${message}\n`);
}

// stdout carries MCP frames only, so console output from shared modules goes to stderr.
function routeConsoleToStderr(): void {
  const toStderr = (...values: unknown[]) => console.error(...values);
  console.log = toStderr;
  console.info = toStderr;
  console.debug = toStderr;
}

async function main(): Promise<number> {
  routeConsoleToStderr();
  const settings = readAtlasMcpRuntimeConfig(process.env, {
    tenantId: ATLAS_CONFIG.tenantId,
  });
  if (!settings.enabled) {
    log(`[atlas-mcp] ${settings.reason}`);
    return 78;
  }
  const client = getRayfinClient();
  const session = createAppAudienceSession({
    tokenProvider: createDeviceCodeTokenProvider({ ...settings.config, log }),
    port: rayfinSessionPort(client.auth),
    log,
  });
  session.start();
  const server = createAtlasMcpServer({
    source: withSnapshotCache(createRayfinAtlasMcpDataSource(session)),
    version: APP_VERSION,
    itemRelationsEnabled: isFeatureEnabled("item-relations"),
    policyEvidenceEnabled: isFeatureEnabled("fabric-policies"),
    log,
  });
  log(`[atlas-mcp] Fabric Atlas MCP ${APP_VERSION} is listening on stdio (read-only).`);
  await serveStdio(server, { input: process.stdin, output: process.stdout, log });
  client.auth.destroy();
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    log(
      `[atlas-mcp] stopped: ${error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : "unknown error"}`,
    );
    process.exit(1);
  },
);
