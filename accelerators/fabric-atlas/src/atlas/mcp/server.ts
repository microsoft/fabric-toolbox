import {
  ATLAS_MCP_LIMITS,
  ATLAS_MCP_PROTOCOL_VERSIONS,
  ATLAS_MCP_SERVER_NAME,
  ATLAS_MCP_STRUCTURED_OUTPUT_VERSIONS,
  AtlasMcpError,
  isAtlasMcpToolName,
} from "./contract";
import type { AtlasMcpDataSource } from "./data-source";
import { callAtlasMcpTool, errorEnvelope } from "./evidence-tools";
import { ATLAS_MCP_TOOLS } from "./tool-definitions";

// Minimal MCP server over JSON-RPC 2.0: initialize, ping, tools/list and
// tools/call. Resources, prompts, sampling, completions and any other method
// are refused, so the surface cannot grow into a chat or write channel.

export type JsonRpcId = string | number;

export interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: unknown;
}

export interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: JsonRpcId | null;
  error: { code: number; message: string };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

export const JSON_RPC_ERROR = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
} as const;

export const ATLAS_MCP_INSTRUCTIONS =
  "Fabric Atlas MCP is read-only. Tools return deterministic evidence from the last validated Atlas snapshot of administrator-selected workspaces; every result carries its snapshot, timestamps, sources, coverage and limitations. It cannot change Fabric, Atlas data, permissions or deployments, offers no remediation and does not answer business-data questions. Start with atlas_list_workspaces, then pass workspaceId and item IDs from earlier results.";

export interface AtlasMcpServerOptions {
  source: AtlasMcpDataSource;
  version: string;
  itemRelationsEnabled?: boolean;
  policyEvidenceEnabled?: boolean;
  now?: () => Date;
  log?: (message: string) => void;
  /** Serialized tool result ceiling; defaults to the contract limit. */
  maxResultBytes?: number;
}

export interface AtlasMcpServer {
  handleMessage(message: unknown): Promise<JsonRpcResponse | undefined>;
}

export function jsonRpcError(
  id: JsonRpcId | null,
  code: number,
  message: string,
): JsonRpcFailure {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isRequestId(value: unknown): value is JsonRpcId {
  return (
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

export function createAtlasMcpServer(options: AtlasMcpServerOptions): AtlasMcpServer {
  const log = options.log ?? (() => undefined);
  const maxResultBytes =
    options.maxResultBytes ?? ATLAS_MCP_LIMITS.outboundMessageBytes;
  const runtime = {
    source: options.source,
    itemRelationsEnabled: options.itemRelationsEnabled ?? false,
    policyEvidenceEnabled: options.policyEvidenceEnabled ?? false,
    now: options.now ?? (() => new Date()),
    log,
  };
  let negotiated: string | undefined;

  function structured(): boolean {
    return !!negotiated && ATLAS_MCP_STRUCTURED_OUTPUT_VERSIONS.has(negotiated);
  }

  function initialize(id: JsonRpcId, params: unknown): JsonRpcResponse {
    if (!isRecord(params) || typeof params.protocolVersion !== "string") {
      return jsonRpcError(
        id,
        JSON_RPC_ERROR.invalidParams,
        "initialize requires a protocolVersion.",
      );
    }
    const requested = params.protocolVersion;
    negotiated = (ATLAS_MCP_PROTOCOL_VERSIONS as readonly string[]).includes(
      requested,
    )
      ? requested
      : ATLAS_MCP_PROTOCOL_VERSIONS[0];
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: negotiated,
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: ATLAS_MCP_SERVER_NAME,
          title: "Fabric Atlas read-only evidence",
          version: options.version,
        },
        instructions: ATLAS_MCP_INSTRUCTIONS,
      },
    };
  }

  function listTools(id: JsonRpcId): JsonRpcResponse {
    const withStructuredOutput = structured();
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: ATLAS_MCP_TOOLS.map(({ title, outputSchema, ...tool }) =>
          withStructuredOutput ? { ...tool, title, outputSchema } : tool,
        ),
      },
    };
  }

  async function callTool(id: JsonRpcId, params: unknown): Promise<JsonRpcResponse> {
    if (!isRecord(params)) {
      return jsonRpcError(id, JSON_RPC_ERROR.invalidParams, "tools/call requires params.");
    }
    const name = params.name;
    if (!isAtlasMcpToolName(name)) {
      return jsonRpcError(
        id,
        JSON_RPC_ERROR.invalidParams,
        "Unknown tool. Atlas MCP exposes only its read-only atlas_* tools.",
      );
    }
    let envelope = await callAtlasMcpTool(name, params.arguments, runtime);
    let text = JSON.stringify(envelope);
    if (byteLength(text) > maxResultBytes) {
      envelope = errorEnvelope(
        name,
        envelope.retrievedAt,
        { workspace: envelope.workspace, snapshot: envelope.snapshot },
        new AtlasMcpError(
          "result-too-large",
          "The result exceeded the Atlas MCP size limit. Lower limit or narrow the request.",
        ),
      );
      text = JSON.stringify(envelope);
    }
    log(`[atlas-mcp] tools/call ${name}: ${envelope.error?.code ?? "ok"}`);
    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text }],
        ...(structured() ? { structuredContent: envelope } : {}),
        isError: !!envelope.error,
      },
    };
  }

  async function handleMessage(message: unknown): Promise<JsonRpcResponse | undefined> {
    if (Array.isArray(message)) {
      return jsonRpcError(null, JSON_RPC_ERROR.invalidRequest, "JSON-RPC batches are not supported.");
    }
    if (!isRecord(message) || message.jsonrpc !== "2.0") {
      return jsonRpcError(null, JSON_RPC_ERROR.invalidRequest, "Invalid JSON-RPC 2.0 message.");
    }
    if (typeof message.method !== "string") {
      // Responses are only valid for server-initiated requests, which Atlas never sends.
      if (isRequestId(message.id) && ("result" in message || "error" in message)) {
        return undefined;
      }
      return jsonRpcError(
        isRequestId(message.id) ? message.id : null,
        JSON_RPC_ERROR.invalidRequest,
        "Invalid JSON-RPC 2.0 request.",
      );
    }
    // Notifications (initialized, cancelled, progress) need no response.
    if (!("id" in message)) return undefined;
    const id = message.id;
    if (!isRequestId(id)) {
      return jsonRpcError(null, JSON_RPC_ERROR.invalidRequest, "Request IDs must be strings or numbers.");
    }
    switch (message.method) {
      case "initialize":
        return initialize(id, message.params);
      case "ping":
        return { jsonrpc: "2.0", id, result: {} };
      case "tools/list":
        return negotiated
          ? listTools(id)
          : jsonRpcError(id, JSON_RPC_ERROR.invalidRequest, "Call initialize first.");
      case "tools/call":
        return negotiated
          ? callTool(id, message.params)
          : jsonRpcError(id, JSON_RPC_ERROR.invalidRequest, "Call initialize first.");
      default:
        return jsonRpcError(
          id,
          JSON_RPC_ERROR.methodNotFound,
          "Method not found. Atlas MCP supports initialize, ping, tools/list and tools/call only.",
        );
    }
  }

  return { handleMessage };
}
