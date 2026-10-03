import { useId } from "react";
import { AlertTriangle } from "lucide-react";
import { useAtlas } from "../store";
import { cn } from "../ui";
import { useWorkspaceSwitch } from "../workspace-switch";

const SYNC_LOCK_HINT =
  "Cancel the active synchronization before changing workspace.";

export function WorkspaceSelector({
  id,
  className,
  hideWhenSingle = false,
  compact = false,
}: {
  id?: string;
  className?: string;
  hideWhenSingle?: boolean;
  /** Visually hides the label and hint for toolbars; both stay programmatic. */
  compact?: boolean;
}) {
  const {
    workspaceScopes,
    workspaceScopesLoading,
    workspaceScopesError,
    activeWorkspaceId,
    syncing,
  } = useAtlas();
  const switchWorkspace = useWorkspaceSwitch();
  const generatedId = useId();
  const hintId = useId();
  const selectId = id ?? generatedId;
  const single = workspaceScopes.length < 2;
  if (hideWhenSingle && single && (compact || !workspaceScopesError)) {
    return null;
  }

  const hint = syncing
    ? SYNC_LOCK_HINT
    : workspaceScopesLoading
      ? "Loading the shared workspace scope."
      : single
        ? "Only one workspace is in the shared Atlas scope."
        : `${workspaceScopes.length} workspaces are in the shared Atlas scope.`;

  return (
    <div
      className={cn(
        "flex min-w-0",
        compact ? "items-center" : "flex-col gap-xs",
        className,
      )}
    >
      <label
        htmlFor={selectId}
        className={
          compact ? "sr-only" : "text-200 font-semibold text-foreground"
        }
      >
        Active workspace
      </label>
      <select
        id={selectId}
        value={activeWorkspaceId}
        aria-describedby={hintId}
        title={syncing ? SYNC_LOCK_HINT : undefined}
        disabled={syncing || workspaceScopesLoading || single}
        onChange={(event) => switchWorkspace(event.target.value, selectId)}
        className={cn(
          "w-full min-w-0 rounded-md border border-input bg-card text-foreground disabled:opacity-70",
          compact
            ? "min-h-[var(--atlas-touch-target)] truncate pl-s pr-xl text-[length:var(--text-300)] font-semibold md:min-h-[var(--atlas-control-height)]"
            : "min-h-[var(--atlas-touch-target)] px-m text-[length:var(--text-300)] sm:min-h-[var(--atlas-control-height)]",
        )}
      >
        {!workspaceScopes.some((scope) => scope.id === activeWorkspaceId) && (
          <option value={activeWorkspaceId} disabled>
            Select a workspace
          </option>
        )}
        {workspaceScopes.map((scope) => (
          <option key={scope.id} value={scope.id}>
            {scope.displayName}
          </option>
        ))}
      </select>
      <p
        id={hintId}
        className={
          compact ? "sr-only" : "text-200 leading-200 text-muted-foreground"
        }
      >
        {hint}
      </p>
      {workspaceScopesError && !compact && (
        <p
          role="alert"
          className="flex items-start gap-xs text-200 leading-200 text-foreground"
        >
          <AlertTriangle
            className="mt-xxs icon-size-100 shrink-0 text-destructive"
            aria-hidden="true"
          />
          {workspaceScopesError}
        </p>
      )}
    </div>
  );
}
