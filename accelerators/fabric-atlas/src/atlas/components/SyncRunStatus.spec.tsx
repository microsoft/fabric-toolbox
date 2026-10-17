import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AtlasContextValue } from "../store";
import { CANCELLING_STAGE } from "../synchronization-progress";

const harness = vi.hoisted(() => ({ context: undefined as unknown }));

vi.mock("../store", () => ({ useAtlas: () => harness.context }));

import { SyncRunCompact, SyncRunProgressLine } from "./SyncRunStatus";

const MAIN = "6bf4c521-7412-4e6b-8867-68253bbfb18a";

function setContext(overrides: Partial<AtlasContextValue> = {}) {
  harness.context = {
    syncing: false,
    syncProgress: 0,
    syncStage: "Ready to sync",
    syncError: undefined,
    syncQueue: [],
    syncWorkspaceId: undefined,
    workspaceScopes: [{ id: MAIN, displayName: "FGI-MAIN", persisted: true }],
    activeWorkspaceId: MAIN,
    lastSyncedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
    ...overrides,
  } as unknown as AtlasContextValue;
}

describe("SyncRunCompact", () => {
  it("announces the running stage and percentage with a non-shifting progress line", () => {
    setContext({
      syncing: true,
      syncProgress: 88,
      syncStage: "Writing jobs and lineage",
      syncWorkspaceId: MAIN,
    });
    const { container } = render(
      <div className="relative">
        <SyncRunCompact onOpenDetails={vi.fn()} />
        <SyncRunProgressLine />
      </div>,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Writing jobs and lineage · 88%",
    );
    const line = container.querySelector('[data-sync-progress-line="true"]');
    expect(line).not.toBeNull();
    expect(line).toHaveAttribute("aria-hidden", "true");
    expect(line?.className).toContain("absolute");
  });

  it("uses the same component for cancellation", () => {
    setContext({ syncing: true, syncStage: CANCELLING_STAGE, syncWorkspaceId: MAIN });
    render(<SyncRunCompact onOpenDetails={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Cancelling synchronization",
    );
  });

  it("keeps errors short and opens the complete error details on request", () => {
    const onOpenDetails = vi.fn();
    setContext({ syncError: `Synchronization failed. ${"detail ".repeat(80)}` });
    const { container } = render(
      <div className="relative">
        <SyncRunCompact onOpenDetails={onOpenDetails} />
        <SyncRunProgressLine />
      </div>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Sync failed");
    expect(screen.getByRole("status").textContent!.length).toBeLessThan(40);
    expect(container.querySelector('[data-sync-progress-line="true"]')).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Show synchronization error details" }),
    );
    expect(onOpenDetails).toHaveBeenCalledTimes(1);
  });

  it("shows the last synchronization time when idle", () => {
    setContext();
    render(<SyncRunCompact onOpenDetails={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("synced 2m ago");
  });
});
