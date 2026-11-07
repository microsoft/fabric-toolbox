// Client for the Atlas Scout Fabric Data Agent (OpenAI Assistants-compatible
// endpoint). v1 calls the agent with the signed-in user's delegated token and
// no row-level filtering: every synchronized workspace is visible.

const API_VERSION = "2024-05-01-preview";
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVE_RUN_STATUSES = new Set(["queued", "in_progress", "requires_action", "cancelling"]);

export interface ScoutEndpoint {
  workspaceId: string;
  agentId: string;
}

export interface ScoutEvidence {
  sql: string[];
  results: string[];
}

export interface ScoutAnswer {
  threadId: string;
  text: string;
  evidence: ScoutEvidence;
}

export class ScoutError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ScoutError";
  }
}

export function isScoutConfigured(endpoint: Partial<ScoutEndpoint>): endpoint is ScoutEndpoint {
  return GUID.test(endpoint.workspaceId ?? "") && GUID.test(endpoint.agentId ?? "");
}

export function scoutBaseUrl(endpoint: ScoutEndpoint): string {
  if (!isScoutConfigured(endpoint)) {
    throw new ScoutError("Atlas Scout is not configured.");
  }
  return `https://api.fabric.microsoft.com/v1/workspaces/${endpoint.workspaceId}/dataagents/${endpoint.agentId}/aiassistant/openai`;
}

export function scoutUrl(base: string, path: string, query: Record<string, string> = {}): string {
  const params = new URLSearchParams({ "api-version": API_VERSION, ...query });
  return `${base}${path}?${params.toString()}`;
}

interface MessageList {
  data?: Array<{
    role?: string;
    content?: Array<{ type?: string; text?: { value?: string } }>;
  }>;
}

/** Latest assistant answer from a messages list ordered newest first. */
export function extractAnswer(messages: MessageList): string {
  const latest = messages.data?.find((message) => message.role === "assistant");
  return (latest?.content ?? [])
    .map((part) => part.text?.value ?? "")
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

interface RunStepList {
  data?: Array<{
    step_details?: {
      tool_calls?: Array<{ function?: { name?: string; output?: string | null } }>;
    };
  }>;
}

/** Generated SQL and result tables of a run, in execution order. */
export function extractEvidence(steps: RunStepList): ScoutEvidence {
  const sql: string[] = [];
  const results: string[] = [];
  for (const step of [...(steps.data ?? [])].reverse()) {
    for (const call of step.step_details?.tool_calls ?? []) {
      const name = call.function?.name ?? "";
      const output = call.function?.output ?? "";
      if (!output) continue;
      if (name === "analyze.database.nl2code") {
        for (const match of output.matchAll(/```sql\s*([\s\S]*?)```/gi)) {
          const query = match[1].trim();
          if (query && !sql.includes(query)) sql.push(query);
        }
      } else if (name === "analyze.database.execute" && output.trim().startsWith("|")) {
        const table = output.trim();
        if (!results.includes(table)) results.push(table);
      }
    }
  }
  return { sql, results };
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type ScoutPhase = "connecting" | "thinking" | "querying" | "writing";

export interface ScoutClientOptions {
  endpoint: ScoutEndpoint;
  getToken: (signal?: AbortSignal) => Promise<string>;
  fetch?: FetchLike;
  wait?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

function abortableWait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    }, milliseconds);
    const cancel = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

const TRANSIENT_RUN_FAILURE = /run failed: .*(server_error|status code (NotFound|InternalServerError|BadGateway|ServiceUnavailable|GatewayTimeout))/i;

export function scoutErrorMessage(status: number, body: string): string {
  if (status === 401) return "Your session cannot call Atlas Scout. Sign in again and consent to DataAgent.Execute.All.";
  if (status === 403) return "You do not have access to the Atlas Scout Data Agent. Ask a workspace admin to share it with you.";
  if (status === 404) return "The Atlas Scout Data Agent was not found. Check that it is published in the configured workspace.";
  if (status === 429) return "Atlas Scout is throttled by Fabric capacity. Retry in a minute.";
  const detail = body.replace(/\s+/g, " ").trim().slice(0, 200);
  return `Atlas Scout request failed (${status})${detail ? `: ${detail}` : "."}`;
}

export function createScoutClient(options: ScoutClientOptions) {
  const base = scoutBaseUrl(options.endpoint);
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const wait = options.wait ?? abortableWait;
  const pollIntervalMs = options.pollIntervalMs ?? 1500;
  const timeoutMs = options.timeoutMs ?? 180_000;
  let assistantId: string | undefined;

  async function call<T>(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
    query?: Record<string, string>,
  ): Promise<T> {
    const token = await options.getToken(signal);
    const response = await doFetch(scoutUrl(base, path, query), {
      method,
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      throw new ScoutError(scoutErrorMessage(response.status, await response.text().catch(() => "")), response.status);
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  async function ask(
    question: string,
    threadId?: string,
    signal?: AbortSignal,
    onPhase?: (phase: ScoutPhase) => void,
  ): Promise<ScoutAnswer> {
    const content = question.trim();
    if (!content) throw new ScoutError("Ask Atlas Scout a question.");
    onPhase?.("connecting");
    assistantId ??= (await call<{ id: string }>("POST", "/assistants", { model: "not used" }, signal)).id;
    let thread = threadId ?? (await call<{ id: string }>("POST", "/threads", {}, signal)).id;
    for (let retry = 0; ; retry += 1) {
      let run: { id: string; status: string } | undefined;
      for (let attempt = 0; !run; attempt += 1) {
        try {
          await call("POST", `/threads/${thread}/messages`, { role: "user", content }, signal);
          run = await call<{ id: string; status: string }>(
            "POST",
            `/threads/${thread}/runs`,
            { assistant_id: assistantId },
            signal,
          );
        } catch (error) {
          // A stopped or stale run can stay active on a thread, even a brand new one handed back by the
          // service: cancel it and continue in a fresh thread.
          // A thread that expired or was cleaned up answers 404: continue in a fresh thread too.
          const active = error instanceof ScoutError ? /\b(run_[\w-]+)\b[^.]*\bis active/i.exec(error.message) : null;
          const vanished = error instanceof ScoutError && error.status === 404;
          if ((!active && !vanished) || attempt >= 2) throw error;
          const stale = thread;
          if (active) {
            void call("POST", `/threads/${stale}/runs/${active[1]}/cancel`)
              .catch(() => undefined)
              .then(() => endThread(stale));
          }
          if (attempt > 0) await wait(pollIntervalMs, signal);
          thread = (await call<{ id: string }>("POST", "/threads", {}, signal)).id;
        }
      }
      const cancelRun = () => {
        void call("POST", `/threads/${thread}/runs/${run.id}/cancel`).catch(() => undefined);
      };
      signal?.addEventListener("abort", cancelRun, { once: true });
      try {
        return await waitForAnswer(thread, run, signal, onPhase);
      } catch (error) {
        // The service sometimes loses its own tool call ("submit_tool_outputs ... NotFound"): ask once more.
        const transient = error instanceof ScoutError && TRANSIENT_RUN_FAILURE.test(error.message);
        if (!transient || retry > 0 || signal?.aborted) throw error;
        thread = (await call<{ id: string }>("POST", "/threads", {}, signal)).id;
      } finally {
        signal?.removeEventListener("abort", cancelRun);
      }
    }
  }

  async function waitForAnswer(
    thread: string,
    run: { id: string; status: string },
    signal?: AbortSignal,
    onPhase?: (phase: ScoutPhase) => void,
  ): Promise<ScoutAnswer> {
    onPhase?.("thinking");
    const deadline = Date.now() + timeoutMs;
    let polls = 0;
    let status = run.status;
    let failure: string | undefined;
    while (ACTIVE_RUN_STATUSES.has(status)) {
      if (Date.now() > deadline) {
        throw new ScoutError("Atlas Scout did not answer in time. Try a narrower question.");
      }
      await wait(pollIntervalMs, signal);
      const current = await call<{ status: string; last_error?: { message?: string } | null }>(
        "GET",
        `/threads/${thread}/runs/${run.id}`,
        undefined,
        signal,
      );
      status = current.status;
      polls += 1;
      if (polls === 2) onPhase?.("querying");
      failure = current.last_error?.message ?? undefined;
    }
    if (status !== "completed") {
      throw new ScoutError(`Atlas Scout run ${status}${failure ? `: ${failure}` : "."}`);
    }
    onPhase?.("writing");
    const messages = await call<MessageList>("GET", `/threads/${thread}/messages`, undefined, signal, { order: "desc" });
    let evidence: ScoutEvidence = { sql: [], results: [] };
    try {
      evidence = extractEvidence(
        await call<RunStepList>("GET", `/threads/${thread}/runs/${run.id}/steps`, undefined, signal),
      );
    } catch (error) {
      if (signal?.aborted) throw error;
    }
    return { threadId: thread, text: extractAnswer(messages) || "Atlas Scout returned no answer.", evidence };
  }

  async function endThread(threadId: string): Promise<void> {
    try {
      await call("DELETE", `/threads/${threadId}`);
    } catch {
      // Threads expire on their own; cleanup is best effort.
    }
  }

  return { ask, endThread };
}

export type ScoutClient = ReturnType<typeof createScoutClient>;
