import type { AtlasChangeDomain } from "../history";
import {
  ATLAS_MCP_LIMITS,
  AtlasMcpError,
  type AtlasMcpToolName,
} from "./contract";

// Strict, bounded tool arguments. Unknown properties are rejected so a client
// cannot smuggle options that look like writes, filters or remediation flags.

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ITEM_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const ITEM_TYPE = /^[A-Za-z][A-Za-z0-9]{0,59}$/;

export const CATALOG_LOOKUP_KINDS = [
  "item",
  "table",
  "view",
  "column",
  "measure",
] as const;
export type CatalogLookupKind = (typeof CATALOG_LOOKUP_KINDS)[number];

export const IMPACT_DIRECTIONS = ["upstream", "downstream", "both"] as const;
export type ImpactDirection = (typeof IMPACT_DIRECTIONS)[number];

export const CHANGE_DOMAINS = [
  "item",
  "schema",
  "access",
  "sensitivity",
  "lineage",
  "job",
] as const satisfies readonly AtlasChangeDomain[];

export interface WorkspaceArguments {
  workspaceId?: string;
}

export interface AtlasMcpToolArguments {
  atlas_list_workspaces: Record<string, never>;
  atlas_get_snapshot_provenance: WorkspaceArguments;
  atlas_find_catalog_items: WorkspaceArguments & {
    query: string;
    kinds: CatalogLookupKind[];
    itemTypes: string[];
    limit: number;
  };
  atlas_get_known_impact: WorkspaceArguments & {
    itemId: string;
    direction: ImpactDirection;
    maxDepth: number;
    limit: number;
  };
  atlas_explain_lineage_evidence: WorkspaceArguments & {
    itemId: string;
    limit: number;
  };
  atlas_get_access_evidence: WorkspaceArguments & {
    itemId?: string;
    limit: number;
  };
  atlas_get_operational_incidents: WorkspaceArguments & {
    includeImpact: boolean;
    includeHistory: boolean;
    limit: number;
  };
  atlas_get_snapshot_changes: WorkspaceArguments & {
    domains: AtlasChangeDomain[];
    limit: number;
  };
}

type Args = Record<string, unknown>;

function invalid(message: string): never {
  throw new AtlasMcpError("invalid-arguments", message);
}

function argumentObject(raw: unknown, allowed: readonly string[]): Args {
  if (raw === undefined) return {};
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    invalid("Tool arguments must be a JSON object.");
  }
  const unsupported = Object.keys(raw).filter((key) => !allowed.includes(key));
  if (unsupported.length) {
    const names = unsupported
      .slice(0, 3)
      .map((key) => JSON.stringify(key.slice(0, 40)))
      .join(", ");
    invalid(`Unsupported argument ${names}. Allowed: ${allowed.join(", ") || "none"}.`);
  }
  return raw as Args;
}

function workspaceId(args: Args): string | undefined {
  const value = args.workspaceId;
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !UUID.test(value.trim())) {
    invalid("workspaceId must be a Fabric workspace UUID.");
  }
  return value.trim().toLowerCase();
}

function itemId(args: Args, required: true): string;
function itemId(args: Args, required: false): string | undefined;
function itemId(args: Args, required: boolean): string | undefined {
  const value = args.itemId;
  if (value === undefined) {
    if (required) invalid("itemId is required.");
    return undefined;
  }
  const text = typeof value === "string" ? value.trim() : "";
  if (
    !text ||
    text.length > ATLAS_MCP_LIMITS.identifierLength ||
    !ITEM_ID.test(text)
  ) {
    invalid("itemId must be a Fabric item ID.");
  }
  return text;
}

function integer(
  args: Args,
  name: string,
  range: { default: number; max: number },
): number {
  const value = args[name];
  if (value === undefined) return range.default;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > range.max
  ) {
    invalid(`${name} must be an integer from 1 to ${range.max}.`);
  }
  return value;
}

function flag(args: Args, name: string, fallback: boolean): boolean {
  const value = args[name];
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") invalid(`${name} must be true or false.`);
  return value;
}

function oneOf<T extends string>(
  args: Args,
  name: string,
  values: readonly T[],
  fallback: T,
): T {
  const value = args[name];
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !values.includes(value as T)) {
    invalid(`${name} must be one of: ${values.join(", ")}.`);
  }
  return value as T;
}

function manyOf<T extends string>(
  args: Args,
  name: string,
  values: readonly T[],
): T[] {
  const value = args[name];
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > values.length ||
    value.some(
      (entry) => typeof entry !== "string" || !values.includes(entry as T),
    )
  ) {
    invalid(`${name} must be an array of: ${values.join(", ")}.`);
  }
  return [...new Set(value as T[])];
}

function itemTypes(args: Args): string[] {
  const value = args.itemTypes;
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > ATLAS_MCP_LIMITS.catalogItemTypes ||
    value.some((entry) => typeof entry !== "string" || !ITEM_TYPE.test(entry))
  ) {
    invalid(
      `itemTypes must contain up to ${ATLAS_MCP_LIMITS.catalogItemTypes} Fabric item type names such as SemanticModel.`,
    );
  }
  return [...new Set(value as string[])];
}

function query(args: Args): string {
  const value = args.query;
  const text =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!text || text.length > ATLAS_MCP_LIMITS.queryLength) {
    invalid(
      `query must contain between 1 and ${ATLAS_MCP_LIMITS.queryLength} characters.`,
    );
  }
  return text;
}

const ALLOWED: Record<AtlasMcpToolName, readonly string[]> = {
  atlas_list_workspaces: [],
  atlas_get_snapshot_provenance: ["workspaceId"],
  atlas_find_catalog_items: [
    "workspaceId",
    "query",
    "kinds",
    "itemTypes",
    "limit",
  ],
  atlas_get_known_impact: [
    "workspaceId",
    "itemId",
    "direction",
    "maxDepth",
    "limit",
  ],
  atlas_explain_lineage_evidence: ["workspaceId", "itemId", "limit"],
  atlas_get_access_evidence: ["workspaceId", "itemId", "limit"],
  atlas_get_operational_incidents: [
    "workspaceId",
    "includeImpact",
    "includeHistory",
    "limit",
  ],
  atlas_get_snapshot_changes: ["workspaceId", "domains", "limit"],
};

/** Validates raw MCP tool arguments; throws `invalid-arguments` on any violation. */
export function parseToolArguments<T extends AtlasMcpToolName>(
  tool: T,
  raw: unknown,
): AtlasMcpToolArguments[T] {
  const args = argumentObject(raw, ALLOWED[tool]);
  const parsed: { [K in AtlasMcpToolName]: () => AtlasMcpToolArguments[K] } = {
    atlas_list_workspaces: () => ({}),
    atlas_get_snapshot_provenance: () => ({ workspaceId: workspaceId(args) }),
    atlas_find_catalog_items: () => ({
      workspaceId: workspaceId(args),
      query: query(args),
      kinds: manyOf(args, "kinds", CATALOG_LOOKUP_KINDS),
      itemTypes: itemTypes(args),
      limit: integer(args, "limit", ATLAS_MCP_LIMITS.catalogResults),
    }),
    atlas_get_known_impact: () => ({
      workspaceId: workspaceId(args),
      itemId: itemId(args, true),
      direction: oneOf(args, "direction", IMPACT_DIRECTIONS, "both"),
      maxDepth: integer(args, "maxDepth", ATLAS_MCP_LIMITS.impactDepth),
      limit: integer(args, "limit", ATLAS_MCP_LIMITS.impactItems),
    }),
    atlas_explain_lineage_evidence: () => ({
      workspaceId: workspaceId(args),
      itemId: itemId(args, true),
      limit: integer(args, "limit", ATLAS_MCP_LIMITS.relationships),
    }),
    atlas_get_access_evidence: () => ({
      workspaceId: workspaceId(args),
      itemId: itemId(args, false),
      limit: integer(args, "limit", ATLAS_MCP_LIMITS.accessRows),
    }),
    atlas_get_operational_incidents: () => ({
      workspaceId: workspaceId(args),
      includeImpact: flag(args, "includeImpact", true),
      includeHistory: flag(args, "includeHistory", true),
      limit: integer(args, "limit", ATLAS_MCP_LIMITS.incidents),
    }),
    atlas_get_snapshot_changes: () => ({
      workspaceId: workspaceId(args),
      domains: manyOf(args, "domains", CHANGE_DOMAINS),
      limit: integer(args, "limit", ATLAS_MCP_LIMITS.changes),
    }),
  };
  return parsed[tool]() as AtlasMcpToolArguments[T];
}
