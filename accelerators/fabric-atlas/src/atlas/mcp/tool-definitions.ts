import {
  ATLAS_MCP_CONTRACT,
  ATLAS_MCP_CONTRACT_VERSION,
  ATLAS_MCP_LIMITS,
  type AtlasMcpToolName,
} from "./contract";
import {
  CATALOG_LOOKUP_KINDS,
  CHANGE_DOMAINS,
  IMPACT_DIRECTIONS,
} from "./arguments";

export type JsonSchema = Record<string, unknown>;

/** MCP `Tool` definition. Every Atlas tool is read-only and closed-world. */
export interface AtlasMcpToolDefinition {
  name: AtlasMcpToolName;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  annotations: {
    title: string;
    readOnlyHint: true;
    destructiveHint: false;
    idempotentHint: true;
    openWorldHint: false;
  };
}

const WORKSPACE_ID: JsonSchema = {
  type: "string",
  description:
    "Fabric workspace UUID from atlas_list_workspaces. Optional when exactly one workspace is selected.",
  pattern:
    "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
};

const ITEM_ID: JsonSchema = {
  type: "string",
  description: "Fabric item ID as returned by atlas_find_catalog_items.",
  minLength: 1,
  maxLength: ATLAS_MCP_LIMITS.identifierLength,
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$",
};

function limit(range: { default: number; max: number }): JsonSchema {
  return {
    type: "integer",
    minimum: 1,
    maximum: range.max,
    default: range.default,
  };
}

function input(
  properties: Record<string, JsonSchema>,
  required: string[] = [],
): JsonSchema {
  return {
    type: "object",
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: false,
  };
}

/** Shared result envelope; `result` is tool specific and `error` marks failures. */
export const ATLAS_MCP_OUTPUT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    contract: { const: ATLAS_MCP_CONTRACT },
    contractVersion: { const: ATLAS_MCP_CONTRACT_VERSION },
    tool: { type: "string" },
    readOnly: { const: true },
    workspace: {
      type: ["object", "null"],
      properties: {
        workspaceId: { type: "string" },
        displayName: { type: "string" },
      },
    },
    snapshot: {
      type: ["object", "null"],
      properties: {
        snapshotId: { type: "string" },
        syncedAt: { type: "string" },
        deploymentId: { type: "string" },
        validation: { const: "manifest-verified" },
      },
    },
    retrievedAt: { type: "string" },
    sources: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          authority: {
            enum: [
              "authoritative",
              "non-authoritative",
              "derived",
              "configuration",
              "audit",
            ],
          },
          entities: { type: "array", items: { type: "string" } },
          observedAt: { type: "string" },
          maturity: { enum: ["generally-available", "preview", "beta"] },
        },
        required: ["id", "label", "authority"],
      },
    },
    coverage: {
      type: "object",
      properties: {
        status: {
          enum: ["complete", "partial", "unavailable", "not-applicable"],
        },
        returned: { type: "integer" },
        total: { type: "integer" },
        truncated: { type: "boolean" },
        notes: { type: "array", items: { type: "string" } },
      },
      required: ["status", "returned", "total", "truncated", "notes"],
    },
    limitations: { type: "array", items: { type: "string" } },
    result: { type: ["object", "null"] },
    error: {
      type: "object",
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        retryable: { type: "boolean" },
        allowedWorkspaceIds: { type: "array", items: { type: "string" } },
      },
      required: ["code", "message", "retryable"],
    },
  },
  required: [
    "contract",
    "contractVersion",
    "tool",
    "readOnly",
    "workspace",
    "snapshot",
    "retrievedAt",
    "sources",
    "coverage",
    "limitations",
    "result",
  ],
};

function tool(
  name: AtlasMcpToolName,
  title: string,
  description: string,
  inputSchema: JsonSchema,
): AtlasMcpToolDefinition {
  return {
    name,
    title,
    description,
    inputSchema,
    outputSchema: ATLAS_MCP_OUTPUT_SCHEMA,
    annotations: {
      title,
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  };
}

export const ATLAS_MCP_TOOLS: readonly AtlasMcpToolDefinition[] = [
  tool(
    "atlas_list_workspaces",
    "List Atlas workspace scope",
    "Lists the administrator-selected workspaces that Atlas MCP may read. Use a returned workspaceId with the other tools. Read-only.",
    input({}),
  ),
  tool(
    "atlas_get_snapshot_provenance",
    "Get snapshot provenance",
    "Returns the validated Atlas snapshot used for a workspace: snapshot ID, sync time, collector section status, catalog counts, per item-family coverage and recent synchronization audit records. Read-only.",
    input({ workspaceId: WORKSPACE_ID }),
  ),
  tool(
    "atlas_find_catalog_items",
    "Find catalog items",
    "Deterministic lookup of items, tables, views, columns and measures (including ontology and data agent definition metadata) in the validated Atlas snapshot. Returns identifiers and metadata coverage, not definitions, expressions or data. An empty result does not prove absence. Read-only.",
    input(
      {
        workspaceId: WORKSPACE_ID,
        query: {
          type: "string",
          description: "Name, identifier or metadata text to match.",
          minLength: 1,
          maxLength: ATLAS_MCP_LIMITS.queryLength,
        },
        kinds: {
          type: "array",
          items: { enum: [...CATALOG_LOOKUP_KINDS] },
          uniqueItems: true,
          maxItems: CATALOG_LOOKUP_KINDS.length,
        },
        itemTypes: {
          type: "array",
          items: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9]{0,59}$" },
          uniqueItems: true,
          maxItems: ATLAS_MCP_LIMITS.catalogItemTypes,
          description: "Fabric item types such as SemanticModel or Lakehouse.",
        },
        limit: limit(ATLAS_MCP_LIMITS.catalogResults),
      },
      ["query"],
    ),
  ),
  tool(
    "atlas_get_known_impact",
    "Get known lineage impact",
    "Returns upstream sources and downstream consumers reachable through authoritative Atlas snapshot lineage for one item, with hop distance and the edges used. Known impact is item-level and derived from collected lineage, not runtime observation. Read-only.",
    input(
      {
        workspaceId: WORKSPACE_ID,
        itemId: ITEM_ID,
        direction: { enum: [...IMPACT_DIRECTIONS], default: "both" },
        maxDepth: limit(ATLAS_MCP_LIMITS.impactDepth),
        limit: limit(ATLAS_MCP_LIMITS.impactItems),
      },
      ["itemId"],
    ),
  ),
  tool(
    "atlas_explain_lineage_evidence",
    "Explain lineage evidence",
    "Explains each relationship touching one item by source: authoritative Atlas snapshot lineage and, when enabled, persisted Item Relations API (Beta) evidence, with agreement status and collection coverage. Beta evidence never becomes authoritative. Read-only.",
    input(
      {
        workspaceId: WORKSPACE_ID,
        itemId: ITEM_ID,
        limit: limit(ATLAS_MCP_LIMITS.relationships),
      },
      ["itemId"],
    ),
  ),
  tool(
    "atlas_get_access_evidence",
    "Get access evidence coverage",
    "Returns recorded workspace and item grants with their sources and the evidence coverage of each access layer, plus stored workspace policy context when enabled. Recorded grants are not evaluated data access: group membership, OneLake security, Purview DLP and Fabric Policies stay unknown unless collected. Read-only; no permission changes.",
    input({
      workspaceId: WORKSPACE_ID,
      itemId: ITEM_ID,
      limit: limit(ATLAS_MCP_LIMITS.accessRows),
    }),
  ),
  tool(
    "atlas_get_operational_incidents",
    "Get operational incidents",
    "Returns observed incidents (latest failed runs from synchronized Fabric job history, with stored incident records when deployed), downstream impact through snapshot lineage, changes since the previous validated snapshot and which monitoring sources Atlas collects. Impact is inferred unless the consumer has its own observed failure. Read-only.",
    input({
      workspaceId: WORKSPACE_ID,
      includeImpact: { type: "boolean", default: true },
      includeHistory: { type: "boolean", default: true },
      limit: limit(ATLAS_MCP_LIMITS.incidents),
    }),
  ),
  tool(
    "atlas_get_snapshot_changes",
    "Get snapshot changes",
    "Compares the two most recent validated Atlas snapshots and returns item, schema, access, sensitivity, lineage and job changes with the fields that changed. Read-only.",
    input({
      workspaceId: WORKSPACE_ID,
      domains: {
        type: "array",
        items: { enum: [...CHANGE_DOMAINS] },
        uniqueItems: true,
        maxItems: CHANGE_DOMAINS.length,
      },
      limit: limit(ATLAS_MCP_LIMITS.changes),
    }),
  ),
];
