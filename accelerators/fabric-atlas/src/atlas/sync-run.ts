import { relativeTime } from "./model";
import {
  CANCELLING_STAGE,
  SYNC_PHASES,
  syncPhaseIndex,
} from "./synchronization-progress";
import type { WorkspaceScope } from "./workspace-scope";
import type { WorkspaceSyncEntry } from "./workspace-sync";

export type SyncRunKind = "running" | "cancelling" | "failed" | "idle";

export interface SyncRunInput {
  syncing: boolean;
  syncProgress: number;
  syncStage: string;
  syncError?: string;
  syncQueue: readonly WorkspaceSyncEntry[];
  syncWorkspaceId?: string;
  workspaceScopes: readonly Pick<WorkspaceScope, "id" | "displayName">[];
  activeWorkspaceId: string;
  lastSyncedAt?: string;
}

export interface SyncRunFailure {
  workspaceId: string;
  workspaceName: string;
  message: string;
}

export interface SyncRunView {
  kind: SyncRunKind;
  progress: number;
  phaseIndex: number;
  phaseLabel: string;
  stage: string;
  workspaceId?: string;
  workspaceName?: string;
  /** Position of the running workspace when a batch holds several. */
  position?: { index: number; total: number };
  failures: SyncRunFailure[];
  compactLabel: string;
  lastSyncedAt?: string;
}

/**
 * Single derivation of the browser synchronization state. The header status,
 * its progress line and the Workspace Hub banner all render from this view so
 * running, cancelling and failed states never disagree between routes.
 */
export function syncRunView(input: SyncRunInput): SyncRunView {
  const names = new Map(
    input.workspaceScopes.map((scope) => [scope.id, scope.displayName]),
  );
  const progress = Math.min(100, Math.max(0, Math.round(input.syncProgress)));
  const phaseIndex = syncPhaseIndex(progress);
  const workspaceId =
    input.syncWorkspaceId ?? (input.syncing ? input.activeWorkspaceId : undefined);
  const workspaceName = workspaceId ? names.get(workspaceId) : undefined;
  const runningIndex = input.syncQueue.findIndex(
    (entry) => entry.workspaceId === workspaceId,
  );
  const position =
    input.syncing && input.syncQueue.length > 1 && runningIndex >= 0
      ? { index: runningIndex + 1, total: input.syncQueue.length }
      : undefined;

  const failures: SyncRunFailure[] = input.syncQueue
    .filter((entry) => entry.status === "failed")
    .map((entry) => ({
      workspaceId: entry.workspaceId,
      workspaceName: names.get(entry.workspaceId) ?? entry.workspaceId,
      message:
        entry.workspaceId === input.activeWorkspaceId && input.syncError
          ? input.syncError
          : (entry.error ?? "Synchronization failed."),
    }));
  if (
    input.syncError &&
    !failures.some((failure) => failure.workspaceId === input.activeWorkspaceId)
  ) {
    failures.unshift({
      workspaceId: input.activeWorkspaceId,
      workspaceName:
        names.get(input.activeWorkspaceId) ?? input.activeWorkspaceId,
      message: input.syncError,
    });
  }

  let kind: SyncRunKind;
  let compactLabel: string;
  if (input.syncing && input.syncStage === CANCELLING_STAGE) {
    kind = "cancelling";
    compactLabel = CANCELLING_STAGE;
  } else if (input.syncing) {
    kind = "running";
    compactLabel = [
      position && `${position.index} of ${position.total}`,
      position && workspaceName,
      input.syncStage,
      `${progress}%`,
    ]
      .filter(Boolean)
      .join(" · ");
  } else if (failures.length > 0) {
    kind = "failed";
    compactLabel =
      failures.length > 1
        ? `${failures.length} workspaces failed to sync`
        : failures[0].workspaceId === input.activeWorkspaceId
          ? "Sync failed"
          : `${failures[0].workspaceName} sync failed`;
  } else {
    kind = "idle";
    compactLabel = input.lastSyncedAt
      ? `synced ${relativeTime(input.lastSyncedAt)}`
      : "not synchronized";
  }

  return {
    kind,
    progress,
    phaseIndex,
    phaseLabel: SYNC_PHASES[phaseIndex].label,
    stage: input.syncStage,
    workspaceId,
    workspaceName,
    position,
    failures,
    compactLabel,
    lastSyncedAt: input.lastSyncedAt,
  };
}
