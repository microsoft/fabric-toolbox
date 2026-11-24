import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_DATA } from "../model";
import type { ConnectionCollectionIssue } from "../connection-inventory-state";

const harness = vi.hoisted(() => ({ context: {} as Record<string, unknown> }));
vi.mock("../store", () => ({ useAtlas: () => harness.context }));

import { ConnectionsView } from "./Connections";

function connectionInventory(overrides: Record<string, unknown> = {}) {
  return {
    inventory: undefined,
    issue: undefined,
    loading: false,
    unavailable: false,
    previousAvailable: false,
    previousLoading: false,
    reload: vi.fn(),
    loadPrevious: vi.fn(),
    canCollect: true,
    collecting: false,
    collect: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderWith(overrides: Record<string, unknown> = {}) {
  const inventoryState = connectionInventory(overrides);
  harness.context = {
    data: SAMPLE_DATA,
    isPreview: false,
    connectionInventory: inventoryState,
    workspaceScopes: [],
    workspaceSyncStatuses: {},
    currentUser: { id: "user-1", name: "admin@example.com", email: "admin@example.com" },
  };
  render(<ConnectionsView />);
  return inventoryState;
}

const refused: ConnectionCollectionIssue = {
  reason: "unsupported",
  code: "authorization-failed",
  delegated: false,
  at: "2026-11-09T08:00:00.000Z",
};

describe("ConnectionsView collection", () => {
  beforeEach(() => {
    harness.context = {};
  });

  it("lets the synchronizer collect the inventory from the empty page", () => {
    const state = renderWith();

    fireEvent.click(screen.getByRole("button", { name: "Collect connections" }));
    expect(state.collect).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Collect it now, or let the next synchronization collect it/)).toBeInTheDocument();
  });

  it("explains a refused collection after a reload", () => {
    renderWith({ issue: refused });

    expect(screen.getByRole("status")).toHaveTextContent(
      /stored nothing: this browser could not get a delegated Fabric token \(Tenant\.Read\.All\), and the Atlas app identity is not allowed/,
    );
  });

  it("shows the Function error and progress while collecting", () => {
    renderWith({ issue: { reason: "failed", code: "invoke-failed", message: "Function timed out", at: refused.at } });
    expect(screen.getByRole("status")).toHaveTextContent(
      /Atlas could not call its tenantCollectConnections Function\. Error: Function timed out/,
    );

    document.body.innerHTML = "";
    renderWith({ collecting: true, collectStage: "Storing tenant connections (2/11)" });
    expect(screen.getByRole("status")).toHaveTextContent("Storing tenant connections (2/11)…");
    expect(screen.getByRole("button", { name: "Collecting…" })).toBeDisabled();
  });

  it("offers no collection to readers", () => {
    renderWith({ canCollect: false });

    expect(screen.queryByRole("button", { name: "Collect connections" })).not.toBeInTheDocument();
    expect(screen.getByText(/The synchronizer collects it during the next synchronization/)).toBeInTheDocument();
  });
});
