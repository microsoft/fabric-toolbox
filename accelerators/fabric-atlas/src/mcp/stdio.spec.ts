import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createAtlasMcpServer, type AtlasMcpServer } from "@/atlas/mcp/server";
import { LAKEHOUSE, fakeSource } from "@/test/atlas-mcp-fixtures";
import { serveStdio } from "./stdio";

function harness(server?: AtlasMcpServer, maxMessageBytes?: number) {
  const input = new PassThrough();
  const output = new PassThrough();
  const log = vi.fn();
  const instance =
    server ??
    createAtlasMcpServer({
      source: fakeSource().source,
      version: "test",
      now: () => new Date("2026-10-02T09:30:00.000Z"),
    });
  const done = serveStdio(instance, { input, output, log, maxMessageBytes });
  const lines = async () => {
    await done;
    const text = output.read()?.toString("utf8") ?? "";
    return text
      .split("\n")
      .filter(Boolean)
      .map((line: string) => JSON.parse(line));
  };
  return { input, lines, log };
}

const INITIALIZE = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-11-25" },
});

describe("Atlas MCP stdio transport", () => {
  it("answers newline-delimited requests in order across chunk boundaries", async () => {
    const { input, lines } = harness();
    const call = JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "atlas_get_known_impact", arguments: { itemId: LAKEHOUSE } },
    });
    input.write(`${INITIALIZE}\r\n`);
    input.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,');
    input.write('"method":"tools/list"}\n');
    input.write(call.slice(0, 20));
    input.end(`${call.slice(20)}\n`);

    const responses = await lines();
    expect(responses.map((response: { id: number }) => response.id)).toEqual([1, 2, 3]);
    expect(responses[1].result.tools).toHaveLength(8);
    expect(responses[2].result.isError).toBe(false);
  });

  it("reports parse errors and keeps serving", async () => {
    const { input, lines } = harness();
    input.write("not json\n");
    input.end(`${INITIALIZE}\n`);

    const responses = await lines();
    expect(responses[0]).toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error." },
    });
    expect(responses[1].id).toBe(1);
  });

  it("discards oversized messages and recovers on the next line", async () => {
    const { input, lines } = harness(undefined, 256);
    input.write(`{"jsonrpc":"2.0","id":9,"method":"ping","params":{"padding":"${"x".repeat(300)}`);
    input.write(`${"y".repeat(100)}"}}\n`);
    input.end(`${INITIALIZE}\n`);

    const responses = await lines();
    expect(responses[0]).toMatchObject({
      id: null,
      error: { code: -32600, message: "Message exceeds the Atlas MCP size limit." },
    });
    expect(responses).toHaveLength(2);
    expect(responses[1].id).toBe(1);
  });

  it("turns an unexpected handler failure into an internal error", async () => {
    const failing: AtlasMcpServer = {
      handleMessage: async () => {
        throw new RangeError("boom");
      },
    };
    const { input, lines, log } = harness(failing);
    input.end('{"jsonrpc":"2.0","id":"x","method":"ping"}\n');

    expect(await lines()).toEqual([
      { jsonrpc: "2.0", id: "x", error: { code: -32603, message: "Internal error." } },
    ]);
    expect(log).toHaveBeenCalledWith("[atlas-mcp] request failed: RangeError");
  });
});
