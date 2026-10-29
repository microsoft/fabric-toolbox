import { createContext, useCallback, useContext } from "react";
import { useAtlas } from "./store";

export const HEADER_WORKSPACE_SELECT_ID = "atlas-header-workspace";
export const DRAWER_WORKSPACE_SELECT_ID = "atlas-drawer-workspace";
export const HUB_WORKSPACE_SELECT_ID = "atlas-hub-workspace";
export const FIRST_SYNC_WORKSPACE_SELECT_ID = "atlas-first-sync-workspace";

/** Switches the active workspace; `focusId` names the control that started it. */
export type WorkspaceSwitchHandler = (
  workspaceId: string,
  focusId?: string,
) => void;

export const WorkspaceSwitchContext =
  createContext<WorkspaceSwitchHandler | null>(null);

/**
 * Uses the application shell's switch handler when present so the route and
 * focus survive the rehydration; falls back to the store contract otherwise.
 */
export function useWorkspaceSwitch(): WorkspaceSwitchHandler {
  const handler = useContext(WorkspaceSwitchContext);
  const { selectWorkspace } = useAtlas();
  return useCallback(
    (workspaceId: string, focusId?: string) => {
      if (handler) handler(workspaceId, focusId);
      else selectWorkspace(workspaceId);
    },
    [handler, selectWorkspace],
  );
}

export interface WorkspaceFocusCapture {
  order: string[];
  before: Map<string, Element | null>;
}

/**
 * Records which selector started a switch plus the equivalent selectors that
 * can stand in for it once the shell or the first-sync gate remounts.
 */
export function captureWorkspaceFocus(
  sourceId: string | undefined,
  root: Document = document,
): WorkspaceFocusCapture {
  const order = sourceId
    ? [
        ...new Set([
          sourceId,
          HEADER_WORKSPACE_SELECT_ID,
          FIRST_SYNC_WORKSPACE_SELECT_ID,
        ]),
      ]
    : [];
  return {
    order,
    before: new Map(order.map((id) => [id, root.getElementById(id)])),
  };
}

/**
 * Focuses the first remounted selector from the capture. Elements that were
 * already present when the switch started are skipped because they are either
 * still focused or about to be replaced by rehydration.
 */
export function restoreWorkspaceFocus(
  capture: WorkspaceFocusCapture,
  root: Document = document,
): HTMLElement | undefined {
  for (const id of capture.order) {
    const element = root.getElementById(id);
    if (
      !(element instanceof HTMLElement) ||
      !element.isConnected ||
      element === capture.before.get(id) ||
      (element instanceof HTMLSelectElement && element.disabled)
    ) {
      continue;
    }
    element.focus();
    if (root.activeElement === element) return element;
  }
  return undefined;
}
