import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { loadConnectionUsageEvidence } from "./backend";
import { previewConnectionUsageEvidence } from "./connections-demo";
import {
  diffConnectionInventories,
  mergePrincipalDirectories,
  usagesByConnection,
  workspaceConnectionUsages,
  type ConnectionUsage,
  type PrincipalDirectory,
  type WorkspaceProvenanceEvidence,
} from "./connections";
import type { ConfigKV, Item } from "./model";
import { useAtlas } from "./store";

/** Principals the Connections page can name, shared by its tables and detail panel. */
export const ConnectionDirectoryContext = createContext<PrincipalDirectory>([]);

export function useConnectionDirectory(): PrincipalDirectory {
  return useContext(ConnectionDirectoryContext);
}

/** Differences with the previous inventory, read once when the page opens. */
export function useInventoryChanges() {
  const { connectionInventory } = useAtlas();
  const { inventory, previous, previousAvailable, previousLoading, previousError, loadPrevious } = connectionInventory;
  useEffect(() => {
    if (inventory && previousAvailable && !previous && !previousError) void loadPrevious();
  }, [inventory, loadPrevious, previous, previousAvailable, previousError]);
  const changes = useMemo(
    () => (inventory && previous ? diffConnectionInventories(previous, inventory) : []),
    [inventory, previous],
  );
  return {
    changes,
    previous,
    previousAvailable,
    previousError,
    loading: previousLoading || (previousAvailable && !previous && !previousError),
  };
}

export interface ConnectionUsageState {
  usages: ReadonlyMap<string, ConnectionUsage[]>;
  /** Principals of every synchronized workspace, to name connection owners. */
  principals: PrincipalDirectory;
  /** Stored snapshots of the other workspaces are still being read. */
  loading: boolean;
}

interface ActiveWorkspace {
  workspaceId: string;
  workspaceName: string;
  config: readonly ConfigKV[];
  items: readonly Item[];
  principals: PrincipalDirectory;
}

type Loader = (isPreview: boolean, workspaceIds: readonly string[]) => Promise<WorkspaceProvenanceEvidence[]>;

/**
 * Items that use each connection across every synchronized workspace. The
 * active workspace comes from the loaded data; the others from their latest
 * stored snapshot, read again when one of their snapshots changes.
 */
export function useConnectionUsages(
  isPreview: boolean,
  active: ActiveWorkspace,
  workspaces: ReadonlyArray<{ id: string; snapshotId?: string }>,
  loader: Loader = loadConnectionUsageEvidence,
): ConnectionUsageState {
  const activeId = active.workspaceId.toLowerCase();
  const others = useMemo(
    () => workspaces.filter((workspace) => workspace.id.toLowerCase() !== activeId && workspace.snapshotId),
    [activeId, workspaces],
  );
  const key = others.map((workspace) => `${workspace.id}:${workspace.snapshotId}`).sort().join("|");
  const [loaded, setLoaded] = useState<{ key: string; evidence: WorkspaceProvenanceEvidence[] }>();

  useEffect(() => {
    if (isPreview || !key) return;
    let alive = true;
    const ids = key.split("|").map((entry) => entry.split(":")[0]);
    loader(false, ids)
      .then((evidence) => {
        if (alive) setLoaded({ key, evidence });
      })
      .catch(() => {
        if (alive) setLoaded({ key, evidence: [] });
      });
    return () => {
      alive = false;
    };
  }, [isPreview, key, loader]);

  const activeUsages = useMemo(
    () => workspaceConnectionUsages([{
      workspaceId: active.workspaceId,
      workspaceName: active.workspaceName,
      config: active.config,
      items: active.items,
    }]),
    [active.config, active.items, active.workspaceId, active.workspaceName],
  );
  const otherEvidence = useMemo(
    () => (isPreview ? previewConnectionUsageEvidence() : loaded?.evidence ?? [])
      .filter((workspace) => workspace.workspaceId.toLowerCase() !== activeId),
    [activeId, isPreview, loaded],
  );
  const usages = useMemo(
    () => usagesByConnection([...activeUsages, ...workspaceConnectionUsages(otherEvidence)]),
    [activeUsages, otherEvidence],
  );
  const principals = useMemo(
    () => mergePrincipalDirectories(active.principals, ...otherEvidence.map((workspace) => workspace.principals ?? [])),
    [active.principals, otherEvidence],
  );
  return { usages, principals, loading: !isPreview && !!key && loaded?.key !== key };
}
