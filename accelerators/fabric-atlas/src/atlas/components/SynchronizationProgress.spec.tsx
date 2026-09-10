import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SynchronizationProgress } from "./SynchronizationProgress";
import {
  formatSyncElapsed,
  syncPhaseIndex,
} from "../synchronization-progress";

describe("SynchronizationProgress", () => {
  afterEach(() => vi.useRealTimers());

  it("maps real synchronization milestones to five visible phases", () => {
    expect(syncPhaseIndex(3)).toBe(0);
    expect(syncPhaseIndex(8)).toBe(1);
    expect(syncPhaseIndex(62)).toBe(2);
    expect(syncPhaseIndex(70)).toBe(3);
    expect(syncPhaseIndex(97)).toBe(4);
  });

  it("shows active discovery and elapsed time without inventing progress", () => {
    vi.useFakeTimers();
    render(
      <SynchronizationProgress
        progress={8}
        stage="Discovering workspace metadata"
        active
        variant="banner"
      />,
    );
    act(() => vi.advanceTimersByTime(65_000));

    expect(
      screen.getByRole("region", {
        name: "Workspace synchronization status",
      }),
    ).toHaveTextContent("Phase 2 of 5");
    expect(screen.getByText("01:05")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", {
        name: "Workspace synchronization progress",
      }),
    ).toHaveAttribute("aria-valuenow", "8");
  });

  it("formats elapsed durations beyond one minute", () => {
    expect(formatSyncElapsed(125.8)).toBe("02:05");
  });
});
