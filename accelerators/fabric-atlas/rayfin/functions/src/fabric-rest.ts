/**
 * Bounded Fabric REST client for server-side Atlas collectors.
 *
 * Requests only target fixed `https://api.fabric.microsoft.com/v1/...` paths,
 * never follow redirects and surface fixed, credential-free error codes. The
 * bearer token stays in a private field and never appears in errors or logs.
 */

export const FABRIC_API_ORIGIN = "https://api.fabric.microsoft.com";
const FABRIC_API_HOST = "api.fabric.microsoft.com";
const FABRIC_PATH = /^\/v1(?:\/[A-Za-z0-9_-]+)+$/;
const MAX_CONTINUATION_URL_LENGTH = 8_192;
const MAX_BACKOFF_MS = 5_000;

export const FABRIC_REST_DEFAULTS = {
  requestTimeoutMs: 20_000,
  maxAttempts: 3,
  maxRetryAfterMs: 10_000,
  maxResponseBytes: 4 * 1024 * 1024,
} as const;

export type FabricRestErrorCode =
  | "deadline-exhausted"
  | "request-timeout"
  | "retry-after-deferred"
  | "response-size-exceeded"
  | "pagination-invalid"
  | "page-limit-exceeded"
  | "record-limit-exceeded"
  | "request-budget-exhausted"
  | "redirect-rejected"
  | "upstream-unreachable"
  | "upstream-http-error"
  | "invalid-response"
  | "cancelled"
  | "operation-failed"
  | "operation-incomplete";

export type FabricSafeErrorCode =
  | Exclude<FabricRestErrorCode, "upstream-http-error">
  | "encrypted-label-blocked"
  | "endpoint-unsupported"
  | "authorization-failed"
  | "rate-limited"
  | "transient-upstream"
  | "upstream-http-error"
  | "upstream-failure";

export class FabricRestError extends Error {
  constructor(
    readonly code: FabricRestErrorCode,
    readonly status?: number,
  ) {
    super(
      status == null
        ? `Fabric REST request failed (${code}).`
        : `Fabric REST request failed (${code}, HTTP ${status}).`,
    );
    this.name = "FabricRestError";
  }
}

/** Maps any collector failure to the fixed code vocabulary of the Python UDF. */
export function fabricSafeErrorCode(
  error: unknown,
  optional = false,
): FabricSafeErrorCode {
  if (!(error instanceof FabricRestError)) return "upstream-failure";
  if (error.code !== "upstream-http-error") return error.code;
  const status = error.status ?? 0;
  if (status === 423) return "encrypted-label-blocked";
  if (optional && (status === 400 || status === 404)) {
    return "endpoint-unsupported";
  }
  if (status === 401 || status === 403) return "authorization-failed";
  if (status === 429) return "rate-limited";
  if (status >= 500 && status <= 599) return "transient-upstream";
  return "upstream-http-error";
}

/** One monotonic budget shared by every request, retry, sleep and body read. */
export class ExecutionDeadline {
  private readonly expiresAt: number;

  constructor(
    budgetMs: number,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.expiresAt = now() + budgetMs;
  }

  remaining(): number {
    return this.expiresAt - this.now();
  }

  requestTimeout(maxMs: number): number {
    const remaining = this.remaining();
    if (remaining <= 0) throw new FabricRestError("deadline-exhausted");
    return Math.min(maxMs, remaining);
  }
}

/** Counts HTTP attempts, including retries and continuation pages. */
export class RequestBudget {
  private used = 0;

  constructor(readonly limit: number) {}

  get remaining(): number {
    return Math.max(0, this.limit - this.used);
  }

  take(): void {
    if (this.used >= this.limit) {
      throw new FabricRestError("request-budget-exhausted");
    }
    this.used += 1;
  }
}

export interface FabricRestOptions {
  deadline: ExecutionDeadline;
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  /** Caller cancellation; aborts in-flight requests without retrying. */
  signal?: AbortSignal;
  requestTimeoutMs?: number;
  maxAttempts?: number;
  maxRetryAfterMs?: number;
  maxResponseBytes?: number;
}

export interface FabricListLimits {
  maxPages: number;
  maxRecords: number;
  /** Stop paging once this many records are collected. */
  stopAfter?: number;
}

export interface FabricLongRunningLimits {
  maxPolls: number;
  minPollDelayMs: number;
  maxPollDelayMs: number;
  maxResponseBytes?: number;
}

/**
 * Fixed, allowlisted Fabric query parameters. Callers can only opt into known
 * flags; arbitrary query keys or values are not representable.
 */
export type FabricQuery = Readonly<{
  beta?: true;
  type?: "Report" | "SemanticModel";
  format?: "TMSL";
  maxResults?: 100;
}>;

export interface FabricPagedOptions {
  query?: FabricQuery;
  maxPages: number;
  maxResponseBytes?: number;
}

interface FabricResponse {
  status: number;
  headers: Headers;
  body?: Record<string, unknown>;
}

interface FabricSendOptions {
  method: "GET" | "POST";
  maxResponseBytes?: number;
  /** Return 202 Accepted headers without reading the body. */
  accepted?: boolean;
  /** Serialized JSON request body; retries resend the same body. */
  body?: string;
}

function allowlistedQuery(query: FabricQuery | undefined): URLSearchParams {
  const params = new URLSearchParams();
  if (!query) return params;
  if (Object.keys(query).some((key) => !["beta", "type", "format", "maxResults"].includes(key))) {
    throw new FabricRestError("invalid-response");
  }
  if (query.beta !== undefined) {
    if (query.beta !== true) throw new FabricRestError("invalid-response");
    params.set("beta", "true");
  }
  if (query.type !== undefined) {
    if (query.type !== "Report" && query.type !== "SemanticModel") {
      throw new FabricRestError("invalid-response");
    }
    params.set("type", query.type);
  }
  if (query.format !== undefined) {
    if (query.format !== "TMSL") throw new FabricRestError("invalid-response");
    params.set("format", query.format);
  }
  if (query.maxResults !== undefined) {
    if (query.maxResults !== 100) throw new FabricRestError("invalid-response");
    params.set("maxResults", String(query.maxResults));
  }
  return params;
}

export function fabricApiUrl(path: string, query?: FabricQuery): string {
  if (!FABRIC_PATH.test(path)) {
    throw new FabricRestError("invalid-response");
  }
  const params = allowlistedQuery(query).toString();
  return `${FABRIC_API_ORIGIN}${path}${params ? `?${params}` : ""}`;
}

/**
 * Validates a continuation that must keep the original fixed path and
 * allowlisted query. Only `continuationToken` may be added, and the URL is
 * rebuilt locally rather than sending the server-provided string.
 */
function allowlistedContinuationUrl(
  uri: unknown,
  token: unknown,
  expectedPath: string,
  query: FabricQuery | undefined,
): string | undefined {
  const expected = allowlistedQuery(query);
  let continuationToken: string | undefined;
  if (typeof uri === "string" && uri !== "") {
    let url: URL;
    try {
      url = new URL(uri);
    } catch {
      throw new FabricRestError("pagination-invalid");
    }
    const keys = [...url.searchParams.keys()];
    if (
      uri.length > MAX_CONTINUATION_URL_LENGTH ||
      url.protocol !== "https:" ||
      url.hostname.toLowerCase() !== FABRIC_API_HOST ||
      url.port !== "" ||
      url.username ||
      url.password ||
      url.hash ||
      url.pathname.toLowerCase() !== expectedPath.toLowerCase() ||
      new Set(keys).size !== keys.length ||
      [...expected.keys()].some((key) => !url.searchParams.has(key))
    ) {
      throw new FabricRestError("pagination-invalid");
    }
    for (const [key, value] of url.searchParams) {
      if (key === "continuationToken") continuationToken = value;
      else if (expected.get(key)?.toLowerCase() !== value.toLowerCase()) {
        throw new FabricRestError("pagination-invalid");
      }
    }
    if (!continuationToken) throw new FabricRestError("pagination-invalid");
  } else if (uri != null && uri !== "") {
    throw new FabricRestError("pagination-invalid");
  } else if (typeof token === "string" && token !== "") {
    continuationToken = token;
  } else if (token != null && token !== "") {
    throw new FabricRestError("pagination-invalid");
  }
  if (continuationToken === undefined) return undefined;
  if (continuationToken.length > MAX_CONTINUATION_URL_LENGTH) {
    throw new FabricRestError("pagination-invalid");
  }
  const url = new URL(fabricApiUrl(expectedPath, query));
  url.searchParams.set("continuationToken", continuationToken);
  return url.toString();
}

function continuationUrl(
  uri: unknown,
  token: unknown,
  expectedPath: string,
): string | undefined {
  if (typeof uri === "string" && uri !== "") {
    let url: URL;
    try {
      url = new URL(uri);
    } catch {
      throw new FabricRestError("pagination-invalid");
    }
    if (
      uri.length > MAX_CONTINUATION_URL_LENGTH ||
      url.protocol !== "https:" ||
      url.hostname.toLowerCase() !== FABRIC_API_HOST ||
      url.port !== "" ||
      url.username ||
      url.password ||
      url.hash ||
      url.pathname.toLowerCase() !== expectedPath.toLowerCase()
    ) {
      throw new FabricRestError("pagination-invalid");
    }
    return url.toString();
  }
  if (uri != null && uri !== "") throw new FabricRestError("pagination-invalid");
  if (typeof token === "string" && token !== "") {
    if (token.length > MAX_CONTINUATION_URL_LENGTH) {
      throw new FabricRestError("pagination-invalid");
    }
    const url = new URL(fabricApiUrl(expectedPath));
    url.searchParams.set("continuationToken", token);
    return url.toString();
  }
  if (token != null && token !== "") throw new FabricRestError("pagination-invalid");
  return undefined;
}

function parseRetryAfterMs(value: string | null): number | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text) * 1_000;
  const retryAt = Date.parse(text);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - Date.now()) : undefined;
}

const OPERATION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reads the LRO identifier from `x-ms-operation-id` or the last `Location`
 * path segment. The Location URL itself is never requested.
 */
function operationIdFrom(headers: Headers): string {
  let candidate = headers.get("x-ms-operation-id")?.trim();
  if (!candidate) {
    const location = headers.get("location")?.trim();
    if (location && location.length <= MAX_CONTINUATION_URL_LENGTH) {
      try {
        candidate = new URL(location).pathname.replace(/\/+$/, "").split("/").pop();
      } catch {
        candidate = undefined;
      }
    }
  }
  if (!candidate || !OPERATION_ID.test(candidate)) {
    throw new FabricRestError("invalid-response");
  }
  return candidate.toLowerCase();
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The body is never read after a rejected status.
  }
}

async function readBoundedText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await discardBody(response);
    throw new FabricRestError("response-size-exceeded");
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new FabricRestError("response-size-exceeded");
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new FabricRestError("invalid-response");
  }
}

function parseObject(text: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new FabricRestError("invalid-response");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new FabricRestError("invalid-response");
  }
  return parsed as Record<string, unknown>;
}

export class FabricRestClient {
  readonly #token: string;
  readonly #deadline: ExecutionDeadline;
  readonly #fetch: typeof fetch;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  readonly #requestTimeoutMs: number;
  readonly #maxAttempts: number;
  readonly #maxRetryAfterMs: number;
  readonly #maxResponseBytes: number;
  readonly #signal?: AbortSignal;

  constructor(token: string, options: FabricRestOptions) {
    this.#token = token;
    this.#deadline = options.deadline;
    this.#signal = options.signal;
    this.#fetch = options.fetch ?? fetch;
    this.#sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.#requestTimeoutMs =
      options.requestTimeoutMs ?? FABRIC_REST_DEFAULTS.requestTimeoutMs;
    this.#maxAttempts = options.maxAttempts ?? FABRIC_REST_DEFAULTS.maxAttempts;
    this.#maxRetryAfterMs =
      options.maxRetryAfterMs ?? FABRIC_REST_DEFAULTS.maxRetryAfterMs;
    this.#maxResponseBytes =
      options.maxResponseBytes ?? FABRIC_REST_DEFAULTS.maxResponseBytes;
  }

  /** GET one fixed Fabric resource and return its JSON object. */
  async getObject(
    path: string,
    budget?: RequestBudget,
    query?: FabricQuery,
  ): Promise<Record<string, unknown>> {
    return this.#request(fabricApiUrl(path, query), budget);
  }

  /**
   * GET a fixed path with an allowlisted query and follow strictly validated
   * continuations. Returns the raw page objects; callers own their schema.
   */
  async getPaged(
    path: string,
    options: FabricPagedOptions,
    budget?: RequestBudget,
  ): Promise<Record<string, unknown>[]> {
    const pages: Record<string, unknown>[] = [];
    const visited = new Set<string>();
    let next: string | undefined = fabricApiUrl(path, options.query);
    for (let page = 0; next; page += 1) {
      if (page >= options.maxPages) {
        throw new FabricRestError("page-limit-exceeded");
      }
      if (visited.has(next)) throw new FabricRestError("pagination-invalid");
      visited.add(next);
      const payload = await this.#request(next, budget, options.maxResponseBytes);
      pages.push(payload);
      next = allowlistedContinuationUrl(
        payload.continuationUri,
        payload.continuationToken,
        path,
        options.query,
      );
    }
    return pages;
  }

  /**
   * POST one fixed Fabric read action and resolve a 200 response or
   * a 202 long-running operation. Polls only the canonical
   * `/v1/operations/{id}` endpoint and never follows the returned Location.
   */
  async postLongRunning(
    path: string,
    limits: FabricLongRunningLimits,
    budget?: RequestBudget,
    query?: FabricQuery,
    body?: Readonly<Record<string, unknown>>,
  ): Promise<Record<string, unknown>> {
    const first = await this.#send(fabricApiUrl(path, query), budget, {
      method: "POST",
      maxResponseBytes: limits.maxResponseBytes,
      accepted: true,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (first.status !== 202) return first.body as Record<string, unknown>;
    const operationId = operationIdFrom(first.headers);
    let headers = first.headers;
    for (let poll = 0; poll < limits.maxPolls; poll += 1) {
      await this.#wait(this.#pollDelay(headers, limits));
      const state = await this.#send(
        fabricApiUrl(`/v1/operations/${operationId}`),
        budget,
        { method: "GET" },
      );
      const status = state.status === 200 ? state.body?.status : undefined;
      if (status === "Succeeded") {
        return this.#request(
          fabricApiUrl(`/v1/operations/${operationId}/result`),
          budget,
          limits.maxResponseBytes,
        );
      }
      if (status === "Failed") throw new FabricRestError("operation-failed");
      if (status !== "NotStarted" && status !== "Running") {
        throw new FabricRestError("invalid-response");
      }
      headers = state.headers;
    }
    throw new FabricRestError("operation-incomplete");
  }

  /**
   * POST a JSON body to one fixed Fabric path and return its JSON object.
   * Reserved for read-only query actions such as Catalog Search, because
   * throttling and transport retries resend the same body.
   */
  async postJson(
    path: string,
    body: Readonly<Record<string, unknown>>,
    budget?: RequestBudget,
    maxResponseBytes?: number,
  ): Promise<Record<string, unknown>> {
    const response = await this.#send(fabricApiUrl(path), budget, {
      method: "POST",
      body: JSON.stringify(body),
      maxResponseBytes,
    });
    return response.body as Record<string, unknown>;
  }

  /** GET a paginated Fabric `value` list from one fixed path. */
  async list(
    path: string,
    limits: FabricListLimits,
    budget?: RequestBudget,
  ): Promise<unknown[]> {
    const records: unknown[] = [];
    const visited = new Set<string>();
    let next: string | undefined = fabricApiUrl(path);
    for (let page = 0; next; page += 1) {
      if (page >= limits.maxPages) {
        throw new FabricRestError("page-limit-exceeded");
      }
      if (visited.has(next)) throw new FabricRestError("pagination-invalid");
      visited.add(next);
      const payload = await this.#request(next, budget);
      if (!Array.isArray(payload.value)) {
        throw new FabricRestError("invalid-response");
      }
      for (const value of payload.value) {
        records.push(value);
        if (limits.stopAfter != null && records.length >= limits.stopAfter) {
          return records;
        }
        if (records.length > limits.maxRecords) {
          throw new FabricRestError("record-limit-exceeded");
        }
      }
      next = continuationUrl(
        payload.continuationUri,
        payload.continuationToken,
        path,
      );
    }
    return records;
  }

  #retryDelay(response: Response, attempt: number): number {
    const delay =
      parseRetryAfterMs(response.headers.get("retry-after")) ??
      Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt);
    if (delay > this.#maxRetryAfterMs || delay >= this.#deadline.remaining()) {
      throw new FabricRestError("retry-after-deferred", response.status);
    }
    return delay;
  }

  #transportRetryDelay(attempt: number, code: FabricRestErrorCode): number {
    const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt);
    if (this.#deadline.remaining() <= 0) {
      throw new FabricRestError("deadline-exhausted");
    }
    if (attempt + 1 >= this.#maxAttempts) throw new FabricRestError(code);
    if (delay >= this.#deadline.remaining()) {
      throw new FabricRestError("deadline-exhausted");
    }
    return delay;
  }

  #pollDelay(headers: Headers, limits: FabricLongRunningLimits): number {
    const hinted = parseRetryAfterMs(headers.get("retry-after")) ?? 0;
    // LRO Retry-After is a polling hint; cap it so one item cannot consume the batch.
    return Math.min(limits.maxPollDelayMs, Math.max(limits.minPollDelayMs, hinted));
  }

  #throwIfCancelled(): void {
    if (this.#signal?.aborted) throw new FabricRestError("cancelled");
  }

  async #wait(milliseconds: number): Promise<void> {
    this.#throwIfCancelled();
    if (milliseconds >= this.#deadline.remaining()) {
      throw new FabricRestError("deadline-exhausted");
    }
    await this.#sleep(milliseconds);
    this.#throwIfCancelled();
  }

  async #request(
    url: string,
    budget?: RequestBudget,
    maxResponseBytes?: number,
  ): Promise<Record<string, unknown>> {
    const response = await this.#send(url, budget, {
      method: "GET",
      maxResponseBytes,
    });
    return response.body as Record<string, unknown>;
  }

  async #send(
    url: string,
    budget: RequestBudget | undefined,
    options: FabricSendOptions,
  ): Promise<FabricResponse> {
    for (let attempt = 0; attempt < this.#maxAttempts; attempt += 1) {
      this.#throwIfCancelled();
      budget?.take();
      const timeoutMs = this.#deadline.requestTimeout(this.#requestTimeoutMs);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const cancel = () => controller.abort();
      this.#signal?.addEventListener("abort", cancel, { once: true });
      let delay: number;
      try {
        const response = await this.#fetch(url, {
          method: options.method,
          redirect: "manual",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${this.#token}`,
            Accept: "application/json",
            ...(options.body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
          },
          ...(options.body === undefined ? {} : { body: options.body }),
        });
        if (
          response.type === "opaqueredirect" ||
          (response.status >= 300 && response.status < 400)
        ) {
          await discardBody(response);
          throw new FabricRestError("redirect-rejected", response.status);
        }
        if (
          response.status === 429 ||
          (response.status >= 500 && response.status <= 599)
        ) {
          await discardBody(response);
          if (attempt + 1 >= this.#maxAttempts) {
            throw new FabricRestError("upstream-http-error", response.status);
          }
          delay = this.#retryDelay(response, attempt);
        } else if (!response.ok) {
          await discardBody(response);
          throw new FabricRestError("upstream-http-error", response.status);
        } else if (response.status === 202 && options.accepted) {
          await discardBody(response);
          return { status: 202, headers: response.headers };
        } else {
          return {
            status: response.status,
            headers: response.headers,
            body: parseObject(
              await readBoundedText(
                response,
                options.maxResponseBytes ?? this.#maxResponseBytes,
              ),
            ),
          };
        }
      } catch (error) {
        if (error instanceof FabricRestError) throw error;
        if (isAbortError(error) && this.#signal?.aborted) {
          throw new FabricRestError("cancelled");
        }
        if (isAbortError(error)) {
          delay = this.#transportRetryDelay(attempt, "request-timeout");
        } else if (error instanceof TypeError) {
          delay = this.#transportRetryDelay(attempt, "upstream-unreachable");
        } else {
          throw new FabricRestError("invalid-response");
        }
      } finally {
        clearTimeout(timer);
        this.#signal?.removeEventListener("abort", cancel);
      }
      await this.#wait(delay);
    }
    throw new FabricRestError("upstream-unreachable");
  }
}
