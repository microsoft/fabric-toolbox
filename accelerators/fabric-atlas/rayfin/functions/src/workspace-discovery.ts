import {
  AudienceType,
  type RayfinContext,
} from "@microsoft/fabric-user-data-functions";
import type { AtlasSchema } from "../../data/schema.js";
import {
  requireAtlasSynchronizer,
  type SynchronizerGuardData,
} from "./synchronizer-gate.js";

const FABRIC_WORKSPACES_URL = "https://api.fabric.microsoft.com/v1/workspaces";
const MAX_DISCOVERY_PAGES = 50;
const MAX_DISCOVERED_WORKSPACES = 2_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_REQUEST_ATTEMPTS = 3;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DiscoveredWorkspace {
  id: string;
  displayName: string;
  workspaceType?: string;
  capacityId?: string;
}

export interface WorkspaceDiscoveryResult {
  contractVersion: 1;
  workspaces: DiscoveredWorkspace[];
  truncated: boolean;
}

type FetchLike = typeof fetch;

function boundedText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text && text.length <= max ? text : undefined;
}

function uuidText(value: unknown): string | undefined {
  const text = boundedText(value, 36);
  return text && UUID_PATTERN.test(text) ? text.toLowerCase() : undefined;
}

function workspaceUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Fabric workspace discovery returned an invalid continuation URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "api.fabric.microsoft.com" ||
    url.pathname !== "/v1/workspaces" ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error("Fabric workspace discovery returned an invalid continuation URL.");
  }
  return url.toString();
}

function retryDelayMs(response: Response, attempt: number): number {
  const raw = response.headers.get("retry-after");
  const seconds = raw == null ? Number.NaN : Number(raw);
  if (Number.isFinite(seconds)) {
    return Math.min(5_000, Math.max(0, seconds * 1_000));
  }
  const retryAt = raw ? Date.parse(raw) : Number.NaN;
  if (Number.isFinite(retryAt)) {
    return Math.min(5_000, Math.max(0, retryAt - Date.now()));
  }
  return Math.min(5_000, 500 * 2 ** attempt);
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchWorkspacePage(
  token: string,
  url: string,
  fetchImpl: FetchLike,
): Promise<Record<string, unknown>> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < MAX_REQUEST_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        redirect: "error",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      lastStatus = response.status;
      if (
        (response.status === 429 || response.status >= 500) &&
        attempt + 1 < MAX_REQUEST_ATTEMPTS
      ) {
        await response.body?.cancel();
        await delay(retryDelayMs(response, attempt));
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(
          `Fabric workspace discovery failed with HTTP ${response.status}.`,
        );
      }
      const contentLength = Number(response.headers.get("content-length"));
      if (
        Number.isFinite(contentLength) &&
        contentLength > MAX_RESPONSE_BYTES
      ) {
        await response.body?.cancel();
        throw new Error("Fabric workspace discovery response was too large.");
      }
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
        throw new Error("Fabric workspace discovery response was too large.");
      }
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
        throw new Error("Fabric workspace discovery returned an invalid response.");
      }
      return parsed as Record<string, unknown>;
    } catch (error) {
      if (
        attempt + 1 < MAX_REQUEST_ATTEMPTS &&
        ((error instanceof DOMException && error.name === "AbortError") ||
          error instanceof TypeError)
      ) {
        await delay(Math.min(5_000, 500 * 2 ** attempt));
        continue;
      }
      if (
        (error instanceof DOMException && error.name === "AbortError") ||
        error instanceof TypeError
      ) {
        throw new Error(
          "Fabric workspace discovery could not reach the Fabric API.",
        );
      }
      if (error instanceof SyntaxError) {
        throw new Error("Fabric workspace discovery returned invalid JSON.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(
    `Fabric workspace discovery failed with HTTP ${lastStatus || 503}.`,
  );
}

function sanitizeWorkspace(value: unknown): DiscoveredWorkspace {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error("Fabric workspace discovery returned an invalid workspace.");
  }
  const row = value as Record<string, unknown>;
  const id = uuidText(row.id);
  const displayName = boundedText(row.displayName, 200);
  const workspaceType = boundedText(row.type, 80);
  const capacityId =
    row.capacityId == null ? undefined : uuidText(row.capacityId);
  if (!id || !displayName || (row.capacityId != null && !capacityId)) {
    throw new Error("Fabric workspace discovery returned an invalid workspace.");
  }
  return {
    id,
    displayName,
    ...(workspaceType ? { workspaceType } : {}),
    ...(capacityId ? { capacityId } : {}),
  };
}

export async function authorizeWorkspaceDiscovery(
  data: SynchronizerGuardData,
): Promise<void> {
  await requireAtlasSynchronizer(
    data,
    "workspace discovery",
    "Workspace discovery requires the configured Atlas administrator.",
  );
}

export async function discoverFabricWorkspaces(
  token: string,
  fetchImpl: FetchLike = fetch,
): Promise<WorkspaceDiscoveryResult> {
  if (!token || /\s/.test(token)) {
    throw new Error("Fabric workspace discovery token was unavailable.");
  }

  const workspaces = new Map<string, DiscoveredWorkspace>();
  const visited = new Set<string>();
  let nextUrl: string | undefined = FABRIC_WORKSPACES_URL;
  let truncated = false;

  for (let page = 0; nextUrl && page < MAX_DISCOVERY_PAGES; page += 1) {
    const currentUrl = workspaceUrl(nextUrl);
    if (visited.has(currentUrl)) {
      throw new Error("Fabric workspace discovery repeated a continuation URL.");
    }
    visited.add(currentUrl);
    const payload = await fetchWorkspacePage(token, currentUrl, fetchImpl);
    if (!Array.isArray(payload.value)) {
      throw new Error("Fabric workspace discovery returned an invalid response.");
    }
    for (const value of payload.value) {
      const workspace = sanitizeWorkspace(value);
      workspaces.set(workspace.id, workspace);
      if (workspaces.size >= MAX_DISCOVERED_WORKSPACES) {
        truncated = true;
        break;
      }
    }
    if (truncated) break;
    const continuation = payload.continuationUri;
    if (continuation == null || continuation === "") {
      nextUrl = undefined;
    } else if (typeof continuation === "string") {
      nextUrl = continuation;
    } else {
      throw new Error("Fabric workspace discovery returned an invalid continuation URL.");
    }
  }

  if (nextUrl) truncated = true;

  return {
    contractVersion: 1,
    workspaces: [...workspaces.values()].sort(
      (left, right) =>
        left.displayName.localeCompare(right.displayName) ||
        left.id.localeCompare(right.id),
    ),
    truncated,
  };
}

export async function workspaceDiscover(
  ctx: RayfinContext<AtlasSchema, AudienceType.Fabric>,
): Promise<WorkspaceDiscoveryResult> {
  await authorizeWorkspaceDiscovery(ctx.getDataClient());
  return discoverFabricWorkspaces(ctx.Tokens.Fabric);
}
