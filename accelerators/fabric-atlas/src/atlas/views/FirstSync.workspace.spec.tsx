import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThemeContext } from "@/hooks/theme.context";
import { SAMPLE_DATA } from "../model";
import type { AtlasContextValue } from "../store";
import type { WorkspaceScope } from "../workspace-scope";

const harness = vi.hoisted(() => ({ context: undefined as unknown }));

vi.mock("../store", () => ({ useAtlas: () => harness.context }));

import { FirstSyncView } from "./FirstSync";

const SYNCED = "6bf4c521-7412-4e6b-8867-68253bbfb18a";
const UNSYNCED = "9a2a1b5e-58e3-4c43-9a8f-1f7c6f3f2a10";

function renderGate(scopes: WorkspaceScope[], overrides = {}) {
  const value = {
    data: {
      ...SAMPLE_DATA,
      workspace: {
        fabricId: UNSYNCED,
        displayName: "Unsynced workspace",
        capacity: "",
        region: "",
      },
      items: [],
      edges: [],
      principals: [],
    },
    configured: true,
    canSync: false,
    sync: vi.fn(),
    cancelSync: vi.fn(),
    syncing: false,
    syncError: undefined,
    syncProgress: 0,
    syncStage: "Ready to sync",
    syncStartedAt: undefined,
    hasData: false,
    requiresDeploymentSync: true,
    workspaceScopes: scopes,
    workspaceScopesLoading: false,
    workspaceScopesError: undefined,
    activeWorkspaceId: UNSYNCED,
    selectWorkspace: vi.fn(),
    ...overrides,
  } as unknown as AtlasContextValue;
  harness.context = value;
  render(
    <ThemeContext.Provider
      value={{ isDark: false, toggleTheme: () => undefined }}
    >
      <FirstSyncView />
    </ThemeContext.Provider>,
  );
  return value;
}

describe("FirstSyncView workspace scope", () => {
  const scopes: WorkspaceScope[] = [
    { id: SYNCED, displayName: "Synced workspace", persisted: true },
    { id: UNSYNCED, displayName: "Unsynced workspace", persisted: true },
  ];

  it("lets a blocked user switch back to a synchronized workspace", () => {
    const value = renderGate(scopes);

    expect(
      screen.getByText(/to run this synchronization\./),
    ).toBeInTheDocument();
    const selector = screen.getByRole("combobox", { name: "Active workspace" });
    expect(selector).toHaveValue(UNSYNCED);
    fireEvent.change(selector, { target: { value: SYNCED } });
    expect(value.selectWorkspace).toHaveBeenCalledWith(SYNCED);
  });

  it("locks the selector while the gate synchronization runs", () => {
    renderGate(scopes, { syncing: true, canSync: true, syncProgress: 20 });

    expect(
      screen.getByRole("combobox", { name: "Active workspace" }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        "Cancel the active synchronization before changing workspace.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the single-workspace gate unchanged", () => {
    renderGate([scopes[1]]);

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Start first sync" }),
    ).toBeDisabled();
  });
});
