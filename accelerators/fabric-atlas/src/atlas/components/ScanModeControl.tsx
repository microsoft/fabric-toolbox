import { useEffect, useId, useState } from "react";
import { FULL_RESCAN_INTERVAL_DAYS, parseSyncPlanSummary } from "../incremental-sync";
import type { SyncRun } from "../model";
import { preferredSyncMode, setPreferredSyncMode, SYNC_MODE_EVENT, type SyncModePreference } from "../sync-mode";
import { incrementalAvailability, type IncrementalAvailability } from "../sync-snapshot-cache";
import { cn } from "../ui";
import { formatRunDuration } from "../workspace-sync";

const MODES: { value: SyncModePreference; label: string }[] = [
  { value: "full", label: "Full" },
  { value: "incremental", label: "Incremental" },
];

function duration(run: SyncRun): number | undefined {
  if (typeof run.durationMs === "number" && run.durationMs >= 0) return run.durationMs;
  const start = Date.parse(run.startedAt);
  const end = run.finishedAt ? Date.parse(run.finishedAt) : Number.NaN;
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : undefined;
}

/** Latest completed run statistics: rescanned vs reused items, and the last full run duration for comparison. */
export function lastRunStats(runs: readonly SyncRun[]) {
  const completed = runs
    .filter((run) => run.status === "completed")
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const latest = completed[0];
  if (!latest) return undefined;
  const plan = parseSyncPlanSummary(latest.summary);
  const lastFull = completed.find((run) => parseSyncPlanSummary(run.summary)?.mode === "full");
  return {
    plan,
    items: plan ? plan.refreshed + plan.reused : latest.itemsSynced,
    durationMs: duration(latest),
    fullDurationMs: lastFull && lastFull !== latest ? duration(lastFull) : undefined,
  };
}

/** Shared scan mode preference; every control on the page follows the latest choice. */
export function useSyncMode(): [SyncModePreference, (mode: SyncModePreference) => void] {
  const [mode, setMode] = useState<SyncModePreference>(preferredSyncMode);
  useEffect(() => {
    const listener = (event: Event) => {
      const next = (event as CustomEvent<SyncModePreference>).detail;
      setMode(next === "full" ? "full" : "incremental");
    };
    window.addEventListener(SYNC_MODE_EVENT, listener);
    return () => window.removeEventListener(SYNC_MODE_EVENT, listener);
  }, []);
  return [mode, (next) => {
    setMode(next);
    setPreferredSyncMode(next);
  }];
}

/** Full | Incremental segmented switch. */
export function ScanModeToggle({ disabled, label = "Scan mode" }: { disabled?: boolean; label?: string }) {
  const [mode, setMode] = useSyncMode();
  const labelId = useId();
  return (
    <div className="inline-flex flex-wrap items-center gap-s">
      <span className="text-200 font-semibold text-foreground" id={labelId}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="inline-flex rounded-md border border-input p-xxs">
        {MODES.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={mode === option.value}
            disabled={disabled}
            onClick={() => setMode(option.value)}
            className={cn(
              "min-h-[var(--atlas-control-height)] rounded px-m text-300 font-semibold disabled:opacity-60",
              mode === option.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Reads this browser's snapshot cache; `refreshKey` re-checks it after a run. */
export function useIncrementalAvailability(workspaceIds: readonly string[], refreshKey?: unknown) {
  const [state, setState] = useState<Record<string, IncrementalAvailability>>();
  const key = workspaceIds.join(",");
  useEffect(() => {
    let alive = true;
    void incrementalAvailability(key ? key.split(",") : []).then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, [key, refreshKey]);
  return state;
}

/**
 * Explains, before the run starts, which selected workspaces cannot be synchronized
 * incrementally and therefore run a full scan.
 */
export function IncrementalNotice({
  workspaceIds,
  names,
  refreshKey,
}: {
  workspaceIds: readonly string[];
  names?: Record<string, string>;
  refreshKey?: unknown;
}) {
  const [mode] = useSyncMode();
  const availability = useIncrementalAvailability(workspaceIds, refreshKey);
  if (!availability || workspaceIds.length === 0) return null;
  if (mode === "full") {
    return (
      <p className="text-200 leading-200 text-muted-foreground" data-testid="incremental-notice">
        Full scan: every item is re-read from Fabric.
      </p>
    );
  }
  const blocked = workspaceIds.filter((id) => availability[id] !== "ready");
  if (blocked.length === 0) {
    return (
      <p className="text-200 leading-200 text-signal-success-foreground" data-testid="incremental-notice">
        Incremental ready: only items modified since the last snapshot are rescanned.
      </p>
    );
  }
  const label = (id: string) => names?.[id] ?? (workspaceIds.length === 1 ? "This workspace" : "A selected workspace");
  const missing = blocked.filter((id) => availability[id] === "no-snapshot");
  const due = blocked.filter((id) => availability[id] === "full-due");
  return (
    <p role="status" className="rounded-md border border-signal-warning-foreground/20 bg-signal-warning-background px-m py-s text-200 leading-200 text-signal-warning-foreground" data-testid="incremental-notice">
      <span className="font-semibold">Incremental not possible{blocked.length < workspaceIds.length ? " for some workspaces" : ""}: a full scan will run. </span>
      {missing.length > 0 && `${missing.map(label).join(", ")}: no previous full scan stored in this browser (the reusable snapshot is kept per browser). `}
      {due.length > 0 && `${due.map(label).join(", ")}: last full scan is older than ${FULL_RESCAN_INTERVAL_DAYS} days. `}
    </p>
  );
}

/** Latest run statistics shown in the validated snapshot banner; scan controls live in Selected workspaces. */
export function LastRunSummary({ runs }: { runs: readonly SyncRun[] }) {
  const stats = lastRunStats(runs);
  if (!stats) return null;
  return (
    <div className="mt-m flex flex-col gap-xs rounded-lg border border-border bg-card p-m">
      <p className="text-200 leading-200 text-foreground" data-testid="scan-last-run">
        <span className="font-semibold">Last run: </span>
        {stats.plan
          ? stats.plan.mode === "incremental"
            ? `${stats.plan.refreshed} of ${stats.items} items rescanned · ${stats.plan.reused} reused`
            : `full scan of ${stats.items} items`
          : stats.items != null
            ? `${stats.items} items synchronized`
            : "completed"}
        {stats.durationMs != null && (
          <span className="text-muted-foreground">
            {` · Duration ${formatRunDuration(stats.durationMs)}`}
            {stats.fullDurationMs != null && stats.plan?.mode === "incremental"
              ? ` (full: ${formatRunDuration(stats.fullDurationMs)})`
              : ""}
          </span>
        )}
      </p>
      <p className="text-200 leading-200 text-muted-foreground">
        Full rescan forced every {FULL_RESCAN_INTERVAL_DAYS} days.
      </p>
    </div>
  );
}