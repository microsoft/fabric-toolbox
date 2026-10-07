import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, RefreshCw, Search, X } from "lucide-react";
import { PreviewApiNotice } from "./PreviewApiNotice";
import { useAtlas } from "../store";
import {
  addWorkspaceScope,
  discoverWorkspaces,
  removeWorkspaceScope,
  type WorkspaceDiscovery,
} from "../workspace-scope";

type DiscoveredWorkspace = WorkspaceDiscovery["workspaces"][number];

type DiscoveryState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; workspaces: DiscoveredWorkspace[]; truncated: boolean };

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function WorkspaceScopeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    isPreview,
    currentUser,
    workspaceScopes,
    activeWorkspaceId,
    reloadWorkspaceScopes,
    syncing,
  } = useAtlas();
  const [discovery, setDiscovery] = useState<DiscoveryState>({
    status: "loading",
  });
  const [filter, setFilter] = useState("");
  const [pendingId, setPendingId] = useState<string>();
  const [changeError, setChangeError] = useState<string>();
  const [announcement, setAnnouncement] = useState("");
  const generation = useRef(0);
  const filterId = useId();

  const discover = useCallback(async () => {
    const current = generation.current + 1;
    generation.current = current;
    setDiscovery({ status: "loading" });
    try {
      const result = await discoverWorkspaces(isPreview, {
        id: currentUser.id,
        email: currentUser.email,
      });
      if (generation.current !== current) return;
      setDiscovery({
        status: "ready",
        workspaces: result.workspaces,
        truncated: result.truncated,
      });
    } catch (error) {
      if (generation.current !== current) return;
      setDiscovery({ status: "error", message: message(error) });
    }
  }, [currentUser.email, currentUser.id, isPreview]);

  useEffect(() => {
    if (!open) return;
    window.queueMicrotask(() => {
      setFilter("");
      setChangeError(undefined);
      setAnnouncement("");
      void discover();
    });
    return () => {
      generation.current += 1;
    };
  }, [discover, open]);

  const selectedIds = useMemo(
    () => new Set(workspaceScopes.map((scope) => scope.id)),
    [workspaceScopes],
  );

  const rows = useMemo(() => {
    if (discovery.status !== "ready") return [];
    const discovered = new Map(
      discovery.workspaces.map((workspace) => [workspace.id, workspace]),
    );
    const merged: (DiscoveredWorkspace & { discovered: boolean })[] = [
      ...discovery.workspaces.map((workspace) => ({
        ...workspace,
        discovered: true,
      })),
      ...workspaceScopes
        .filter((scope) => !discovered.has(scope.id))
        .map((scope) => ({
          id: scope.id,
          displayName: scope.displayName,
          workspaceType: scope.workspaceType,
          capacityId: scope.capacityId,
          discovered: false,
        })),
    ];
    const query = filter.trim().toLowerCase();
    return merged
      .filter(
        (workspace) =>
          !query ||
          workspace.displayName.toLowerCase().includes(query) ||
          workspace.id.includes(query),
      )
      .sort((left, right) => {
        const selectedOrder =
          Number(selectedIds.has(right.id)) - Number(selectedIds.has(left.id));
        return (
          selectedOrder || left.displayName.localeCompare(right.displayName)
        );
      });
  }, [discovery, filter, selectedIds, workspaceScopes]);

  const toggle = async (workspace: DiscoveredWorkspace, include: boolean) => {
    setPendingId(workspace.id);
    setChangeError(undefined);
    try {
      const user = { id: currentUser.id, email: currentUser.email };
      if (include) {
        await addWorkspaceScope(isPreview, user, {
          id: workspace.id,
          displayName: workspace.displayName,
          workspaceType: workspace.workspaceType,
          capacityId: workspace.capacityId,
        });
      } else {
        await removeWorkspaceScope(isPreview, user, workspace.id);
      }
      await reloadWorkspaceScopes();
      setAnnouncement(
        `${workspace.displayName} ${include ? "added to" : "removed from"} the shared scope.`,
      );
    } catch (error) {
      setChangeError(message(error));
    } finally {
      setPendingId(undefined);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {open && (
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[120] bg-black/55" />
          <div className="pointer-events-none fixed inset-0 z-[121] flex items-center justify-center p-m sm:p-xl">
            <Dialog.Content asChild>
              <section className="pointer-events-auto flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-fabric-16">
                <header className="flex items-start gap-m border-b border-border p-l">
                  <div className="min-w-0 flex-1">
                    <Dialog.Title className="font-heading text-500 font-bold leading-500">
                      Manage workspace scope
                    </Dialog.Title>
                    <Dialog.Description className="mt-xxs text-200 leading-200 text-muted-foreground">
                      Selected workspaces are shared with every authenticated
                      Atlas user. Unselected discovery results are never
                      stored.
                    </Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      aria-label="Close workspace scope"
                      className="flex min-h-[var(--atlas-touch-target)] min-w-[var(--atlas-touch-target)] items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <X className="icon-size-200" aria-hidden="true" />
                    </button>
                  </Dialog.Close>
                </header>

                <div className="flex min-h-0 flex-1 flex-col gap-m overflow-y-auto p-l">
                  <PreviewApiNotice featureIds={["fabric-app-functions"]} />

                  <div className="flex flex-col gap-xs">
                    <label htmlFor={filterId} className="text-200 font-semibold">
                      Filter discovered workspaces
                    </label>
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute left-m top-1/2 icon-size-200 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <input
                        id={filterId}
                        type="search"
                        value={filter}
                        onChange={(event) => setFilter(event.target.value)}
                        placeholder="Workspace name or ID"
                        className="min-h-[var(--atlas-touch-target)] w-full rounded-md border border-input bg-card pl-xxxl pr-m text-300 text-foreground placeholder:text-muted-foreground sm:min-h-[var(--atlas-control-height)]"
                      />
                    </div>
                  </div>

                  {syncing && (
                    <p role="status" className="text-200 text-muted-foreground">
                      Scope changes are paused while a synchronization is running.
                    </p>
                  )}

                  {changeError && (
                    <div
                      role="alert"
                      className="flex items-start gap-s rounded-lg border border-destructive/35 bg-destructive/10 p-m text-200 leading-200 text-foreground"
                    >
                      <AlertTriangle className="mt-xxs icon-size-200 shrink-0 text-destructive" aria-hidden="true" />
                      <span className="break-words">{changeError}</span>
                    </div>
                  )}

                  {discovery.status === "loading" && (
                    <div role="status" className="flex flex-col gap-s">
                      <span className="text-200 text-muted-foreground">
                        Discovering workspaces available to the Atlas app identity…
                      </span>
                      {[0, 1, 2].map((index) => (
                        <span
                          key={index}
                          aria-hidden="true"
                          className="block h-xxxl rounded-md bg-muted"
                        />
                      ))}
                    </div>
                  )}

                  {discovery.status === "error" && (
                    <div
                      role="alert"
                      className="flex flex-col gap-s rounded-lg border border-destructive/35 bg-destructive/10 p-m text-200 leading-200 text-foreground"
                    >
                      <div className="flex items-center gap-s font-semibold">
                        <AlertTriangle className="icon-size-200 text-destructive" aria-hidden="true" />
                        Workspace discovery failed
                      </div>
                      <p className="break-words">{discovery.message}</p>
                      <button
                        type="button"
                        onClick={() => void discover()}
                        className="inline-flex min-h-[var(--atlas-touch-target)] items-center gap-s self-start rounded-md border border-border bg-card px-m text-200 font-semibold text-foreground hover:bg-accent sm:min-h-[var(--atlas-control-height)]"
                      >
                        <RefreshCw className="icon-size-200" aria-hidden="true" />
                        Retry discovery
                      </button>
                    </div>
                  )}

                  {discovery.status === "ready" && (
                    <>
                      {discovery.truncated && (
                        <p role="note" className="rounded-lg border border-status-warning/35 bg-status-warning/10 p-m text-200 leading-200 text-foreground">
                          Fabric returned more workspaces than one discovery
                          can list. Some accessible workspaces are not shown.
                        </p>
                      )}
                      {rows.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-border p-l text-center text-200 leading-200 text-muted-foreground">
                          {filter.trim()
                            ? "No discovered workspace matches this filter."
                            : "The Atlas app identity cannot see any workspace. Grant it workspace access in Fabric, then retry discovery."}
                        </p>
                      ) : (
                        <ul aria-label="Discovered workspaces" className="divide-y divide-border rounded-lg border border-border">
                          {rows.map((workspace) => {
                            const selected = selectedIds.has(workspace.id);
                            const active = workspace.id === activeWorkspaceId;
                            const checkboxId = `scope-${workspace.id}`;
                            const pending = pendingId === workspace.id;
                            return (
                              <li key={workspace.id} className="flex items-center gap-m px-m py-s">
                                <input
                                  id={checkboxId}
                                  type="checkbox"
                                  checked={selected}
                                  disabled={
                                    syncing ||
                                    pendingId != null ||
                                    (selected && active)
                                  }
                                  aria-describedby={`${checkboxId}-detail`}
                                  onChange={(event) =>
                                    void toggle(workspace, event.target.checked)
                                  }
                                  className="size-l shrink-0 accent-primary"
                                />
                                <label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer py-xs">
                                  <span className="block truncate text-300 font-semibold">
                                    {workspace.displayName}
                                  </span>
                                  <span
                                    id={`${checkboxId}-detail`}
                                    className="block truncate font-monospace text-200 text-muted-foreground"
                                  >
                                    {pending
                                      ? "Saving…"
                                      : active && selected
                                        ? "Active workspace · switch before removing"
                                        : workspace.discovered
                                          ? workspace.id
                                          : `${workspace.id} · not returned by discovery`}
                                  </span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </>
                  )}
                  <p role="status" aria-live="polite" className="sr-only">
                    {announcement}
                  </p>
                </div>
              </section>
            </Dialog.Content>
          </div>
        </Dialog.Portal>
      )}
    </Dialog.Root>
  );
}
