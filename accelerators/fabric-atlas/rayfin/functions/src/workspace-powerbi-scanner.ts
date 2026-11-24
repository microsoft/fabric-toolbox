import type { RayfinContext } from "@microsoft/fabric-user-data-functions";
import type { AtlasSchema } from "../../data/schema.js";
import { PowerBiProjectionError } from "./powerbi-projections.js";
import {
  emptyScannerEnvelope, projectPowerBiScanner, unsupportedScanner,
  type ScannerCode, type ScannerExpectedItemsInput, type ScannerRequest, type ScannerStageEnvelope,
} from "./powerbi-scanner-projection.js";
import { PowerBiScannerRest, ScannerTransportError, type ScannerCredentials, type ScannerDependencies } from "./powerbi-scanner-rest.js";
import { requireAtlasSynchronizer } from "./synchronizer-gate.js";
import { strictUuid } from "./sync/protocol.js";

const INPUT_ERROR = "Use protocolVersion 1, strict tenant/workspace UUIDs, up to 2000 unique public Power BI {id, type} expected items and a strict correlation UUID or null.";
const AUTH_ERROR = "Power BI scanner collection requires the configured Atlas administrator.";
const TYPES = new Set(["SemanticModel", "Report", "Dashboard", "Dataflow", "Datamart"]);

export function validateScannerInput(
  protocolVersion: unknown, tenantId: unknown, workspaceId: unknown, expectedItems: unknown, correlationId: unknown,
): ScannerRequest {
  try {
    if (protocolVersion !== 1 || !Array.isArray(expectedItems) || expectedItems.length > 2_000) throw new Error();
    const seen = new Set<string>();
    const items = expectedItems.map((value: unknown) => {
      if (!value || typeof value !== "object" || Array.isArray(value) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error();
      const item = value as Record<string, unknown>;
      if (Object.keys(item).sort().join(",") !== "id,type" || typeof item.type !== "string" || !TYPES.has(item.type)) throw new Error();
      const id = strictUuid(item.id);
      if (seen.has(id)) throw new Error();
      seen.add(id);
      return { id, type: item.type as ScannerExpectedItemsInput[number]["type"] };
    });
    return {
      tenantId: strictUuid(tenantId), workspaceId: strictUuid(workspaceId), expectedItems: items,
      correlationId: correlationId == null ? null : strictUuid(correlationId),
    };
  } catch { throw new Error(INPUT_ERROR); }
}

type ApprovedConfiguration = { credentials: ScannerCredentials; workspaceIds: string[] };
type ConfigurationResult = { configuration: ApprovedConfiguration } | { code: ScannerCode };

/** Reads only declared Secret Store properties, never caller-supplied credentials, environment or token inputs. */
export function scannerConfiguration(ctx: Pick<RayfinContext<AtlasSchema>, "Secrets">): ConfigurationResult {
  let enabled: string;
  try { enabled = ctx.Secrets.ATLAS_POWERBI_SCANNER_ENABLED; } catch { return { code: "adapter-disabled" }; }
  if (enabled === "false" || enabled === "") return { code: "adapter-disabled" };
  if (enabled !== "true") return { code: "scanner-configuration-required" };
  try {
    if (ctx.Secrets.ATLAS_POWERBI_SCANNER_SETTINGS_CONFIRMED !== "true") return { code: "tenant-settings-unconfirmed" };
  } catch { return { code: "tenant-settings-unconfirmed" }; }
  try {
    const tenantId = strictUuid(ctx.Secrets.ATLAS_POWERBI_SCANNER_TENANT_ID);
    const clientId = strictUuid(ctx.Secrets.ATLAS_POWERBI_SCANNER_CLIENT_ID);
    const clientSecret = ctx.Secrets.ATLAS_POWERBI_SCANNER_CLIENT_SECRET;
    const rawWorkspaces = ctx.Secrets.ATLAS_POWERBI_SCANNER_WORKSPACE_IDS;
    if (typeof clientSecret !== "string" || !clientSecret.trim() || clientSecret.length > 4_096 ||
      [...clientSecret].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
      typeof rawWorkspaces !== "string" || rawWorkspaces.length > 8_192) throw new Error();
    const values: unknown = JSON.parse(rawWorkspaces);
    if (!Array.isArray(values) || !values.length || values.length > 100) throw new Error();
    const workspaceIds = values.map(strictUuid);
    if (new Set(workspaceIds).size !== workspaceIds.length) throw new Error();
    return { configuration: { credentials: { tenantId, clientId, clientSecret }, workspaceIds } };
  } catch { return { code: "scanner-configuration-required" }; }
}

export async function workspaceCollectPowerBiScanner(
  ctx: RayfinContext<AtlasSchema>,
  protocolVersion: unknown, tenantId: unknown, workspaceId: unknown, expectedItems: unknown, correlationId: unknown,
  dependencies: ScannerDependencies = {},
): Promise<ScannerStageEnvelope> {
  const request = validateScannerInput(protocolVersion, tenantId, workspaceId, expectedItems, correlationId);
  await requireAtlasSynchronizer(ctx.getDataClient(), "Power BI scanner collection", AUTH_ERROR);
  const configuration = scannerConfiguration(ctx);
  if ("code" in configuration) return emptyScannerEnvelope(request, unsupportedScanner(configuration.code));
  const approved = configuration.configuration;
  if (approved.credentials.tenantId !== request.tenantId || !approved.workspaceIds.includes(request.workspaceId)) {
    return emptyScannerEnvelope(request, unsupportedScanner("scanner-scope-not-approved"));
  }
  const rest = new PowerBiScannerRest(approved.credentials, dependencies);
  try {
    await rest.authenticate();
    const response = await rest.scan(request.workspaceId);
    const envelope = projectPowerBiScanner(response, request, rest.limits);
    rest.assertSafeOutput(envelope);
    return envelope;
  } catch (error) {
    const code = error instanceof ScannerTransportError || error instanceof PowerBiProjectionError
      ? error.code : "invalid-response";
    const unsupported: ScannerCode[] = ["tenant-admin-settings-required", "oauth-credentials-rejected"];
    return emptyScannerEnvelope(request, {
      status: unsupported.includes(code) ? "unsupported" : "failed", code,
    });
  }
}
