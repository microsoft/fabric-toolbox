import type { Readable, Writable } from "node:stream";
import { ATLAS_MCP_LIMITS } from "@/atlas/mcp/contract";
import {
  JSON_RPC_ERROR,
  jsonRpcError,
  type AtlasMcpServer,
  type JsonRpcId,
  type JsonRpcResponse,
} from "@/atlas/mcp/server";

// MCP stdio transport: one UTF-8 JSON-RPC message per line on stdin/stdout.
// Requests are handled in arrival order; oversized lines are discarded.

export interface StdioOptions {
  input: Readable;
  output: Writable;
  log: (message: string) => void;
  maxMessageBytes?: number;
}

function requestId(message: unknown): JsonRpcId | null {
  if (!message || typeof message !== "object" || Array.isArray(message)) return null;
  const id = (message as { id?: unknown }).id;
  return typeof id === "string" || (typeof id === "number" && Number.isFinite(id))
    ? id
    : null;
}

export function serveStdio(server: AtlasMcpServer, options: StdioOptions): Promise<void> {
  const maxBytes = options.maxMessageBytes ?? ATLAS_MCP_LIMITS.inboundMessageBytes;
  const write = (response: JsonRpcResponse) => {
    options.output.write(`${JSON.stringify(response)}\n`);
  };
  const tooLarge = () =>
    write(
      jsonRpcError(
        null,
        JSON_RPC_ERROR.invalidRequest,
        "Message exceeds the Atlas MCP size limit.",
      ),
    );

  async function handleLine(line: string): Promise<void> {
    const text = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (!text.trim()) return;
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      tooLarge();
      return;
    }
    let message: unknown;
    try {
      message = JSON.parse(text);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      write(jsonRpcError(null, JSON_RPC_ERROR.parseError, "Parse error."));
      return;
    }
    let response: JsonRpcResponse | undefined;
    try {
      response = await server.handleMessage(message);
    } catch (error) {
      // Transport boundary: an unexpected failure must not stop the server.
      options.log(
        `[atlas-mcp] request failed: ${error instanceof Error ? error.name : typeof error}`,
      );
      response = jsonRpcError(
        requestId(message),
        JSON_RPC_ERROR.internalError,
        "Internal error.",
      );
    }
    if (response) write(response);
  }

  return new Promise((resolve, reject) => {
    let queue: Promise<void> = Promise.resolve();
    let buffer = "";
    let discarding = false;
    const enqueue = (task: () => Promise<void> | void) => {
      queue = queue.then(task);
    };

    options.input.setEncoding("utf8");
    options.input.on("data", (chunk: string) => {
      buffer += chunk;
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (discarding) {
          discarding = false;
        } else {
          enqueue(() => handleLine(line));
        }
        newline = buffer.indexOf("\n");
      }
      if (discarding) {
        buffer = "";
      } else if (Buffer.byteLength(buffer, "utf8") > maxBytes) {
        buffer = "";
        discarding = true;
        enqueue(tooLarge);
      }
    });
    options.input.on("end", () => {
      const rest = buffer;
      buffer = "";
      if (!discarding && rest.trim()) enqueue(() => handleLine(rest));
      queue.then(resolve, reject);
    });
    options.input.on("error", reject);
  });
}
