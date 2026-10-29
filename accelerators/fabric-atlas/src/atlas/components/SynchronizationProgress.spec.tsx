import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SynchronizationProgress } from "./SynchronizationProgress";
import {
  formatSyncElapsed,
  SYNC_PHASES,
  syncPhaseIndex,
} from "../synchronization-progress";

describe("SynchronizationProgress", () => {
  afterEach(() => vi.useRealTimers());

  it("maps real synchronization milestones to four visible run phases", () => {
    expect(syncPhaseIndex(3)).toBe(0);
    expect(syncPhaseIndex(8)).toBe(0);
    expect(syncPhaseIndex(20)).toBe(1);
    expect(syncPhaseIndex(59)).toBe(1);
    expect(syncPhaseIndex(62)).toBe(2);
    expect(syncPhaseIndex(70)).toBe(3);
    expect(syncPhaseIndex(97)).toBe(3);
    expect(SYNC_PHASES.map((phase) => phase.label)).toEqual([
      "Discover",
      "Collect",
      "Validate",
      "Publish",
    ]);
  });

  it("shows active collection and elapsed time without inventing progress", () => {
    vi.useFakeTimers();
    render(
      <SynchronizationProgress
        progress={20}
        stage="Discovering Lakehouse metadata (1/4)"
        active
        variant="banner"
      />,
    );
    act(() => vi.advanceTimersByTime(65_000));

    expect(
      screen.getByRole("region", {
        name: "Workspace synchronization status",
      }),
    ).toHaveTextContent("Phase 2 of 4");
    expect(screen.getByText("01:05")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", {
        name: "Workspace synchronization progress",
      }),
    ).toHaveAttribute("aria-valuenow", "20");
  });

  it("formats elapsed durations beyond one minute", () => {
    expect(formatSyncElapsed(125.8)).toBe("02:05");
  });
});
