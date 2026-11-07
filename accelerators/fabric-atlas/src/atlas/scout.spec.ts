import { describe, expect, it } from "vitest";
import {
  createScoutClient,
  extractAnswer,
  extractEvidence,
  isScoutConfigured,
  scoutBaseUrl,
  ScoutError,
} from "./scout";
import { classifyScoutCell, parseScoutInline, parseScoutMarkdown, scoutLineage, splitScoutLabel, tokenizeSql } from "./scout-markdown";

const endpoint = {
  workspaceId: "6bf4c521-7412-4e6b-8867-68253bbfb18a",
  agentId: "e468903e-a1dc-4132-9a36-4559dc258502",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("Atlas Scout configuration", () => {
  it("requires GUID workspace and agent ids", () => {
    expect(isScoutConfigured(endpoint)).toBe(true);
    expect(isScoutConfigured({ workspaceId: endpoint.workspaceId, agentId: "" })).toBe(false);
    expect(() => scoutBaseUrl({ workspaceId: "x", agentId: "y" })).toThrow(ScoutError);
    expect(scoutBaseUrl(endpoint)).toBe(
      `https://api.fabric.microsoft.com/v1/workspaces/${endpoint.workspaceId}/dataagents/${endpoint.agentId}/aiassistant/openai`,
    );
  });
});

describe("Atlas Scout response parsing", () => {
  it("reads the latest assistant message", () => {
    expect(
      extractAnswer({
        data: [
          { role: "assistant", content: [{ type: "text", text: { value: "Latest" } }] },
          { role: "user", content: [{ type: "text", text: { value: "Q" } }] },
          { role: "assistant", content: [{ type: "text", text: { value: "Older" } }] },
        ],
      }),
    ).toBe("Latest");
  });

  it("collects SQL and result tables in execution order without duplicates", () => {
    const evidence = extractEvidence({
      data: [
        { step_details: { tool_calls: [{ function: { name: "analyze.database.execute", output: "| b |\n|---|\n| 2 |" } }] } },
        { step_details: { tool_calls: [{ function: { name: "analyze.database.nl2code", output: "# Variation 1\n```sql\nSELECT 2\n```" } }] } },
        { step_details: { tool_calls: [{ function: { name: "analyze.database.fewshots.matching", output: null } }] } },
        { step_details: { tool_calls: [{ function: { name: "analyze.database.nl2code", output: "```sql\nSELECT 1\n```\n```sql\nSELECT 2\n```" } }] } },
      ],
    });
    expect(evidence.sql).toEqual(["SELECT 1", "SELECT 2"]);
    expect(evidence.results).toEqual(["| b |\n|---|\n| 2 |"]);
  });
});

describe("Atlas Scout client", () => {
  it("runs the assistant flow and reuses the thread", async () => {
    const calls: string[] = [];
    let polls = 0;
    const client = createScoutClient({
      endpoint,
      getToken: async () => "token",
      wait: async () => undefined,
      fetch: async (url, init) => {
        const path = new URL(url).pathname.split("/openai")[1];
        calls.push(`${init?.method} ${path}`);
        expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer token");
        if (path === "/assistants") return json({ id: "asst" });
        if (path === "/threads") return json({ id: "t1" });
        if (path === "/threads/t1/messages" && init?.method === "POST") return json({ id: "m" });
        if (path === "/threads/t1/runs") return json({ id: "r1", status: "queued" });
        if (path === "/threads/t1/runs/r1") return json({ status: ++polls < 3 ? "in_progress" : "completed" });
        if (path === "/threads/t1/messages") {
          expect(new URL(url).searchParams.get("order")).toBe("desc");
          return json({ data: [{ role: "assistant", content: [{ text: { value: "**3** items" } }] }] });
        }
        if (path === "/threads/t1/runs/r1/steps") return json({ data: [] });
        throw new Error(`unexpected ${path}`);
      },
    });

    const phases: string[] = [];
    const first = await client.ask("How many items?", undefined, undefined, (phase) => phases.push(phase));
    expect(phases).toEqual(["connecting", "thinking", "querying", "writing"]);
    expect(first).toEqual({ threadId: "t1", text: "**3** items", evidence: { sql: [], results: [] } });
    polls = 0;
    await client.ask("And failing?", first.threadId);
    expect(calls.filter((call) => call === "POST /assistants")).toHaveLength(1);
    expect(calls.filter((call) => call === "POST /threads")).toHaveLength(1);
  });

  it("surfaces failed runs and access errors clearly", async () => {
    const failing = createScoutClient({
      endpoint,
      getToken: async () => "token",
      wait: async () => undefined,
      fetch: async (url) => {
        const path = new URL(url).pathname.split("/openai")[1];
        if (path === "/assistants") return json({ id: "asst" });
        if (path === "/threads") return json({ id: "t1" });
        if (path === "/threads/t1/runs") return json({ id: "r1", status: "failed", last_error: null });
        return json({});
      },
    });
    await expect(failing.ask("Q")).rejects.toThrow("Atlas Scout run failed.");

    const forbidden = createScoutClient({
      endpoint,
      getToken: async () => "token",
      fetch: async () => new Response("denied", { status: 403 }),
    });
    await expect(forbidden.ask("Q")).rejects.toMatchObject({ status: 403, message: expect.stringMatching(/access/) });
  });
});

describe("Atlas Scout markdown", () => {
  it("parses headings, lists, tables and code blocks", () => {
    const blocks = parseScoutMarkdown(
      "## Scorecard\nTwo workspaces.\n\n| Workspace | Score |\n|---|---:|\n| Sales | 82 |\n\n1. Fix labels\n2. Add owners\n\n```sql\nSELECT 1\n```",
    );
    expect(blocks).toEqual([
      { kind: "heading", level: 2, text: "Scorecard" },
      { kind: "paragraph", text: "Two workspaces." },
      { kind: "table", header: ["Workspace", "Score"], rows: [["Sales", "82"]] },
      {
        kind: "list",
        ordered: true,
        items: [
          { text: "Fix labels", ordered: true, number: 1, children: [] },
          { text: "Add owners", ordered: true, number: 2, children: [] },
        ],
      },
      { kind: "code", language: "sql", text: "SELECT 1" },
    ]);
  });

  it("nests indented lists, renumbers items split by blank lines and drops step labels", () => {
    const blocks = parseScoutMarkdown(
      "Audit\n\n1. Missing labels\n   - Evidence: 12 items\n   - Priority: High\n\n1. Orphan items\n   - Action: assign owners\n\n**Recommend:**\nDone.",
    );
    expect(blocks).toEqual([
      {
        kind: "list",
        ordered: true,
        items: [
          {
            text: "Missing labels",
            ordered: true,
            number: 1,
            children: [
              { text: "Evidence: 12 items", ordered: false, children: [] },
              { text: "Priority: High", ordered: false, children: [] },
            ],
          },
          {
            text: "Orphan items",
            ordered: true,
            number: 2,
            children: [{ text: "Action: assign owners", ordered: false, children: [] }],
          },
        ],
      },
      { kind: "paragraph", text: "Done." },
    ]);
  });

  it("splits label/value list items", () => {
    expect(splitScoutLabel("**Priority:** High")).toEqual({ label: "Priority", value: "High" });
    expect(splitScoutLabel("Evidence: 2 / 83 endorsed")).toEqual({ label: "Evidence", value: "2 / 83 endorsed" });
    expect(splitScoutLabel("Fix labels on Sales")).toBeNull();
  });

  it("keeps markup as plain text segments", () => {
    expect(parseScoutInline("<b>x</b> **bold** and `code`")).toEqual([
      { kind: "text", text: "<b>x</b> " },
      { kind: "strong", text: "bold" },
      { kind: "text", text: " and " },
      { kind: "code", text: "code" },
    ]);
  });
});

describe("Atlas Scout rich rendering helpers", () => {
  it("classifies percentages, statuses and numbers", () => {
    expect(classifyScoutCell("82%")).toEqual({ kind: "percent", value: 82, text: "82%" });
    expect(classifyScoutCell("140 %")).toMatchObject({ kind: "percent", value: 100 });
    expect(classifyScoutCell("**Failed**")).toEqual({ kind: "status", tone: "failing", text: "Failed" });
    expect(classifyScoutCell("Certified")).toMatchObject({ kind: "status", tone: "healthy" });
    expect(classifyScoutCell("1,204")).toEqual({ kind: "number", text: "1,204" });
    expect(classifyScoutCell("Sales Lakehouse")).toEqual({ kind: "text", text: "Sales Lakehouse" });
  });

  it("renders 0-100 scores as gauges only under score-like headers", () => {
    expect(classifyScoutCell("72", "Health score")).toEqual({ kind: "percent", value: 72, text: "72" });
    expect(classifyScoutCell("72", "Items")).toEqual({ kind: "number", text: "72" });
    expect(classifyScoutCell("640", "Score")).toEqual({ kind: "number", text: "640" });
  });

  it("tokenizes SQL keywords, strings and numbers", () => {
    expect(tokenizeSql("SELECT TOP 5 name FROM items WHERE state = 'Failed'")).toEqual([
      { kind: "keyword", text: "SELECT" },
      { kind: "text", text: " " },
      { kind: "keyword", text: "TOP" },
      { kind: "text", text: " " },
      { kind: "number", text: "5" },
      { kind: "text", text: " name " },
      { kind: "keyword", text: "FROM" },
      { kind: "text", text: " items " },
      { kind: "keyword", text: "WHERE" },
      { kind: "text", text: " state = " },
      { kind: "string", text: "'Failed'" },
    ]);
  });
});

describe("scoutLineage", () => {
  const header = ["Source", "Source type", "Relation", "Target", "Target type", "Broken", "Target health", "Failed runs (14d)"];

  it("ignores tables without source and target columns", () => {
    expect(scoutLineage(["Workspace", "Score"], [["Sales", "80"]])).toBeNull();
  });

  it("lays out edges in layers and keeps items with the same name but different types apart", () => {
    const graph = scoutLineage(header, [
      ["LH_Sales", "Lakehouse", "SQL endpoint", "LH_Sales", "SQLEndpoint", "0", "unknown", "0"],
      ["LH_Sales", "SQLEndpoint", "Direct Lake", "**Sales Model**", "SemanticModel", "1", "failing", "3"],
    ])!;
    expect(graph.nodes.map((node) => [node.label, node.type, node.layer])).toEqual([
      ["LH_Sales", "Lakehouse", 0],
      ["LH_Sales", "SQLEndpoint", 1],
      ["Sales Model", "SemanticModel", 2],
    ]);
    expect(graph.edges[1].broken).toBe(true);
    expect(graph.nodes[2].tone).toBe("failing");
    expect(graph.layers).toBe(3);
  });

  it("survives cycles and deduplicates repeated edges", () => {
    const graph = scoutLineage(header, [
      ["LH", "Lakehouse", "notebook reads", "NB", "Notebook", "0", "unknown", "0"],
      ["NB", "Notebook", "writes", "LH", "Lakehouse", "0", "unknown", "0"],
      ["NB", "Notebook", "writes", "LH", "Lakehouse", "0", "unknown", "0"],
    ])!;
    expect(graph.edges).toHaveLength(2);
    expect(graph.nodes.map((node) => node.layer)).toEqual([0, 1]);
  });
});

describe("Atlas Scout stop and resume", () => {
  it("cancels the run on stop and moves to a fresh thread if the old run is still active", async () => {
    const calls: string[] = [];
    const client = createScoutClient({
      endpoint,
      getToken: async () => "token",
      wait: async (_ms, signal) => {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      },
      fetch: async (url, init) => {
        const path = new URL(url).pathname.split("/openai")[1];
        calls.push(`${init?.method} ${path}`);
        if (path === "/assistants") return json({ id: "asst" });
        if (path === "/threads") return json({ id: "t2" });
        if (path === "/threads/t1/messages") return json({ error: { message: "Can't add messages to thread_t1 while a run run_r1 is active." } }, 400);
        if (path === "/threads/t2/messages" && init?.method === "POST") return json({ id: "m" });
        if (path.endsWith("/runs")) return json({ id: "r1", status: "queued" });
        if (path.endsWith("/cancel")) return json({ status: "cancelling" });
        if (path.endsWith("/runs/r1")) return json({ status: "completed" });
        if (path === "/threads/t2/messages") return json({ data: [{ role: "assistant", content: [{ text: { value: "ok" } }] }] });
        if (path.endsWith("/steps")) return json({ data: [] });
        if (init?.method === "DELETE") return json({});
        throw new Error(`unexpected ${path}`);
      },
    });
    const answer = await client.ask("Again", "t1");
    expect(answer.threadId).toBe("t2");
    expect(calls).toContain("DELETE /threads/t1");

    calls.length = 0;
    const controller = new AbortController();
    const pending = client.ask("Stop me", "t2", controller.signal, (phase) => {
      if (phase === "thinking") controller.abort();
    });
    await expect(pending).rejects.toThrow();
    expect(calls).toContain("POST /threads/t2/runs/r1/cancel");
  });
});

describe("Atlas Scout stale runs", () => {
  it("cancels a stale run and retries in a fresh thread on a new conversation", async () => {
    const calls: string[] = [];
    let threads = 0;
    const client = createScoutClient({
      endpoint,
      getToken: async () => "token",
      wait: async () => undefined,
      fetch: async (url, init) => {
        const path = new URL(url).pathname.split("/openai")[1];
        calls.push(`${init?.method} ${path}`);
        if (path === "/assistants") return json({ id: "asst" });
        if (path === "/threads") return json({ id: `t${++threads}` });
        if (path === "/threads/t1/messages") return json({ error: { message: "Can't add messages to thread_t1 while a run run_old is active." } }, 400);
        if (path === "/threads/t2/messages" && init?.method === "POST") return json({ id: "m" });
        if (path.endsWith("/runs")) return json({ id: "r2", status: "queued" });
        if (path.endsWith("/cancel")) return json({ status: "cancelling" });
        if (path.endsWith("/runs/r2")) return json({ status: "completed" });
        if (path === "/threads/t2/messages") return json({ data: [{ role: "assistant", content: [{ text: { value: "ok" } }] }] });
        if (path.endsWith("/steps")) return json({ data: [] });
        if (init?.method === "DELETE") return json({});
        throw new Error(`unexpected ${path}`);
      },
    });
    const answer = await client.ask("First question");
    expect(answer).toMatchObject({ threadId: "t2", text: "ok" });
    expect(calls).toContain("POST /threads/t1/runs/run_old/cancel");
  });

  it("continues in a fresh thread when the conversation thread is gone", async () => {
    let threads = 0;
    const client = createScoutClient({
      endpoint,
      getToken: async () => "token",
      wait: async () => undefined,
      fetch: async (url, init) => {
        const path = new URL(url).pathname.split("/openai")[1];
        if (path === "/assistants") return json({ id: "asst" });
        if (path === "/threads") return json({ id: `t${++threads}` });
        if (path === "/threads/old/messages") return json({ error: { message: "Thread not found" } }, 404);
        if (path === "/threads/t1/messages" && init?.method === "POST") return json({ id: "m" });
        if (path.endsWith("/runs")) return json({ id: "r1", status: "queued" });
        if (path.endsWith("/runs/r1")) return json({ status: "completed" });
        if (path === "/threads/t1/messages") return json({ data: [{ role: "assistant", content: [{ text: { value: "ok" } }] }] });
        if (path.endsWith("/steps")) return json({ data: [] });
        throw new Error(`unexpected ${path}`);
      },
    });
    await expect(client.ask("Next question", "old")).resolves.toMatchObject({ threadId: "t1", text: "ok" });
  });

  it("asks once more when the service loses its own tool call", async () => {
    let threads = 0;
    const client = createScoutClient({
      endpoint,
      getToken: async () => "token",
      wait: async () => undefined,
      fetch: async (url, init) => {
        const path = new URL(url).pathname.split("/openai")[1];
        if (path === "/assistants") return json({ id: "asst" });
        if (path === "/threads") return json({ id: `t${++threads}` });
        if (path.endsWith("/messages") && init?.method === "POST") return json({ id: "m" });
        if (path === "/threads/t1/runs") return json({ id: "r1", status: "queued" });
        if (path === "/threads/t2/runs") return json({ id: "r2", status: "queued" });
        if (path.endsWith("/runs/r1"))
          return json({ status: "failed", last_error: { message: "Status code NotFound: OpenAI request to 'openai/threads/t1/runs/r1/submit_tool_outputs' failed." } });
        if (path.endsWith("/runs/r2")) return json({ status: "completed" });
        if (path === "/threads/t2/messages") return json({ data: [{ role: "assistant", content: [{ text: { value: "ok" } }] }] });
        if (path.endsWith("/steps")) return json({ data: [] });
        throw new Error(`unexpected ${path}`);
      },
    });
    await expect(client.ask("Question")).resolves.toMatchObject({ threadId: "t2", text: "ok" });
  });
});

describe("Scout markdown tables", () => {
  it("parses tables written without leading and trailing pipes", () => {
    const blocks = parseScoutMarkdown("Lineage:\nSource | Relation | Target\n--- | --- | ---\nLH | writes | SM\nSM | binds | RP\n\nDone.");
    expect(blocks[1]).toEqual({ kind: "table", header: ["Source", "Relation", "Target"], rows: [["LH", "writes", "SM"], ["SM", "binds", "RP"]] });
    expect(blocks[2]).toEqual({ kind: "paragraph", text: "Done." });
  });
});
