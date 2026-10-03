import { describe, expect, it, vi } from "vitest";
import { LAKEHOUSE, fakeSource } from "../../test/atlas-mcp-fixtures";
import { ATLAS_MCP_TOOL_NAMES } from "./contract";
import {
  ATLAS_MCP_INSTRUCTIONS,
  JSON_RPC_ERROR,
  createAtlasMcpServer,
  type JsonRpcResponse,
} from "./server";

const NOW = new Date("2026-10-02T09:30:00.000Z");

function server(options: { maxResultBytes?: number; authenticated?: boolean } = {}) {
  const { source } = fakeSource({ authenticated: options.authenticated });
  return createAtlasMcpServer({
    source,
    version: "2.0.0-test",
    now: () => NOW,
    maxResultBytes: options.maxResultBytes,
  });
}

async function initialized(protocolVersion = "2025-11-25", options = {}) {
  const instance = server(options);
  await instance.handleMessage({
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: { protocolVersion, capabilities: {}, clientInfo: { name: "test", version: "1" } },
  });
  return instance;
}

// Protocol results are plain JSON; tests read them structurally.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function success(response: JsonRpcResponse | undefined): any {
  expect(response).toBeDefined();
  expect(response).not.toHaveProperty("error");
  return (response as { result: unknown }).result;
}

describe("Atlas MCP lifecycle", () => {
  it("negotiates a supported protocol and advertises only tools", async () => {
    const response = await server().handleMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {} },
    });

    expect(success(response)).toEqual({
      protocolVersion: "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: {
        name: "fabric-atlas",
        title: "Fabric Atlas read-only evidence",
        version: "2.0.0-test",
      },
      instructions: ATLAS_MCP_INSTRUCTIONS,
    });
    expect(ATLAS_MCP_INSTRUCTIONS).toMatch(/read-only/);
    expect(ATLAS_MCP_INSTRUCTIONS).toMatch(/does not answer business-data questions/);
  });

  it("answers an unknown protocol revision with its latest supported one", async () => {
    const response = await server().handleMessage({
      jsonrpc: "2.0",
      id: "init",
      method: "initialize",
      params: { protocolVersion: "2099-01-01" },
    });
    expect(success(response).protocolVersion).toBe("2025-11-25");
  });

  it("requires initialize before tools and rejects other MCP features", async () => {
    const fresh = server();
    expect(
      await fresh.handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    ).toEqual({
      jsonrpc: "2.0",
      id: 2,
      error: { code: JSON_RPC_ERROR.invalidRequest, message: "Call initialize first." },
    });
    expect(success(await fresh.handleMessage({ jsonrpc: "2.0", id: 3, method: "ping" }))).toEqual({});

    const ready = await initialized();
    for (const method of [
      "resources/list",
      "resources/read",
      "prompts/list",
      "sampling/createMessage",
      "completion/complete",
      "logging/setLevel",
    ]) {
      const response = await ready.handleMessage({ jsonrpc: "2.0", id: method, method });
      expect(response).toMatchObject({
        id: method,
        error: { code: JSON_RPC_ERROR.methodNotFound },
      });
    }
  });

  it("ignores notifications and client responses and rejects malformed messages", async () => {
    const ready = await initialized();
    expect(
      await ready.handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }),
    ).toBeUndefined();
    expect(
      await ready.handleMessage({ jsonrpc: "2.0", id: 9, result: {} }),
    ).toBeUndefined();
    expect(await ready.handleMessage([{ jsonrpc: "2.0", id: 1, method: "ping" }])).toMatchObject({
      id: null,
      error: { code: JSON_RPC_ERROR.invalidRequest },
    });
    expect(await ready.handleMessage({ jsonrpc: "1.0", id: 1, method: "ping" })).toMatchObject({
      error: { code: JSON_RPC_ERROR.invalidRequest },
    });
    expect(
      await ready.handleMessage({ jsonrpc: "2.0", id: null, method: "ping" }),
    ).toMatchObject({ id: null, error: { code: JSON_RPC_ERROR.invalidRequest } });
  });
});

describe("Atlas MCP tools/list", () => {
  it("exposes exactly the read-only Atlas tools with strict input schemas", async () => {
    const ready = await initialized();
    const { tools } = success(
      await ready.handleMessage({ jsonrpc: "2.0", id: 4, method: "tools/list" }),
    );

    expect(tools.map((tool: { name: string }) => tool.name)).toEqual([...ATLAS_MCP_TOOL_NAMES]);
    for (const tool of tools) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
      expect(tool.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
      expect(tool.outputSchema.required).toEqual(
        expect.arrayContaining(["snapshot", "retrievedAt", "sources", "coverage", "limitations"]),
      );
      expect(tool.name).not.toMatch(
        /create|update|delete|add|remove|move|grant|revoke|assign|set|deploy|remediate|fix|run|execute|chat|ask/,
      );
    }
  });

  it("omits structured output fields for older protocol revisions", async () => {
    const legacy = await initialized("2025-03-26");
    const { tools } = success(
      await legacy.handleMessage({ jsonrpc: "2.0", id: 5, method: "tools/list" }),
    );
    expect(tools[0]).not.toHaveProperty("outputSchema");
    expect(tools[0]).not.toHaveProperty("title");
    expect(tools[0].annotations.readOnlyHint).toBe(true);

    const result = success(
      await legacy.handleMessage({
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: { name: "atlas_list_workspaces", arguments: {} },
      }),
    );
    expect(result).not.toHaveProperty("structuredContent");
    expect(JSON.parse(result.content[0].text).tool).toBe("atlas_list_workspaces");
  });
});

describe("Atlas MCP tools/call", () => {
  it("returns the envelope as text and structured content", async () => {
    const ready = await initialized();
    const result = success(
      await ready.handleMessage({
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: { name: "atlas_get_known_impact", arguments: { itemId: LAKEHOUSE } },
      }),
    );

    expect(result.isError).toBe(false);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
    expect(result.structuredContent).toMatchObject({
      tool: "atlas_get_known_impact",
      readOnly: true,
      retrievedAt: NOW.toISOString(),
    });
  });

  it("refuses tools that Atlas does not expose, including Fabric write tools", async () => {
    const ready = await initialized();
    for (const name of ["delete_item", "update_workspace_role", "ExecuteQuery", "atlas_chat"]) {
      const response = await ready.handleMessage({
        jsonrpc: "2.0",
        id: name,
        method: "tools/call",
        params: { name, arguments: {} },
      });
      expect(response).toMatchObject({
        id: name,
        error: { code: JSON_RPC_ERROR.invalidParams },
      });
    }
  });

  it("marks failures as tool errors so the caller can see the reason", async () => {
    const ready = await initialized("2025-11-25", { authenticated: false });
    const result = success(
      await ready.handleMessage({
        jsonrpc: "2.0",
        id: 8,
        method: "tools/call",
        params: { name: "atlas_list_workspaces", arguments: {} },
      }),
    );
    expect(result.isError).toBe(true);
    expect(result.structuredContent.error).toMatchObject({ code: "unauthenticated" });
  });

  it("replaces an oversized result with an explicit error", async () => {
    const log = vi.fn();
    const { source } = fakeSource();
    const small = createAtlasMcpServer({
      source,
      version: "test",
      now: () => NOW,
      maxResultBytes: 200,
      log,
    });
    await small.handleMessage({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: { protocolVersion: "2025-11-25" },
    });
    const result = success(
      await small.handleMessage({
        jsonrpc: "2.0",
        id: 9,
        method: "tools/call",
        params: { name: "atlas_get_snapshot_provenance", arguments: {} },
      }),
    );
    expect(result.isError).toBe(true);
    expect(result.structuredContent.error.code).toBe("result-too-large");
    expect(result.structuredContent.snapshot).not.toBeNull();
    expect(log).toHaveBeenCalledWith(
      "[atlas-mcp] tools/call atlas_get_snapshot_provenance: result-too-large",
    );
  });
});
