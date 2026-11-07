import { fullRescanDue } from "./incremental-sync";
import type { RawSync } from "./live-sync";

/** Last complete collection of a workspace, kept in the browser to enable incremental sync. */
export interface CachedCollection {
  workspaceId: string;
  generation: number;
  raw: RawSync;
  /** ISO time of the last full collection; incremental runs keep the previous value. */
  fullAt?: string;
  /** Cache layout version; entries written by older releases are ignored and force a full run. */
  format?: number;
}

/** Bump when reused enrichment changes so stale cached collections cannot seed an incremental run. */
export const COLLECTION_CACHE_FORMAT = 2;

export interface CollectionCache {
  load(workspaceId: string): Promise<CachedCollection | undefined>;
  save(entry: CachedCollection): Promise<void>;
}

const DB = "fabric-atlas-sync";
const STORE = "collections";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

/** IndexedDB-backed cache; returns null where IndexedDB is unavailable so every run stays full. */
export function browserCollectionCache(): CollectionCache | null {
  if (typeof indexedDB === "undefined") return null;
  return {
    async load(workspaceId) {
      const entry = await run("readonly", (store) => store.get(workspaceId)) as CachedCollection | undefined;
      return entry && entry.workspaceId === workspaceId && entry.raw && entry.format === COLLECTION_CACHE_FORMAT
        ? entry : undefined;
    },
    async save(entry) {
      await run("readwrite", (store) => store.put({ ...entry, format: COLLECTION_CACHE_FORMAT }, entry.workspaceId));
    },
  };
}

/**
 * Why an incremental run can or cannot reuse this browser's snapshot:
 * "ready" (a full collection younger than the rescan interval is cached),
 * "no-snapshot" (no full run stored in this browser) or "full-due".
 */
export type IncrementalAvailability = "ready" | "no-snapshot" | "full-due";

export async function incrementalAvailability(
  workspaceIds: readonly string[],
  cache: CollectionCache | null = browserCollectionCache(),
  now = Date.now(),
): Promise<Record<string, IncrementalAvailability>> {
  const result: Record<string, IncrementalAvailability> = {};
  for (const id of workspaceIds) {
    let entry: CachedCollection | undefined;
    try {
      entry = await cache?.load(id);
    } catch {
      entry = undefined;
    }
    result[id] = !entry ? "no-snapshot" : fullRescanDue(entry.fullAt ?? entry.raw.syncedAt, now) ? "full-due" : "ready";
  }
  return result;
}
