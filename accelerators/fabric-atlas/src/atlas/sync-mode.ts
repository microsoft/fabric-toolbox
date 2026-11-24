/** User choice between incremental (default) and full synchronization, kept per browser. */
export type SyncModePreference = "incremental" | "full";

const KEY = "fabric-atlas.sync-mode";
/** Window event fired when the preference changes so every mode control stays in step. */
export const SYNC_MODE_EVENT = "fabric-atlas:sync-mode";

export function preferredSyncMode(): SyncModePreference {
  try {
    return globalThis.localStorage?.getItem(KEY) === "full" ? "full" : "incremental";
  } catch {
    return "incremental";
  }
}

export function setPreferredSyncMode(mode: SyncModePreference): void {
  try {
    globalThis.localStorage?.setItem(KEY, mode);
  } catch {
    /* storage unavailable: the choice applies to this page only through component state */
  }
  if (typeof globalThis.dispatchEvent === "function" && typeof CustomEvent === "function") {
    globalThis.dispatchEvent(new CustomEvent(SYNC_MODE_EVENT, { detail: mode }));
  }
}
