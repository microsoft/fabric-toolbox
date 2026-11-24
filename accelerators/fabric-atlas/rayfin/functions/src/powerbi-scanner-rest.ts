import { ExecutionDeadline, RequestBudget } from "./fabric-rest.js";
import { strictUuid } from "./sync/protocol.js";

export const POWERBI_SCOPE = "https://analysis.windows.net/powerbi/api/.default";
export const POWERBI_ADMIN_ORIGIN = "https://api.powerbi.com";
const ADMIN = `${POWERBI_ADMIN_ORIGIN}/v1.0/myorg/admin/workspaces`;
const FLAGS = "lineage=true&getArtifactUsers=true&datasetSchema=true&datasetExpressions=true";
export const POWERBI_SCANNER_LIMITS = {
  executionBudgetMs: 150_000,
  requestTimeoutMs: 20_000,
  maxAttempts: 3,
  maxRetryAfterMs: 5_000,
  maxRequests: 100,
  maxPolls: 30,
  pollDelayMs: 2_000,
  maxControlBytes: 64 * 1024,
  maxResultBytes: 16 * 1024 * 1024,
  maxEnvelopeBytes: 20 * 1024 * 1024,
  maxItems: 2_000,
  maxProjectedObjects: 20_000,
} as const;
export type ScannerLimits = { [Key in keyof typeof POWERBI_SCANNER_LIMITS]: number };
export type ScannerDependencies = {
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  signal?: AbortSignal;
  limits?: Partial<ScannerLimits>;
};
export type ScannerTransportCode =
  | "deadline-exhausted" | "request-timeout" | "request-budget-exhausted" | "cancelled"
  | "response-size-exceeded" | "redirect-rejected" | "invalid-response"
  | "oauth-credentials-rejected" | "oauth-response-invalid"
  | "tenant-admin-settings-required" | "rate-limited" | "retry-after-deferred"
  | "upstream-unreachable" | "upstream-failure" | "scan-start-outcome-unknown"
  | "scan-failed" | "scan-incomplete";
export class ScannerTransportError extends Error {
  constructor(readonly code: ScannerTransportCode) {
    super(`Power BI scanner request failed (${code}).`);
  }
}
export type ScannerCredentials = { tenantId: string; clientId: string; clientSecret: string };
type Target = "oauth" | "start" | "status" | "result";
type Json = Record<string, unknown>;

function discard(response: Response): void {
  void response.body?.cancel().catch(() => undefined);
}
async function boundedJson(response: Response, maxBytes: number): Promise<Json> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await discard(response);
    throw new ScannerTransportError("response-size-exceeded");
  }
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader) {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > maxBytes) throw new ScannerTransportError("response-size-exceeded");
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      throw error;
    } finally { reader.releaseLock(); }
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Json;
  } catch { throw new ScannerTransportError("invalid-response"); }
}

/** Fixed public OAuth/scanner targets only; credentials and provider errors stay private. */
export class PowerBiScannerRest {
  readonly #fetch: typeof fetch;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  readonly #credentials: ScannerCredentials;
  readonly #signal?: AbortSignal;
  readonly #budget: RequestBudget;
  #token = "";
  readonly deadline: ExecutionDeadline;
  readonly limits: ScannerLimits;

  constructor(credentials: ScannerCredentials, dependencies: ScannerDependencies = {}) {
    this.#credentials = {
      tenantId: strictUuid(credentials.tenantId),
      clientId: strictUuid(credentials.clientId),
      clientSecret: credentials.clientSecret,
    };
    this.limits = { ...POWERBI_SCANNER_LIMITS, ...dependencies.limits };
    this.deadline = new ExecutionDeadline(this.limits.executionBudgetMs, dependencies.now);
    this.#budget = new RequestBudget(this.limits.maxRequests);
    this.#fetch = dependencies.fetch ?? fetch;
    this.#sleep = dependencies.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.#signal = dependencies.signal;
  }
  async authenticate(): Promise<void> {
    const result = await this.#request("oauth");
    if (
      typeof result.access_token !== "string" || !result.access_token ||
      result.access_token.length > 32_768 || /\s/.test(result.access_token) ||
      typeof result.token_type !== "string" || result.token_type.toLowerCase() !== "bearer" ||
      !Number.isSafeInteger(result.expires_in) ||
      (result.expires_in as number) < Math.ceil(this.deadline.remaining() / 1_000) + 30
    ) throw new ScannerTransportError("oauth-response-invalid");
    this.#token = result.access_token;
  }
  async scan(workspaceId: string): Promise<Json> {
    const start = await this.#request("start", strictUuid(workspaceId));
    let scanId: string;
    try { scanId = strictUuid(start.id); } catch { throw new ScannerTransportError("invalid-response"); }
    for (let poll = 0; poll < this.limits.maxPolls; poll++) {
      await this.#wait(this.limits.pollDelayMs);
      const status = await this.#request("status", scanId);
      if (status.id !== undefined) {
        try { if (strictUuid(status.id) !== scanId) throw new Error(); }
        catch { throw new ScannerTransportError("invalid-response"); }
      }
      if (status.status === "Succeeded") return this.#request("result", scanId);
      if (status.status === "Failed") throw new ScannerTransportError("scan-failed");
      if (status.status !== "NotStarted" && status.status !== "Running") {
        throw new ScannerTransportError("invalid-response");
      }
    }
    throw new ScannerTransportError("scan-incomplete");
  }
  assertSafeOutput(value: unknown): void {
    const json = JSON.stringify(value);
    for (const secret of [this.#credentials.clientSecret, this.#token]) {
      if (secret && (json.includes(secret) || json.includes(JSON.stringify(secret).slice(1, -1)))) {
        throw new ScannerTransportError("invalid-response");
      }
    }
    if (new TextEncoder().encode(json).byteLength > this.limits.maxEnvelopeBytes) {
      throw new ScannerTransportError("response-size-exceeded");
    }
    if (this.deadline.remaining() <= 0) throw new ScannerTransportError("deadline-exhausted");
  }
  #cancelled(): void {
    if (this.#signal?.aborted) throw new ScannerTransportError("cancelled");
  }
  async #wait(milliseconds: number): Promise<void> {
    this.#cancelled();
    if (milliseconds >= this.deadline.remaining()) throw new ScannerTransportError("deadline-exhausted");
    await this.#sleep(milliseconds);
    this.#cancelled();
  }
  async #request(target: Target, id?: string): Promise<Json> {
    const url = target === "oauth"
      ? `https://login.microsoftonline.com/${this.#credentials.tenantId}/oauth2/v2.0/token`
      : target === "start" ? `${ADMIN}/getInfo?${FLAGS}` : `${ADMIN}/${target === "status" ? "scanStatus" : "scanResult"}/${id}`;
    if (target !== "oauth" && !this.#token) throw new ScannerTransportError("oauth-response-invalid");
    for (let attempt = 0; attempt < this.limits.maxAttempts; attempt++) {
      this.#cancelled();
      if (this.#budget.remaining === 0) throw new ScannerTransportError("request-budget-exhausted");
      this.#budget.take();
      const remaining = this.deadline.remaining();
      if (remaining <= 0) throw new ScannerTransportError("deadline-exhausted");
      const timeout = Math.min(remaining, this.limits.requestTimeoutMs);
      const controller = new AbortController();
      let rejectBound: (error: ScannerTransportError) => void = () => undefined;
      const bound = new Promise<never>((_resolve, reject) => { rejectBound = reject; });
      const abort = () => {
        controller.abort();
        rejectBound(new ScannerTransportError("cancelled"));
      };
      this.#signal?.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(() => {
        controller.abort();
        rejectBound(new ScannerTransportError(remaining <= this.limits.requestTimeoutMs ? "deadline-exhausted" : "request-timeout"));
      }, timeout);
      let retryDelay: number | undefined;
      try {
        const response = await Promise.race([this.#fetch(url, {
          method: target === "oauth" || target === "start" ? "POST" : "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: target === "oauth"
            ? { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }
            : { Authorization: `Bearer ${this.#token}`, Accept: "application/json",
              ...(target === "start" ? { "Content-Type": "application/json" } : {}) },
          body: target === "oauth" ? new URLSearchParams({
            client_id: this.#credentials.clientId, client_secret: this.#credentials.clientSecret,
            grant_type: "client_credentials", scope: POWERBI_SCOPE,
          }).toString() : target === "start" ? JSON.stringify({ workspaces: [id] }) : undefined,
        }), bound]);
        const rejectResponse = async (code: ScannerTransportCode): Promise<never> => {
          await discard(response);
          throw new ScannerTransportError(code);
        };
        if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
          return rejectResponse("redirect-rejected");
        }
        if (response.status === 401 || response.status === 403 || (target === "oauth" && response.status === 400)) {
          return rejectResponse(target === "oauth" ? "oauth-credentials-rejected" : "tenant-admin-settings-required");
        }
        if (response.status === 429 || response.status >= 500) {
          await discard(response);
          if (target === "start" && response.status !== 429) throw new ScannerTransportError("scan-start-outcome-unknown");
          if (attempt + 1 >= this.limits.maxAttempts) {
            throw new ScannerTransportError(response.status === 429 ? "rate-limited" : "upstream-failure");
          }
          const header = response.headers.get("retry-after");
          const seconds = header === null ? undefined : Number(header);
          const date = header === null ? NaN : Date.parse(header);
          retryDelay = seconds !== undefined && Number.isFinite(seconds) && seconds >= 0
            ? seconds * 1_000 : Number.isFinite(date) ? Math.max(0, date - Date.now()) : 500 * 2 ** attempt;
          if (retryDelay > this.limits.maxRetryAfterMs) throw new ScannerTransportError("retry-after-deferred");
        } else if (response.status !== (target === "start" ? 202 : 200)) {
          return rejectResponse("upstream-failure");
        } else {
          return await Promise.race([
            boundedJson(response, target === "result" ? this.limits.maxResultBytes : this.limits.maxControlBytes), bound,
          ]);
        }
      } catch (error) {
        if (error instanceof ScannerTransportError) throw error;
        this.#cancelled();
        if (controller.signal.aborted) throw new ScannerTransportError("request-timeout");
        if (target === "start") throw new ScannerTransportError("scan-start-outcome-unknown");
        if (attempt + 1 >= this.limits.maxAttempts) throw new ScannerTransportError("upstream-unreachable");
        retryDelay = 500 * 2 ** attempt;
      } finally {
        clearTimeout(timer);
        this.#signal?.removeEventListener("abort", abort);
      }
      await this.#wait(retryDelay ?? 0);
    }
    throw new ScannerTransportError("upstream-failure");
  }
}
