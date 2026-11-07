import type { AtlasHistory } from "../history";
import type { PersistedItemRelationsEvidence } from "../item-relations-evidence-source";
import type { AtlasData } from "../model";
import type { OperationalIncidentRecord } from "../operational-incident-store";
import type { WorkspaceScope } from "../workspace-scope";
import type { AccessPolicyEvidence } from "../../../rayfin/functions/src/policy-evidence-contract";

/**
 * Read-only access to validated Atlas evidence for the MCP surface.
 * Implementations expose no write paths and no personal review state.
 */
export interface AtlasMcpDataSource {
  /** Fails closed unless an authenticated app-audience session is available. */
  requireSession(): Promise<void>;
  /** Administrator-selected workspace scope, or the configured fallback. */
  loadWorkspaceScope(): Promise<WorkspaceScope[]>;
  /** Latest manifest-verified snapshot, or null when none is published. */
  loadSnapshot(workspaceId: string): Promise<AtlasData | null>;
  /** Validated snapshots ending at `current`, newest first. */
  loadHistory(workspaceId: string, current: AtlasData): Promise<AtlasHistory>;
  /** Latest validated Item Relations (Beta) envelope, or null when none exists. */
  loadItemRelationsEvidence(
    workspaceId: string,
  ): Promise<PersistedItemRelationsEvidence | null>;
  /** Validated `OperationalIncident` records published with one snapshot. */
  loadIncidentRecords(
    workspaceId: string,
    snapshotId: string,
  ): Promise<OperationalIncidentRecord[]>;
  /** Validated stored workspace policy context for one snapshot. */
  loadPolicyEvidence(
    workspaceId: string,
    snapshotId: string,
  ): Promise<AccessPolicyEvidence[]>;
}

export interface SnapshotCacheOptions {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

interface CacheEntry<T> {
  value: Promise<T>;
  storedAt: number;
}

/**
 * Bounded read cache for a long-lived local server. Sessions are never cached:
 * every call still runs `requireSession` before cached evidence is returned.
 * Failed loads are evicted so a later call retries.
 */
export function withSnapshotCache(
  source: AtlasMcpDataSource,
  options: SnapshotCacheOptions = {},
): AtlasMcpDataSource {
  const ttlMs = options.ttlMs ?? 60_000;
  const maxEntries = Math.max(1, options.maxEntries ?? 4);
  const now = options.now ?? Date.now;
  const caches = {
    scope: new Map<string, CacheEntry<WorkspaceScope[]>>(),
    snapshot: new Map<string, CacheEntry<AtlasData | null>>(),
    history: new Map<string, CacheEntry<AtlasHistory>>(),
    evidence: new Map<string, CacheEntry<PersistedItemRelationsEvidence | null>>(),
    incidents: new Map<string, CacheEntry<OperationalIncidentRecord[]>>(),
    policies: new Map<string, CacheEntry<AccessPolicyEvidence[]>>(),
  };

  function cached<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
    load: () => Promise<T>,
  ): Promise<T> {
    const hit = cache.get(key);
    if (hit && now() - hit.storedAt < ttlMs) return hit.value;
    const value = load();
    cache.delete(key);
    cache.set(key, { value, storedAt: now() });
    while (cache.size > maxEntries) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
    value.then(undefined, () => {
      if (cache.get(key)?.value === value) cache.delete(key);
    });
    return value;
  }

  return {
    requireSession: () => source.requireSession(),
    loadWorkspaceScope: () =>
      cached(caches.scope, "scope", () => source.loadWorkspaceScope()),
    loadSnapshot: (workspaceId) =>
      cached(caches.snapshot, workspaceId, () =>
        source.loadSnapshot(workspaceId),
      ),
    loadHistory: (workspaceId, current) =>
      cached(
        caches.history,
        `${workspaceId}|${current.workspace.snapshotId ?? ""}`,
        () => source.loadHistory(workspaceId, current),
      ),
    loadItemRelationsEvidence: (workspaceId) =>
      cached(caches.evidence, workspaceId, () =>
        source.loadItemRelationsEvidence(workspaceId),
      ),
    loadIncidentRecords: (workspaceId, snapshotId) =>
      cached(caches.incidents, `${workspaceId}|${snapshotId}`, () =>
        source.loadIncidentRecords(workspaceId, snapshotId),
      ),
    loadPolicyEvidence: (workspaceId, snapshotId) =>
      cached(caches.policies, `${workspaceId}|${snapshotId}`, () =>
        source.loadPolicyEvidence(workspaceId, snapshotId),
      ),
  };
}
