import { useId, useMemo } from "react";
import { useDomainFilter } from "../domain-filter";
import { domainScopeKeys, NO_DOMAIN_KEY, UNKNOWN_DOMAIN_KEY, workspaceDomainGroups } from "../domain-governance";
import { AlertTriangle } from "lucide-react";
import { DomainFilterPopover } from "./DomainFilterPopover";
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
    workspaceSyncStatuses,
    data,
  } = useAtlas();
  const [domainFilter, setDomainFilter] = useDomainFilter();
  const groups = useMemo(
    () => workspaceDomainGroups(workspaceScopes, workspaceSyncStatuses, data),
    [data, workspaceScopes, workspaceSyncStatuses],
  );
  const switchWorkspace = useWorkspaceSwitch();
  const generatedId = useId();
  const hintId = useId();
  const selectId = id ?? generatedId;
  const single = workspaceScopes.length < 2;
  const showDomains =
    groups.length > 1 || groups.some((group) => group.key !== NO_DOMAIN_KEY && group.key !== UNKNOWN_DOMAIN_KEY);
  if (hideWhenSingle && single && !showDomains && (compact || !workspaceScopesError)) {
    return null;
  }
  const domainScope = domainScopeKeys(showDomains ? domainFilter : "", data.governanceEvidence);
  const scopedGroups = groups.filter((group) => domainScope.has(group.key));
  const scopeName = new Map(workspaceScopes.map((scope) => [scope.id, scope.displayName]));
  const visibleGroups = scopedGroups.length > 0 ? scopedGroups : groups;
  const option = (id: string) => (
    <option key={id} value={id}>
      {scopeName.get(id) ?? id}
    </option>
  );

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
      {showDomains && (
        <DomainFilterPopover
          groups={groups}
          evidence={data.governanceEvidence}
          value={showDomains ? domainFilter : ""}
          onChange={setDomainFilter}
          compact={compact}
        />
      )}
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
          "min-w-0 rounded-md border border-input bg-card text-foreground disabled:opacity-70",
          compact
            ? "min-w-[9rem] flex-1 min-h-[var(--atlas-touch-target)] truncate pl-s pr-xl text-[length:var(--text-300)] font-semibold md:min-h-[var(--atlas-control-height)]"
            : "w-full min-h-[var(--atlas-touch-target)] px-m text-[length:var(--text-300)] sm:min-h-[var(--atlas-control-height)]",
        )}
      >
        {!workspaceScopes.some((scope) => scope.id === activeWorkspaceId) && (
          <option value={activeWorkspaceId} disabled>
            Select a workspace
          </option>
        )}
        {scopedGroups.length > 0 && !scopedGroups.some((group) => group.workspaceIds.includes(activeWorkspaceId)) &&
          workspaceScopes.some((scope) => scope.id === activeWorkspaceId) &&
          option(activeWorkspaceId)}
        {showDomains
          ? visibleGroups.map((group) => (
              <optgroup key={group.key} label={group.label}>
                {group.workspaceIds.map(option)}
              </optgroup>
            ))
          : workspaceScopes.map((scope) => option(scope.id))}
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
