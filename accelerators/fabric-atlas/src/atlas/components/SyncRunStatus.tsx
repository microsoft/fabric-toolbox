import { useMemo, type ReactNode } from "react";
import {
  AlertTriangle,
  CircleCheck,
  ExternalLink,
  History,
  Info,
  RefreshCw,
  X,
} from "lucide-react";
import { ATLAS_CONFIG } from "../config";
import { relativeTime } from "../model";
import { REPOSITORY_URL } from "../release";
import { useAtlas } from "../store";
import { syncContactMessage } from "../sync-contact";
import { syncRunView, type SyncRunView } from "../sync-run";
import { SYNC_PHASES } from "../synchronization-progress";
import { cn } from "../ui";
import { formatRunStart } from "../workspace-sync";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "./button-styles";
import { ErrorDetail } from "./ErrorDetail";

/** Reads the store once through the shared synchronization view. */
function useSyncRunView(): SyncRunView {
  const {
    syncing,
    syncProgress,
    syncStage,
    syncError,
    syncQueue,
    syncWorkspaceId,
    workspaceScopes,
    activeWorkspaceId,
    lastSyncedAt,
  } = useAtlas();
  return useMemo(
    () =>
      syncRunView({
        syncing,
        syncProgress,
        syncStage,
        syncError,
        syncQueue: syncQueue ?? [],
        syncWorkspaceId,
        workspaceScopes,
        activeWorkspaceId,
        lastSyncedAt,
      }),
    [
      activeWorkspaceId,
      lastSyncedAt,
      syncError,
      syncProgress,
      syncQueue,
      syncStage,
      syncWorkspaceId,
      syncing,
      workspaceScopes,
    ],
  );
}

/**
 * Global run status for the application header. It never adds rows to the
 * page, so moving between routes during a run causes no layout shift.
 */
export function SyncRunCompact({ onOpenDetails }: { onOpenDetails: () => void }) {
  const view = useSyncRunView();
  const active = view.kind === "running" || view.kind === "cancelling";
  return (
    <span className="flex min-w-0 items-center gap-xs">
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        title={view.compactLabel}
        className={cn(
          "flex min-w-0 max-w-[240px] items-center gap-xs text-[length:var(--text-200)]",
          view.kind === "failed" ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {active && (
          <RefreshCw
            className="icon-size-100 shrink-0 text-primary motion-safe:animate-spin"
            aria-hidden="true"
          />
        )}
        {view.kind === "failed" && (
          <AlertTriangle
            className="icon-size-100 shrink-0 text-destructive"
            aria-hidden="true"
          />
        )}
        <span className="sr-only truncate sm:not-sr-only">{view.compactLabel}</span>
      </span>
      {view.kind === "failed" && (
        <button
          type="button"
          onClick={onOpenDetails}
          aria-label="Show synchronization error details"
          className="flex min-h-[var(--atlas-touch-target)] min-w-[var(--atlas-touch-target)] shrink-0 items-center justify-center gap-xs rounded-md px-s text-200 font-semibold text-brand-foreground hover:bg-accent sm:min-h-[var(--atlas-control-height)] sm:min-w-0"
        >
          <Info className="icon-size-200 sm:hidden" aria-hidden="true" />
          <span aria-hidden="true" className="hidden sm:inline">
            Details
          </span>
        </button>
      )}
    </span>
  );
}

/** Thin progress indicator pinned to the bottom edge of a positioned header. */
export function SyncRunProgressLine() {
  const view = useSyncRunView();
  if (view.kind !== "running" && view.kind !== "cancelling") return null;
  return (
    <span
      data-sync-progress-line="true"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-xxs overflow-hidden bg-muted"
    >
      <span
        className="block h-full bg-primary transition-[width] duration-500 dark:bg-brand-foreground"
        style={{ width: `${view.progress}%` }}
      />
    </span>
  );
}

function PhaseStepper({ view }: { view: SyncRunView }) {
  const complete = (index: number) =>
    view.progress >= 100 || index < view.phaseIndex;
  return (
    <ol
      aria-label="Synchronization phases"
      className="grid grid-cols-4 gap-s sm:flex sm:items-center sm:gap-m"
    >
      {SYNC_PHASES.map((phase, index) => {
        const done = complete(index);
        const isCurrent = !done && index === view.phaseIndex;
        return (
          <li
            key={phase.label}
            aria-current={isCurrent ? "step" : undefined}
            className="flex min-w-0 items-center gap-m sm:flex-1 sm:last:flex-none"
          >
            <span
              className="flex min-w-0 flex-col items-center gap-xs text-center sm:flex-row sm:gap-s sm:text-left"
              title={phase.detail}
            >
              {done ? (
                <CircleCheck className="icon-size-300 shrink-0 text-primary" aria-hidden="true" />
              ) : isCurrent ? (
                <span
                  aria-hidden="true"
                  className="flex icon-size-300 shrink-0 items-center justify-center rounded-full border-2 border-primary dark:border-brand-foreground"
                >
                  <span className="size-s rounded-full bg-primary dark:bg-brand-foreground" />
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className="icon-size-300 shrink-0 rounded-full border-2 border-muted-foreground"
                />
              )}
              <span
                className={cn(
                  "max-w-full truncate text-[length:var(--text-200)] sm:text-[length:var(--text-300)]",
                  isCurrent ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {phase.label}
              </span>
              <span className="sr-only">
                {done ? ", complete" : isCurrent ? ", in progress" : ", not started"}
              </span>
            </span>
            {index < SYNC_PHASES.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  "hidden h-px min-w-l flex-1 sm:block",
                  done ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function BannerShell({
  tone,
  icon,
  title,
  description,
  actions,
  children,
}: {
  tone: "primary" | "destructive" | "warning";
  icon: ReactNode;
  title: string;
  description: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section
      aria-labelledby="workspace-sync-banner-title"
      className={cn(
        "rounded-xl border p-l shadow-fabric-2 sm:p-xl",
        tone === "primary" && "border-primary/30 bg-primary/5",
        tone === "destructive" && "border-signal-danger-foreground/20 bg-signal-danger-background",
        tone === "warning" && "border-signal-warning-foreground/20 bg-signal-warning-background",
      )}
    >
      <div className="flex flex-col gap-l lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-l">
          <span
            aria-hidden="true"
            className={cn(
              "flex icon-size-700 shrink-0 items-center justify-center rounded-xl",
              tone === "primary" && "bg-primary text-primary-foreground",
              tone === "destructive" && "bg-signal-danger-foreground/10 text-signal-danger-foreground",
              tone === "warning" && "bg-signal-warning-foreground/10 text-signal-warning-foreground",
            )}
          >
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="workspace-sync-banner-title"
              className="font-heading text-500 font-semibold leading-500"
            >
              {title}
            </h2>
            <div className="mt-xxs text-300 leading-300 text-muted-foreground">
              {description}
            </div>
            {children}
          </div>
        </div>
        {actions && (
          <div className="flex flex-wrap gap-s lg:shrink-0 lg:justify-end">
            {actions}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Workspace Hub detail for the same run state shown by `SyncRunCompact`:
 * progress phases, batch position, every failure and the run actions.
 */
export function SyncRunDetailed({ onViewRun }: { onViewRun?: () => void }) {
  const view = useSyncRunView();
  const {
    configured,
    canSync,
    isPreview,
    sync,
    syncWorkspaces,
    cancelSync,
    activeWorkspaceId,
    data,
  } = useAtlas();
  const canStart = canSync && (isPreview || configured);
  const contact = syncContactMessage(ATLAS_CONFIG.syncAdminEmail);

  if (view.kind === "running" || view.kind === "cancelling") {
    const runsActiveWorkspace = view.workspaceId === activeWorkspaceId;
    return (
      <BannerShell
        tone="primary"
        icon={
          <RefreshCw className="icon-size-400 motion-safe:animate-spin" aria-hidden="true" />
        }
        title={
          view.kind === "cancelling"
            ? "Cancelling synchronization"
            : "Synchronization is running in this browser tab"
        }
        description="Keep this tab open until publication completes. Closing it stops the run; the last validated snapshot stays available."
        actions={
          <>
            {onViewRun && runsActiveWorkspace && (
              <button type="button" onClick={onViewRun} className={PRIMARY_BUTTON}>
                <History className="icon-size-200" aria-hidden="true" />
                View run
              </button>
            )}
            {canSync && (
              <button
                type="button"
                onClick={cancelSync}
                disabled={view.kind === "cancelling"}
                className={SECONDARY_BUTTON}
              >
                <X className="icon-size-200" aria-hidden="true" />
                Cancel run
              </button>
            )}
          </>
        }
      >
        {view.position && (
          <p className="mt-xs text-200 font-semibold text-foreground">
            {`${view.position.index} of ${view.position.total} · ${view.workspaceName ?? "Workspace"}`}
          </p>
        )}
        <div className="mt-l flex items-center gap-l">
          <div
            role="progressbar"
            aria-label="Workspace synchronization progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={view.progress}
            aria-valuetext={`${view.progress}% complete. ${view.stage}.`}
            className="h-s min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 dark:bg-brand-foreground"
              style={{ width: `${view.progress}%` }}
            />
          </div>
          <span className="shrink-0 text-right font-numeric text-500 font-semibold tabular-nums">
            {view.progress}%
          </span>
        </div>
        <div className="mt-m">
          <PhaseStepper view={view} />
        </div>
        <p className="mt-m break-words text-200 leading-200 text-muted-foreground">
          Current step: {view.stage}
        </p>
      </BannerShell>
    );
  }

  if (view.kind === "failed") {
    const onlyActive =
      view.failures.length === 1 &&
      view.failures[0].workspaceId === activeWorkspaceId;
    const activeFailed = view.failures.some(
      (failure) => failure.workspaceId === activeWorkspaceId,
    );
    return (
      <BannerShell
        tone="destructive"
        icon={<AlertTriangle className="icon-size-400" aria-hidden="true" />}
        title={
          view.failures.length > 1
            ? `${view.failures.length} workspaces failed to sync`
            : onlyActive
              ? "The last synchronization failed"
              : `${view.failures[0].workspaceName} failed to sync`
        }
        description={
          <>
            <div role="alert" className="flex flex-col gap-s text-foreground">
              {view.failures.map((failure) => (
                <div key={failure.workspaceId} className="min-w-0">
                  {!onlyActive && (
                    <p className="font-semibold">{failure.workspaceName}</p>
                  )}
                  <ErrorDetail message={failure.message} />
                </div>
              ))}
            </div>
            <span className="mt-xs block">
              {!view.lastSyncedAt
                ? "No snapshot was published for this workspace."
                : activeFailed
                  ? `The last validated snapshot, published ${relativeTime(view.lastSyncedAt)}, is still shown.`
                  : `You are viewing ${data.workspace.displayName}, whose validated snapshot was published ${relativeTime(view.lastSyncedAt)}.`}
            </span>
          </>
        }
        actions={
          canStart ? (
            <button
              type="button"
              onClick={() =>
                void (onlyActive
                  ? sync()
                  : syncWorkspaces(view.failures.map((failure) => failure.workspaceId)))
              }
              className={PRIMARY_BUTTON}
            >
              <RefreshCw className="icon-size-200" aria-hidden="true" />
              Retry synchronization
            </button>
          ) : undefined
        }
      >
        {!canSync && (
          <p className="mt-s text-200 leading-200 text-foreground">{contact}</p>
        )}
      </BannerShell>
    );
  }

  if (!isPreview && !configured) {
    return (
      <BannerShell
        tone="warning"
        icon={<AlertTriangle className="icon-size-400" aria-hidden="true" />}
        title="Atlas Sync is not configured"
        description="This deployment has no valid synchronization endpoint, Entra client or synchronizer identity."
        actions={
          <a
            href={`${REPOSITORY_URL}/blob/main/docs/installation.md`}
            target="_blank"
            rel="noreferrer"
            className={SECONDARY_BUTTON}
          >
            <ExternalLink className="icon-size-200" aria-hidden="true" />
            Open installation guide
          </a>
        }
      />
    );
  }

  return (
    <BannerShell
      tone="primary"
      icon={<CircleCheck className="icon-size-400" aria-hidden="true" />}
      title={
        view.lastSyncedAt
          ? `Last validated snapshot published ${relativeTime(view.lastSyncedAt)}`
          : "No snapshot has been published yet"
      }
      description={
        view.lastSyncedAt
          ? `${data.workspace.displayName} was synchronized ${formatRunStart(view.lastSyncedAt)}. Runs are manual and execute in the synchronizer's browser tab.`
          : "Runs are manual and execute in the synchronizer's browser tab."
      }
      actions={
        canStart ? (
          <button type="button" onClick={() => void sync()} className={PRIMARY_BUTTON}>
            <RefreshCw className="icon-size-200" aria-hidden="true" />
            Synchronize now
          </button>
        ) : undefined
      }
    >
      {!canSync && (
        <p className="mt-s text-200 leading-200 text-foreground">{contact}</p>
      )}
    </BannerShell>
  );
}
