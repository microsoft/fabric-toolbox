// Read-only Atlas MCP contract. Every tool returns deterministic evidence from
// a validated Atlas snapshot inside one shared envelope; nothing here mutates
// Fabric, Atlas data, permissions or deployments.

export const ATLAS_MCP_CONTRACT = "fabric-atlas-mcp" as const;
export const ATLAS_MCP_CONTRACT_VERSION = 1 as const;
export const ATLAS_MCP_SERVER_NAME = "fabric-atlas";

/** MCP protocol revisions this server negotiates, newest first. */
export const ATLAS_MCP_PROTOCOL_VERSIONS = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
] as const;

export type AtlasMcpProtocolVersion =
  (typeof ATLAS_MCP_PROTOCOL_VERSIONS)[number];

/** Revisions that define `structuredContent` and `outputSchema`. */
export const ATLAS_MCP_STRUCTURED_OUTPUT_VERSIONS: ReadonlySet<string> =
  new Set(["2025-11-25", "2025-06-18"]);

export const ATLAS_MCP_TOOL_NAMES = [
  "atlas_list_workspaces",
  "atlas_get_snapshot_provenance",
  "atlas_find_catalog_items",
  "atlas_get_known_impact",
  "atlas_explain_lineage_evidence",
  "atlas_get_access_evidence",
  "atlas_get_operational_incidents",
  "atlas_get_snapshot_changes",
] as const;

export type AtlasMcpToolName = (typeof ATLAS_MCP_TOOL_NAMES)[number];

export function isAtlasMcpToolName(value: unknown): value is AtlasMcpToolName {
  return (
    typeof value === "string" &&
    (ATLAS_MCP_TOOL_NAMES as readonly string[]).includes(value)
  );
}

export const ATLAS_MCP_LIMITS = {
  queryLength: 200,
  identifierLength: 100,
  textLength: 300,
  scopeWorkspaces: 50,
  allowedWorkspaceIdsInError: 20,
  catalogResults: { default: 10, max: 25 },
  catalogItemTypes: 10,
  impactDepth: { default: 3, max: 6 },
  impactItems: { default: 50, max: 100 },
  impactEdges: 200,
  relationships: { default: 25, max: 50 },
  evidencePerRelationship: 10,
  accessRows: { default: 25, max: 50 },
  grantPathsPerPrincipal: 20,
  incidents: { default: 10, max: 25 },
  impactPerIncident: 25,
  changes: { default: 25, max: 100 },
  syncRuns: 10,
  sections: 40,
  itemFamilies: 40,
  incidentChanges: 25,
  inboundMessageBytes: 64 * 1024,
  outboundMessageBytes: 512 * 1024,
} as const;

/** How a source contributes to a response. */
export type AtlasMcpSourceAuthority =
  | "authoritative"
  | "non-authoritative"
  | "derived"
  | "configuration"
  | "audit";

export interface AtlasMcpSource {
  id: string;
  label: string;
  authority: AtlasMcpSourceAuthority;
  entities?: string[];
  /** When the source was observed, never the MCP read time. */
  observedAt?: string;
  maturity?: "generally-available" | "preview" | "beta";
}

export type AtlasMcpCoverageStatus =
  | "complete"
  | "partial"
  | "unavailable"
  | "not-applicable";

export interface AtlasMcpCoverage {
  status: AtlasMcpCoverageStatus;
  returned: number;
  total: number;
  truncated: boolean;
  notes: string[];
}

export interface AtlasMcpSnapshotRef {
  snapshotId: string;
  syncedAt: string;
  deploymentId?: string;
  /** Snapshots are read only after manifest counts and writer checks pass. */
  validation: "manifest-verified";
}

export interface AtlasMcpWorkspaceRef {
  workspaceId: string;
  displayName: string;
}

export type AtlasMcpErrorCode =
  | "invalid-arguments"
  | "unauthenticated"
  | "authentication-pending"
  | "scope-unavailable"
  | "workspace-required"
  | "workspace-not-in-scope"
  | "snapshot-unavailable"
  | "item-not-found"
  | "history-unavailable"
  | "result-too-large"
  | "internal-error";

export interface AtlasMcpErrorDetail {
  code: AtlasMcpErrorCode;
  message: string;
  retryable: boolean;
  allowedWorkspaceIds?: string[];
}

export interface AtlasMcpEnvelope<T = unknown> {
  contract: typeof ATLAS_MCP_CONTRACT;
  contractVersion: typeof ATLAS_MCP_CONTRACT_VERSION;
  tool: AtlasMcpToolName;
  readOnly: true;
  workspace: AtlasMcpWorkspaceRef | null;
  snapshot: AtlasMcpSnapshotRef | null;
  /** When this server produced the response. */
  retrievedAt: string;
  sources: AtlasMcpSource[];
  coverage: AtlasMcpCoverage;
  limitations: string[];
  result: T | null;
  error?: AtlasMcpErrorDetail;
}

const RETRYABLE_CODES = new Set<AtlasMcpErrorCode>([
  "authentication-pending",
  "scope-unavailable",
  "snapshot-unavailable",
  "history-unavailable",
]);

/** An explicit, caller-safe failure. Messages never carry tokens or raw payloads. */
export class AtlasMcpError extends Error {
  readonly code: AtlasMcpErrorCode;
  readonly retryable: boolean;
  readonly allowedWorkspaceIds?: string[];

  constructor(
    code: AtlasMcpErrorCode,
    message: string,
    options: { retryable?: boolean; allowedWorkspaceIds?: string[] } = {},
  ) {
    super(message);
    this.name = "AtlasMcpError";
    this.code = code;
    this.retryable = options.retryable ?? RETRYABLE_CODES.has(code);
    this.allowedWorkspaceIds = options.allowedWorkspaceIds;
  }
}

/** Limitations attached to every response, before tool-specific ones. */
export const ATLAS_MCP_BASE_LIMITATIONS: readonly string[] = [
  "Evidence comes from the last validated Atlas snapshot, not live Fabric state.",
  "Read-only: Atlas MCP never changes Fabric, Atlas data, permissions or deployments and offers no remediation.",
  "Metadata only: no business rows, prompts, queries, credentials or personal review state.",
];

export function truncateText(
  value: string | undefined,
  max: number = ATLAS_MCP_LIMITS.textLength,
): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
