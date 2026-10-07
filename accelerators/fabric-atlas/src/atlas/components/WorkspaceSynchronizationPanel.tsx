import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  ArrowDown,
  Ban,
  Calendar,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock3,
  Copy,
  Globe,
  Info,
  Layers,
  Pencil,
  RefreshCw,
  Settings,
  UserRound,
} from "lucide-react";
import { fabricPortalWorkspaceUrl } from "../catalog-search";
import { ATLAS_CONFIG } from "../config";
import { isFeatureEnabled } from "../feature-flags";
import { useAtlas } from "../store";
import { syncContactMessage } from "../sync-contact";
import { Card, cn } from "../ui";
import {
  formatRunDuration,
  formatRunStart,
  RECENT_RUNS_PREVIEW_COUNT,
  recentRunRows,
  scopeWorkspaceRows,
  summarizeError,
  SYNC_BACKEND_CAPABILITIES,
  type RecentRunRow,
  type ScopeWorkspaceRow,
} from "../workspace-sync";
import { LINK_BUTTON, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./button-styles";
import { ErrorDetail } from "./ErrorDetail";
import { RowActionsMenu, type RowMenuAction } from "./RowActionsMenu";
import { SyncRunDetailed } from "./SyncRunStatus";
import { WorkspaceScopeDialog } from "./WorkspaceScopeDialog";

export const LIVE_RUN_ROW_ID = "atlas-live-sync-run";

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function contactLine(): string {
  return syncContactMessage(ATLAS_CONFIG.syncAdminEmail);
}

function synchronizerEmail(): string | undefined {
  const value = ATLAS_CONFIG.syncAdminEmail?.trim();
  return !value || value === "undefined" || value === "null"
    ? undefined
    : value;
}

const CHIP =
  "inline-flex items-center gap-xs rounded-md border px-s py-xxs text-[length:var(--text-200)] font-semibold";

function ScopeStatus({ row }: { row: ScopeWorkspaceRow }) {
  const { status } = row;
  switch (status.kind) {
    case "running":
      return (
        <span className={cn(CHIP, "border-primary/30 bg-primary/10 text-primary")}>
          <RefreshCw className="icon-size-100 motion-safe:animate-spin" aria-hidden="true" />
          {status.phase}
        </span>
      );
    case "queued":
      return (
        <span className={cn(CHIP, "border-border bg-muted text-muted-foreground")}>
          <Clock3 className="icon-size-100" aria-hidden="true" />
          Queued
        </span>
      );
    case "snapshot":
      return (
        <span className={cn(CHIP, "border-signal-success-foreground/20 bg-signal-success-background text-signal-success-foreground")}>
          <CircleCheck className="icon-size-100 text-status-healthy" aria-hidden="true" />
          Last valid snapshot
        </span>
      );
    case "synchronized":
      return (
        <span className={cn(CHIP, "border-signal-success-foreground/20 bg-signal-success-background text-signal-success-foreground")}>
          <CircleCheck className="icon-size-100 text-status-healthy" aria-hidden="true" />
          Synchronized
        </span>
      );
    case "failed":
      return (
        <span className={cn(CHIP, "border-signal-danger-foreground/20 bg-signal-danger-background text-signal-danger-foreground")}>
          <CircleX className="icon-size-100 text-destructive" aria-hidden="true" />
          Last run failed
        </span>
      );
    case "cancelled":
      return (
        <span className={cn(CHIP, "border-border bg-muted text-muted-foreground")}>
          <Ban className="icon-size-100" aria-hidden="true" />
          Cancelled
        </span>
      );
    case "unsynchronized":
      return (
        <span className={cn(CHIP, "border-signal-warning-foreground/20 bg-signal-warning-background text-signal-warning-foreground")}>
          <CircleDashed className="icon-size-100" aria-hidden="true" />
          Not synchronized
        </span>
      );
    default:
      return (
        <span className={cn(CHIP, "border-border bg-muted text-muted-foreground")}>
          <Clock3 className="icon-size-100" aria-hidden="true" />
          Not loaded
        </span>
      );
  }
}

function ScopeDetail({ row }: { row: ScopeWorkspaceRow }) {
  const { status } = row;
  switch (status.kind) {
    case "running":
      return <>{`${status.progress}% complete`}</>;
    case "queued":
      return <>Waits for the current workspace run</>;
    case "snapshot":
      return <>{formatRunStart(status.snapshotAt)}</>;
    case "synchronized":
      return (
        <>
          {status.finishedAt
            ? `Published ${formatRunStart(status.finishedAt)}. Open to load it.`
            : "Published. Open to load it."}
        </>
      );
    case "failed":
      return (
        <div className="flex flex-col gap-xxs">
          <ErrorDetail message={status.message} className="text-foreground" />
          {row.active && (
            <span>
              {status.snapshotAt
                ? `Snapshot from ${formatRunStart(status.snapshotAt)} kept`
                : "No snapshot published"}
            </span>
          )}
        </div>
      );
    case "cancelled":
      return <>Cancelled before publication</>;
    case "unsynchronized":
      return <>Run the first synchronization</>;
    default:
      return <>Open to load its latest snapshot</>;
  }
}

function SelectAllCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label className="inline-flex min-h-[var(--atlas-touch-target)] cursor-pointer items-center gap-s sm:min-h-[var(--atlas-control-height)]">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-l shrink-0 accent-primary"
      />
      <span className="text-200 font-semibold text-muted-foreground md:sr-only">
        Select all workspaces
      </span>
    </label>
  );
}

function SelectedWorkspacesCard() {
  const {
    workspaceScopes,
    workspaceScopesLoading,
    workspaceScopesError,
    reloadWorkspaceScopes,
    activeWorkspaceId,
    syncing,
    syncProgress,
    syncError,
    syncQueue,
    syncWorkspaceId,
    syncWorkspaces,
    lastSyncedAt,
    canSync,
    configured,
    isPreview,
  } = useAtlas();
  const [scopeOpen, setScopeOpen] = useState(false);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const switchHintId = useId();
  const rows = scopeWorkspaceRows({
    scopes: workspaceScopes,
    activeWorkspaceId,
    syncing,
    syncProgress,
    syncError,
    lastSyncedAt,
    syncQueue,
    syncWorkspaceId,
  });
  const canManageScope = canSync && isFeatureEnabled("fabric-app-functions");
  const canStart = canSync && (isPreview || configured);
  const selectable = canStart && rows.length > 1;
  const checkedIds = rows
    .filter((row) => !excluded.has(row.id))
    .map((row) => row.id);
  const allChecked = checkedIds.length === rows.length;
  const usesFallback =
    workspaceScopes.length === 1 && !workspaceScopes[0].persisted;
  const pausedReason = syncing
    ? "Paused until the current run finishes"
    : workspaceScopesLoading
      ? "Available once the scope has loaded"
      : undefined;
  const toggleRow = (id: string, checked: boolean) =>
    setExcluded((current) => {
      const next = new Set(current);
      if (checked) next.delete(id);
      else next.add(id);
      return next;
    });
  const rowActions = (row: ScopeWorkspaceRow): RowMenuAction[] => {
    const actions: RowMenuAction[] = [];
    if (canStart) {
      actions.push({
        id: "sync",
        label: "Synchronize now",
        icon: RefreshCw,
        disabled: pausedReason != null,
        disabledReason: pausedReason,
        onSelect: () => void syncWorkspaces([row.id]),
      });
    }
    const portalUrl = fabricPortalWorkspaceUrl(row.id);
    if (portalUrl.includes("/groups/")) {
      actions.push({ id: "fabric", label: "Open in Fabric", href: portalUrl });
    }
    return actions;
  };
  const cellStart = selectable ? "col-start-2" : "col-start-1";

  return (
    <Card className="flex min-w-0 flex-col">
      <header className="flex flex-wrap items-start justify-between gap-m border-b border-border p-l">
        <div className="min-w-0">
          <h2 className="text-400 font-semibold leading-400">Selected workspaces</h2>
          <p className="mt-xxs text-200 leading-200 text-muted-foreground">
            Workspaces included in the current synchronization scope.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-m">
          <span className="text-300 font-semibold text-brand-foreground">
            {selectable ? checkedIds.length : workspaceScopes.length} selected
          </span>
          {selectable && (
            <button
              type="button"
              onClick={() => void syncWorkspaces(checkedIds)}
              disabled={
                syncing || workspaceScopesLoading || checkedIds.length === 0
              }
              aria-describedby={syncing ? switchHintId : undefined}
              className={PRIMARY_BUTTON}
            >
              <RefreshCw className="icon-size-200" aria-hidden="true" />
              {allChecked ? "Sync all" : "Sync selected"}
            </button>
          )}
          {canManageScope && (
            <button
              type="button"
              onClick={() => setScopeOpen(true)}
              className={SECONDARY_BUTTON}
            >
              <Settings className="icon-size-200" aria-hidden="true" />
              Manage scope
            </button>
          )}
        </div>
      </header>

      {workspaceScopesError && (
        <div
          role="alert"
          className="mx-l mt-l flex flex-wrap items-center gap-m rounded-lg border border-destructive/35 bg-destructive/10 p-m text-200 leading-200 text-foreground"
        >
          <AlertTriangle className="icon-size-200 shrink-0 text-destructive" aria-hidden="true" />
          <span className="min-w-0 flex-1 break-words">{workspaceScopesError}</span>
          <button
            type="button"
            onClick={() => void reloadWorkspaceScopes().catch(() => undefined)}
            className={SECONDARY_BUTTON}
          >
            Reload scope
          </button>
        </div>
      )}

      {workspaceScopesLoading ? (
        <div role="status" className="flex flex-col gap-s p-l">
          <span className="text-200 text-muted-foreground">
            Loading the shared workspace scope…
          </span>
          {[0, 1].map((index) => (
            <span key={index} aria-hidden="true" className="block h-xxxl rounded-md bg-muted" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="p-l text-center text-200 leading-200 text-muted-foreground">
          No workspace is in the shared scope.{" "}
          {canManageScope
            ? "Use Manage scope to select one."
            : "The configured synchronizer selects workspaces."}
        </p>
      ) : (
        <table className="w-full border-collapse text-300 md:table-fixed">
          <caption className="sr-only">
            Workspaces in the shared synchronization scope
          </caption>
          <colgroup>
            {selectable && <col className="md:w-[3.25rem]" />}
            <col className="md:w-[34%]" />
            <col className="md:w-[24%]" />
            <col />
            <col className="md:w-[4rem]" />
          </colgroup>
          <thead
            className={
              selectable
                ? "block border-b border-border md:table-header-group md:border-b-0"
                : "hidden md:table-header-group"
            }
          >
            <tr className="flex items-center px-l md:table-row md:border-b md:border-border md:p-0 md:text-left md:text-200 md:text-muted-foreground">
              {selectable && (
                <th scope="col" className="text-left md:py-xs md:pl-l md:pr-0">
                  <SelectAllCheckbox
                    checked={allChecked}
                    indeterminate={checkedIds.length > 0 && !allChecked}
                    onChange={(checked) =>
                      setExcluded(
                        checked ? new Set() : new Set(rows.map((row) => row.id)),
                      )
                    }
                  />
                </th>
              )}
              <th scope="col" className={cn("hidden py-s font-semibold md:table-cell", selectable ? "md:px-s" : "md:px-l")}>Workspace</th>
              <th scope="col" className="hidden px-m py-s font-semibold md:table-cell">Status</th>
              <th scope="col" className="hidden px-m py-s font-semibold md:table-cell">Details</th>
              <th scope="col" className="hidden px-s py-s md:table-cell">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr
                key={row.id}
                className={cn(
                  "grid items-center gap-x-m gap-y-xs px-l py-m hover:bg-accent/60 md:table-row md:p-0",
                  selectable
                    ? "grid-cols-[auto_minmax(0,1fr)_auto]"
                    : "grid-cols-[minmax(0,1fr)_auto]",
                )}
              >
                {selectable && (
                  <td className="col-start-1 row-start-1 md:py-s md:pl-l md:pr-0">
                    <label className="inline-flex min-h-[var(--atlas-touch-target)] cursor-pointer items-center sm:min-h-[var(--atlas-control-height)]">
                      <input
                        type="checkbox"
                        checked={!excluded.has(row.id)}
                        onChange={(event) => toggleRow(row.id, event.target.checked)}
                        aria-label={`Select ${row.displayName}`}
                        className="size-l shrink-0 accent-primary"
                      />
                    </label>
                  </td>
                )}
                <td className={cn(cellStart, "row-start-1 min-w-0 md:py-s", selectable ? "md:px-s" : "md:px-l")}>
                  <span className="flex min-w-0 items-center gap-m">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex icon-size-600 shrink-0 items-center justify-center rounded-lg",
                        row.active
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Layers className="icon-size-200" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium" title={row.displayName}>
                        {row.displayName}
                      </span>
                      {row.active && (
                        <span className="block text-200 text-muted-foreground">
                          Active workspace
                        </span>
                      )}
                    </span>
                  </span>
                </td>
                <td className={cn(cellStart, "row-start-2 md:px-m md:py-s")}>
                  <ScopeStatus row={row} />
                </td>
                <td className={cn(cellStart, "row-start-3 min-w-0 text-200 text-muted-foreground md:px-m md:py-s md:text-300")}>
                  <ScopeDetail row={row} />
                </td>
                <td
                  className={cn(
                    selectable ? "col-start-3" : "col-start-2",
                    "row-start-1 justify-self-end md:px-s md:py-s md:text-right",
                  )}
                >
                  <RowActionsMenu
                    label={`Actions for ${row.displayName}`}
                    actions={rowActions(row)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(syncing || usesFallback || !canSync) && (
        <div className="mt-auto flex flex-col gap-xs border-t border-border px-l py-m text-200 leading-200 text-muted-foreground">
          {syncing && (
            <p id={switchHintId}>
              Workspace switching and new runs are paused until the current run
              finishes or is cancelled.
            </p>
          )}
          {usesFallback && (
            <p>
              Showing the configured deployment workspace until the synchronizer
              saves an explicit scope.
            </p>
          )}
          {!canSync && (
            <p>
              Scope is managed by{" "}
              {synchronizerEmail() ??
                "the configured synchronization administrator"}
              .
            </p>
          )}
        </div>
      )}

      {canManageScope && (
        <WorkspaceScopeDialog open={scopeOpen} onOpenChange={setScopeOpen} />
      )}
    </Card>
  );
}

function ScheduleCard() {
  const capability = SYNC_BACKEND_CAPABILITIES.scheduledRuns;
  const reasonId = useId();
  const synchronizer = synchronizerEmail() ?? "Configured synchronizer";
  const timeZone = browserTimeZone();
  const rows = [
    { icon: Calendar, label: "Frequency", value: "Manual only" },
    {
      icon: Globe,
      label: "Time zone",
      value: "Not configured",
      detail: timeZone ? `Run times shown in ${timeZone}` : undefined,
    },
    {
      icon: UserRound,
      label: "Run identity",
      value: synchronizer,
      detail: "Delegated sign-in in the browser",
    },
    { icon: Clock3, label: "Next run", value: "Not scheduled" },
  ];

  return (
    <Card className="flex min-w-0 flex-col">
      {/* Schedule controls stay disabled: no backend scheduler exists yet. */}
      <header className="flex items-center justify-between gap-m border-b border-border p-l">
        <h2 className="text-400 font-semibold leading-400">Schedule</h2>
        <span className="inline-flex items-center gap-s">
          <button
            type="button"
            role="switch"
            aria-checked={false}
            aria-label={capability.label}
            aria-describedby={reasonId}
            disabled
            className="inline-flex min-h-[var(--atlas-touch-target)] items-center sm:min-h-[var(--atlas-control-height)]"
          >
            <span
              aria-hidden="true"
              className="relative block h-l w-xxxl rounded-full border border-border bg-muted after:absolute after:left-xxs after:top-1/2 after:block after:size-m after:-translate-y-1/2 after:rounded-full after:bg-muted-foreground"
            />
          </button>
          <span aria-hidden="true" className="text-300 font-semibold text-muted-foreground">
            Disabled
          </span>
        </span>
      </header>
      <dl className="grid grid-cols-[auto_auto_minmax(0,1fr)] gap-x-m px-l">
        {rows.map(({ icon: Icon, label, value, detail }) => (
          <div
            key={label}
            className="col-span-3 grid grid-cols-subgrid items-start border-b border-border py-m last:border-b-0"
          >
            <Icon className="mt-xxs icon-size-200 shrink-0 text-muted-foreground" aria-hidden="true" />
            <dt className="text-300 text-muted-foreground">{label}</dt>
            <dd className="min-w-0 text-300">
              <span className="block font-medium [overflow-wrap:anywhere]">{value}</span>
              {detail && (
                <span className="block text-200 text-muted-foreground">{detail}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto flex flex-col gap-m p-l pt-s">
        <button
          type="button"
          disabled
          aria-describedby={reasonId}
          className={cn(SECONDARY_BUTTON, "self-start")}
        >
          <Pencil className="icon-size-200" aria-hidden="true" />
          Edit schedule
        </button>
        <div
          role="note"
          className="flex items-start gap-s rounded-lg border border-border bg-secondary p-m text-200 leading-200"
        >
          <Info className="mt-xxs icon-size-200 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p id={reasonId}>
            <span className="font-semibold">Scheduling is unavailable. </span>
            <span className="text-muted-foreground">{capability.reason}</span>
          </p>
        </div>
      </div>
    </Card>
  );
}

function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

function RunResult({
  row,
  detailId,
  expanded,
  onToggle,
}: {
  row: RecentRunRow;
  detailId: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  switch (row.result) {
    case "running":
      return (
        <span className="inline-flex items-center gap-xs font-semibold text-primary">
          <RefreshCw className="icon-size-200 motion-safe:animate-spin" aria-hidden="true" />
          Running
        </span>
      );
    case "completed":
      return (
        <span className="inline-flex items-center gap-xs font-semibold text-status-healthy">
          <CircleCheck className="icon-size-200" aria-hidden="true" />
          Completed
        </span>
      );
    case "failed": {
      const error = row.failureMessage
        ? summarizeError(row.failureMessage)
        : undefined;
      return (
        <span className="flex min-w-0 flex-col items-start">
          <span className="inline-flex items-center gap-xs font-semibold text-foreground">
            <CircleX className="icon-size-200 text-destructive" aria-hidden="true" />
            Failed
          </span>
          {error && (
            <span className="mt-xxs line-clamp-2 max-w-full break-words text-200 text-muted-foreground">
              {error.summary}
            </span>
          )}
          {error?.truncated && (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={detailId}
              onClick={onToggle}
              className={LINK_BUTTON}
            >
              {expanded ? "Hide full error" : "Show full error"}
            </button>
          )}
        </span>
      );
    }
    default:
      return (
        <span className="flex min-w-0 flex-col">
          <span className="inline-flex items-center gap-xs font-semibold text-foreground">
            <CircleDashed className="icon-size-200 text-muted-foreground" aria-hidden="true" />
            No result recorded
          </span>
          <span className="mt-xxs text-200 text-muted-foreground">
            Interrupted, or still open in another session
          </span>
        </span>
      );
  }
}

function MobileLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mr-xs text-200 font-semibold text-muted-foreground md:hidden">
      {children}
    </span>
  );
}

const RUN_CELL = "md:px-s md:py-s md:align-top";

function RecentRunsCard() {
  const {
    data,
    syncing,
    syncStartedAt,
    syncWorkspaceId,
    activeWorkspaceId,
    currentUser,
    hydrating,
    canSync,
  } = useAtlas();
  const [expanded, setExpanded] = useState(false);
  const [openErrors, setOpenErrors] = useState<Set<string>>(new Set());
  const [copyStatus, setCopyStatus] = useState("");
  const listId = useId();
  const detailPrefix = useId();
  const copy = async (text: string, what: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setCopyStatus(`${what} copied.`);
    } catch {
      setCopyStatus("Copy failed: the browser blocked clipboard access.");
    }
  };
  const runsActiveWorkspace =
    syncing && (syncWorkspaceId ?? activeWorkspaceId) === activeWorkspaceId;
  const liveStartedAt = runsActiveWorkspace ? syncStartedAt : undefined;
  const now = useNow(liveStartedAt != null);
  const rows = recentRunRows({
    runs: data.syncRuns,
    workspaceName: data.workspace.displayName,
    live:
      liveStartedAt != null
        ? { startedAt: liveStartedAt, triggeredBy: currentUser.name }
        : undefined,
  });
  const visible = expanded ? rows : rows.slice(0, RECENT_RUNS_PREVIEW_COUNT);
  const toggleError = (id: string) =>
    setOpenErrors((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Card className="min-w-0">
      <header className="flex flex-wrap items-start justify-between gap-m p-l pb-m">
        <div className="min-w-0">
          <h2 className="text-400 font-semibold leading-400">
            Recent synchronization runs
          </h2>
          <p className="mt-xxs text-200 leading-200 text-muted-foreground">
            Latest synchronization activity for {data.workspace.displayName}.
          </p>
        </div>
        {rows.length > RECENT_RUNS_PREVIEW_COUNT && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex min-h-[var(--atlas-touch-target)] items-center rounded-md px-s text-300 font-semibold text-brand-foreground underline-offset-4 hover:underline sm:min-h-[var(--atlas-control-height)]"
          >
            {expanded
              ? `Show latest ${RECENT_RUNS_PREVIEW_COUNT}`
              : `View all ${rows.length} runs`}
          </button>
        )}
      </header>

      {hydrating ? (
        <div role="status" className="flex flex-col gap-s px-l pb-l">
          <span className="text-200 text-muted-foreground">
            Loading synchronization runs…
          </span>
          {[0, 1, 2].map((index) => (
            <span key={index} aria-hidden="true" className="block h-xxl rounded-md bg-muted" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="mx-l mb-l rounded-lg border border-dashed border-border p-l text-center text-200 leading-200 text-muted-foreground">
          No synchronization run is recorded for {data.workspace.displayName} yet.{" "}
          {canSync
            ? "Synchronize now to publish the first snapshot."
            : contactLine()}
        </p>
      ) : (
        <div className="px-s">
          <table id={listId} className="w-full border-collapse text-300 table-fixed">
            <caption className="sr-only">
              Synchronization runs, newest first
            </caption>
            <colgroup>
              <col className="md:w-[16%]" />
              <col className="md:w-[22%]" />
              <col className="md:w-[16%]" />
              <col />
              <col className="md:w-[12%]" />
              <col className="md:w-[3.5rem]" />
            </colgroup>
            <thead className="hidden md:table-header-group">
              <tr className="border-b border-border text-left text-200 text-muted-foreground">
                <th scope="col" aria-sort="descending" className="px-s py-s font-semibold">
                  <span className="inline-flex items-center gap-xs">
                    Started
                    <ArrowDown className="icon-size-100" aria-hidden="true" />
                  </span>
                </th>
                <th scope="col" className="px-s py-s font-semibold">Trigger</th>
                <th scope="col" className="px-s py-s font-semibold">Scope</th>
                <th scope="col" className="px-s py-s font-semibold">Result</th>
                <th scope="col" className="px-s py-s font-semibold">Duration</th>
                <th scope="col" className="px-s py-s">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((row) => {
                const detailId = `${detailPrefix}-${row.id}`;
                const errorOpen = openErrors.has(row.id);
                const actions: RowMenuAction[] = row.live
                  ? []
                  : [
                      {
                        id: "copy-id",
                        label: "Copy run ID",
                        icon: Copy,
                        onSelect: () => void copy(row.id, "Run ID"),
                      },
                      ...(row.failureMessage
                        ? [
                            {
                              id: "copy-error",
                              label: "Copy error details",
                              icon: Copy,
                              onSelect: () =>
                                void copy(row.failureMessage!, "Error details"),
                            },
                          ]
                        : []),
                    ];
                return (
                  <Fragment key={row.id}>
                    <tr
                      id={row.live ? LIVE_RUN_ROW_ID : undefined}
                      tabIndex={row.live ? -1 : undefined}
                      className={cn(
                        "relative flex flex-wrap items-start gap-x-l gap-y-xs px-s py-m md:table-row md:p-0",
                        row.live &&
                          "bg-primary/5 focus:outline-2 focus:outline-offset-[-2px] focus:outline-ring",
                      )}
                    >
                      <td className={cn("w-full pr-[var(--atlas-touch-target)] font-semibold md:w-auto md:font-normal", RUN_CELL)}>
                        {formatRunStart(row.startedAt)}
                      </td>
                      <td className={cn("min-w-0", RUN_CELL)}>
                        <MobileLabel>Trigger</MobileLabel>
                        Manual
                        {row.triggeredBy && (
                          <span
                            className="block truncate text-200 text-muted-foreground"
                            title={row.triggeredBy}
                          >
                            {row.triggeredBy}
                          </span>
                        )}
                      </td>
                      <td className={cn("min-w-0", RUN_CELL)}>
                        <MobileLabel>Scope</MobileLabel>
                        <span className="break-words">{row.workspaceName}</span>
                      </td>
                      <td className={cn("w-full min-w-0 md:w-auto", RUN_CELL)}>
                        <RunResult
                          row={row}
                          detailId={detailId}
                          expanded={errorOpen}
                          onToggle={() => toggleError(row.id)}
                        />
                      </td>
                      <td className={cn("font-numeric tabular-nums", RUN_CELL)}>
                        <MobileLabel>Duration</MobileLabel>
                        {row.live && liveStartedAt != null
                          ? `${formatRunDuration(now - liveStartedAt)} so far`
                          : formatRunDuration(row.durationMs)}
                      </td>
                      <td className="absolute right-xs top-xs md:static md:px-xs md:py-xs md:text-right md:align-top">
                        <RowActionsMenu
                          label={`Actions for run started ${formatRunStart(row.startedAt)}`}
                          actions={actions}
                        />
                      </td>
                    </tr>
                    {errorOpen && row.failureMessage && (
                      <tr className="block md:table-row">
                        <td colSpan={6} className="block px-s pb-m md:table-cell">
                          <p
                            id={detailId}
                            className="whitespace-pre-wrap break-words rounded-lg border border-destructive/30 bg-destructive/5 p-m text-200 leading-200 text-foreground"
                          >
                            {row.failureMessage}
                          </p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <p role="status" className="px-s text-200 leading-200 text-muted-foreground empty:hidden">
            {copyStatus}
          </p>
        </div>
      )}

      <p className="m-l mt-s flex items-start gap-s rounded-lg border border-primary/20 bg-primary/5 px-m py-s text-200 leading-200 text-foreground">
        <Info className="mt-xxs icon-size-200 shrink-0 text-primary" aria-hidden="true" />
        The last validated snapshot remains available during synchronization.
        A run replaces it only after its manifest is published.
      </p>
    </Card>
  );
}

export function WorkspaceSynchronizationPanel() {
  const viewRun = () => {
    const row = document.getElementById(LIVE_RUN_ROW_ID);
    if (!row) return;
    row.scrollIntoView?.({ block: "nearest" });
    row.focus();
  };

  return (
    <div className="flex min-w-0 flex-col gap-l">
      <SyncRunDetailed onViewRun={viewRun} />
      <div className="grid items-start gap-l xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        <SelectedWorkspacesCard />
        <ScheduleCard />
      </div>
      <RecentRunsCard />
    </div>
  );
}
