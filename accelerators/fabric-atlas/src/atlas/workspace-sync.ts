import type { SyncRun } from "./model";
import type { WorkspaceScope } from "./workspace-scope";
import { SYNC_PHASES, syncPhaseIndex } from "./synchronization-progress";

export interface SyncCapability {
  available: boolean;
  label: string;
  reason: string;
}

/**
 * Backend-dependent synchronization capabilities. Both stay closed until the
 * durable Functions cutover passes its recovery and identity gates; controls
 * that need them (resume, background continuation, schedule editing) are not
 * rendered while `available` is false.
 */
export const SYNC_BACKEND_CAPABILITIES = {
  backgroundRuns: {
    available: false,
    label: "Background synchronization",
    reason:
      "Runs execute in the synchronizer's browser tab through the published Python User Data Function. Closing the tab stops the run before publication.",
  },
  scheduledRuns: {
    available: false,
    label: "Scheduled synchronization",
    reason:
      "Fabric Apps backend Functions have no documented timer or unattended trigger, and the collectors need a delegated user identity that Atlas never stores.",
  },
} as const satisfies Record<string, SyncCapability>;

export const RECENT_RUNS_PREVIEW_COUNT = 5;
export const ERROR_SUMMARY_LENGTH = 160;

export type WorkspaceSyncStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/** One workspace in the current or most recent browser synchronization batch. */
export interface WorkspaceSyncEntry {
  workspaceId: string;
  status: WorkspaceSyncStatus;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

export type ScopeWorkspaceStatus =
  | { kind: "running"; phase: string; progress: number }
  | { kind: "queued" }
  | { kind: "failed"; message: string; snapshotAt?: string }
  | { kind: "snapshot"; snapshotAt: string }
  | { kind: "synchronized"; finishedAt?: string }
  | { kind: "cancelled" }
  | { kind: "unsynchronized" }
  | { kind: "inactive" };

export interface ScopeWorkspaceRow {
  id: string;
  displayName: string;
  workspaceType?: string;
  active: boolean;
  persisted: boolean;
  status: ScopeWorkspaceStatus;
}

/** Collapses whitespace and bounds an error to one readable summary line. */
export function summarizeError(
  message: string,
  maxLength = ERROR_SUMMARY_LENGTH,
): { summary: string; truncated: boolean } {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return { summary: normalized, truncated: false };
  }
  const slice = normalized.slice(0, maxLength);
  const boundary = slice.lastIndexOf(" ");
  const summary =
    boundary > maxLength * 0.6 ? slice.slice(0, boundary) : slice;
  return { summary: `${summary.trimEnd()}…`, truncated: true };
}

export function scopeWorkspaceRows({
  scopes,
  activeWorkspaceId,
  syncing,
  syncProgress,
  syncError,
  lastSyncedAt,
  syncQueue = [],
  syncWorkspaceId,
}: {
  scopes: readonly WorkspaceScope[];
  activeWorkspaceId: string;
  syncing: boolean;
  syncProgress: number;
  syncError?: string;
  lastSyncedAt?: string;
  syncQueue?: readonly WorkspaceSyncEntry[];
  syncWorkspaceId?: string;
}): ScopeWorkspaceRow[] {
  const entries = new Map(
    syncQueue.map((entry) => [entry.workspaceId, entry]),
  );
  return scopes.map((scope) => {
    const active = scope.id === activeWorkspaceId;
    const entry = entries.get(scope.id);
    const running =
      syncing &&
      (syncWorkspaceId ? syncWorkspaceId === scope.id : active);
    let status: ScopeWorkspaceStatus;
    if (running) {
      status = {
        kind: "running",
        phase: SYNC_PHASES[syncPhaseIndex(syncProgress)].activeLabel,
        progress: Math.min(100, Math.max(0, Math.round(syncProgress))),
      };
    } else if (syncing && entry?.status === "queued") {
      status = { kind: "queued" };
    } else if (active) {
      const failure =
        syncError ?? (entry?.status === "failed" ? entry.error : undefined);
      if (failure) {
        status = { kind: "failed", message: failure, snapshotAt: lastSyncedAt };
      } else if (lastSyncedAt) {
        status = { kind: "snapshot", snapshotAt: lastSyncedAt };
      } else {
        status = { kind: "unsynchronized" };
      }
    } else if (entry?.status === "failed") {
      status = {
        kind: "failed",
        message: entry.error ?? "Synchronization failed.",
      };
    } else if (entry?.status === "cancelled") {
      status = { kind: "cancelled" };
    } else if (entry?.status === "completed") {
      status = { kind: "synchronized", finishedAt: entry.finishedAt };
    } else {
      status = { kind: "inactive" };
    }
    return {
      id: scope.id,
      displayName: scope.displayName,
      workspaceType: scope.workspaceType,
      active,
      persisted: scope.persisted,
      status,
    };
  });
}

export type RecentRunResult = "running" | "completed" | "failed" | "unfinished";

export interface RecentRunRow {
  id: string;
  startedAt: string;
  triggeredBy?: string;
  workspaceName: string;
  result: RecentRunResult;
  durationMs?: number;
  summary?: string;
  failureMessage?: string;
  live: boolean;
}

function timestamp(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? undefined : parsed;
}

function runDuration(run: SyncRun): number | undefined {
  if (
    typeof run.durationMs === "number" &&
    Number.isFinite(run.durationMs) &&
    run.durationMs >= 0
  ) {
    return run.durationMs;
  }
  const started = timestamp(run.startedAt);
  const finished = timestamp(run.finishedAt);
  if (started == null || finished == null || finished < started) {
    return undefined;
  }
  return finished - started;
}

/**
 * Projects persisted SyncRun audit rows plus the in-flight browser run. A
 * persisted `running` row that this session does not own has no recorded
 * result, so it is reported as unfinished instead of running.
 */
export function recentRunRows({
  runs,
  workspaceName,
  live,
}: {
  runs: readonly SyncRun[];
  workspaceName: string;
  live?: { startedAt: number; triggeredBy: string };
}): RecentRunRow[] {
  const rows: RecentRunRow[] = runs
    .filter((run) => timestamp(run.startedAt) != null)
    .map((run) => ({
      id: run.id,
      startedAt: new Date(run.startedAt).toISOString(),
      triggeredBy: run.triggeredBy?.trim() || undefined,
      workspaceName,
      result: run.status === "running" ? "unfinished" : run.status,
      durationMs: run.status === "running" ? undefined : runDuration(run),
      summary: run.summary?.trim() || undefined,
      failureMessage:
        run.status === "failed"
          ? run.failureMessage?.trim() || undefined
          : undefined,
      live: false,
    }));
  if (live && Number.isFinite(live.startedAt)) {
    rows.push({
      id: `live-${live.startedAt}`,
      startedAt: new Date(live.startedAt).toISOString(),
      triggeredBy: live.triggeredBy,
      workspaceName,
      result: "running",
      live: true,
    });
  }
  return rows.sort(
    (left, right) =>
      new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime(),
  );
}

export function formatRunDuration(durationMs: number | undefined): string {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs < 0) {
    return "Not recorded";
  }
  const totalSeconds = Math.round(durationMs / 1000);
  if (totalSeconds < 1) return "<1s";
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes}m ${String(totalSeconds % 60).padStart(2, "0")}s`;
  }
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}h ${String(totalMinutes % 60).padStart(2, "0")}m`;
}

function startOfLocalDay(value: Date): number {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
  ).getTime();
}

export function runDayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  const dayDifference = Math.round(
    (startOfLocalDay(now) - startOfLocalDay(date)) / 86_400_000,
  );
  if (dayDifference === 0) return "Today";
  if (dayDifference === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

export function formatRunStart(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  const time = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${runDayLabel(iso, now)} ${time}`;
}
