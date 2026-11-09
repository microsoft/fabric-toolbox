import type { AppFunctionsSchema } from "../../rayfin/functions/src/types";
import { configuredSyncWriters } from "./config";
import {
  connectionStoreApi,
  persistConnectionInventory,
  recordConnectionAttempt,
  type ConnectionStoreApi,
} from "./connection-inventory-store";
import { parseConnectionEnvelope, type ConnectionInventoryView } from "./connections";
import { acquireGovernanceToken, assertSyncActive, type SyncIdentity } from "./live-sync";

type CollectConnections = (
  input: AppFunctionsSchema["tenantCollectConnections"]["input"],
  options?: { timeoutMs?: number },
) => Promise<AppFunctionsSchema["tenantCollectConnections"]["output"]>;

export interface TenantConnectionSyncDependencies {
  collect?: CollectConnections;
  store?: ConnectionStoreApi | null;
  token?: () => Promise<string | undefined>;
  timeoutMs?: number;
}

export type TenantConnectionSyncResult =
  | { status: "stored"; inventory: ConnectionInventoryView }
  | {
      status: "skipped";
      reason: "not-deployed" | "not-synchronizer" | "invalid-response" | "unsupported" | "failed";
      code?: string;
      /** Short error text for the administrator; tokens are removed. */
      message?: string;
      /** False when no delegated Fabric token could be obtained for the admin API. */
      delegated?: boolean;
    };

const TOKEN_LIKE = /[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

/** Error text safe to show and store: no token, one line, bounded. */
export function connectionErrorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(TOKEN_LIKE, "[token]").replace(/\s+/g, " ").trim().slice(0, 240) || "Unknown error";
}

async function recordAttempt(
  store: ConnectionStoreApi,
  writerEmail: string,
  status: "unsupported" | "failed",
  code: string | undefined,
  collectedAt = new Date().toISOString(),
): Promise<void> {
  try {
    await recordConnectionAttempt(store, { collectedAt, status, ...(code ? { code } : {}) }, writerEmail);
  } catch (error) {
    console.warn("[atlas] connection collection attempt not recorded", { message: connectionErrorText(error) });
  }
}

function synchronizerEmail(identity: SyncIdentity): string | undefined {
  const subject = identity.id?.trim();
  return subject ? configuredSyncWriters().find((writer) => writer.subject === subject)?.email : undefined;
}

async function rayfinDependencies(): Promise<{ collect?: CollectConnections; store?: ConnectionStoreApi }> {
  const { getRayfinClient } = await import("@/lib/rayfin-client");
  const client = getRayfinClient() as unknown as {
    functions?: Record<string, { invoke?: CollectConnections } | undefined>;
    data?: unknown;
  };
  const target = client.functions?.tenantCollectConnections;
  return {
    ...(target?.invoke ? { collect: target.invoke.bind(target) as CollectConnections } : {}),
    ...(connectionStoreApi(client.data) ? { store: connectionStoreApi(client.data) } : {}),
  };
}

/**
 * Tenant stage of a synchronization batch: collects the connection inventory
 * once and stores it. It never fails the batch; workspaces still synchronize
 * when the Function or the entities are missing or the call fails.
 */
export async function syncTenantConnections(
  identity: SyncIdentity,
  correlationId: string,
  progress?: (stage: string) => void,
  signal?: AbortSignal,
  dependencies: TenantConnectionSyncDependencies = {},
): Promise<TenantConnectionSyncResult> {
  const writerEmail = synchronizerEmail(identity);
  if (!writerEmail) return { status: "skipped", reason: "not-synchronizer" };
  const defaults = dependencies.collect && dependencies.store !== undefined ? {} : await rayfinDependencies();
  const collect = dependencies.collect ?? defaults.collect;
  const store = dependencies.store !== undefined ? dependencies.store : defaults.store;
  if (!collect || !store) return { status: "skipped", reason: "not-deployed" };

  progress?.("Collecting tenant connections");
  const token = await (dependencies.token ?? (() => acquireGovernanceToken(identity, signal)))();
  assertSyncActive(signal);
  const delegated = !!token;
  let output: unknown;
  try {
    output = await collect(
      { protocolVersion: 1, correlationId, delegatedToken: token ?? null },
      { timeoutMs: dependencies.timeoutMs ?? 180_000 },
    );
  } catch (error) {
    assertSyncActive(signal);
    const message = connectionErrorText(error);
    console.warn("[atlas] tenant connection inventory unavailable", { message, delegated });
    await recordAttempt(store, writerEmail, "failed", "invoke-failed");
    return { status: "skipped", reason: "failed", code: "invoke-failed", message, delegated };
  }
  assertSyncActive(signal);
  const inventory = parseConnectionEnvelope(output);
  if (!inventory) {
    await recordAttempt(store, writerEmail, "failed", "invalid-response");
    return { status: "skipped", reason: "invalid-response", code: "invalid-response", delegated };
  }
  // A refused or failed collection stores a manifest without rows: it explains the
  // empty page after a reload and never hides the last complete inventory.
  if (inventory.status !== "complete") {
    console.warn("[atlas] tenant connection inventory refused", { code: inventory.code, delegated });
    await recordAttempt(store, writerEmail, inventory.status, inventory.code, inventory.collectedAt);
    return {
      status: "skipped",
      reason: inventory.status,
      ...(inventory.code ? { code: inventory.code } : {}),
      delegated,
    };
  }
  try {
    const result = await persistConnectionInventory(store, inventory, writerEmail, {
      signal,
      progress: (written, total) => progress?.(`Storing tenant connections (${written}/${total})`),
    });
    if (result.retentionWarning) console.warn("[atlas] connection inventory retention incomplete");
    return { status: "stored", inventory: result.inventory };
  } catch (error) {
    assertSyncActive(signal);
    const message = connectionErrorText(error);
    console.warn("[atlas] connection inventory storage failed", { message });
    await recordAttempt(store, writerEmail, "failed", "store-failed");
    return { status: "skipped", reason: "failed", code: "store-failed", message, delegated };
  }
}
