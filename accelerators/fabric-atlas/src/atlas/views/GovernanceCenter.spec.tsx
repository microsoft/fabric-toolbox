import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AtlasProvider } from "../store";
import { GovernanceCenterView, RadarPanel } from "./GovernanceCenter";

function renderView() {
  const onNavigate = vi.fn();
  render(
    <AtlasProvider isPreview>
      <GovernanceCenterView onNavigate={onNavigate} />
    </AtlasProvider>,
  );
  return onNavigate;
}

describe("GovernanceCenterView", () => {
  it("groups findings, changes, history and coverage in one view", () => {
    renderView();

    expect(
      screen.getByRole("heading", { name: "Governance Center" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Findings/ })).toBeVisible();
    expect(screen.getByRole("tab", { name: /Changes/ })).toBeVisible();
    expect(screen.getByRole("tab", { name: /History/ })).toBeVisible();
    expect(screen.getByRole("tab", { name: /Coverage/ })).toBeVisible();
    expect(screen.getByRole("tab", { name: /Posture/ })).toBeVisible();
    expect(
      screen.getByRole("heading", {
        name: "Your governance baseline is ready",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("No new priority alert")).toBeInTheDocument();
    expect(
      screen.getByText("Workspace governance summary"),
    ).toBeInTheDocument();
  });

  it("supports arrow-key tab navigation", async () => {
    renderView();
    const findings = screen.getByRole("tab", { name: /Findings/ });
    await act(async () => {
      findings.focus();
      fireEvent.keyDown(findings, { key: "ArrowRight" });
    });

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /Changes/ })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(
      screen.getByRole("heading", { name: "A second snapshot is required" }),
    ).toBeInTheDocument();
  });

  it("opens evidence from an actionable finding", () => {
    const onNavigate = renderView();
    const actions = screen.getAllByRole("button", { name: "Open evidence" });
    expect(actions.length).toBeGreaterThan(0);

    fireEvent.click(actions[0]);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("shows the two-snapshot requirement in Change Center preview", async () => {
    renderView();
    fireEvent.click(screen.getByRole("tab", { name: /Changes/ }));

    expect(
      await screen.findByRole("heading", {
        name: "A second snapshot is required",
      }),
    ).toBeInTheDocument();
  });

  it("saves a personal governance view in preview", async () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Saved views/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Save current filters" }),
    );
    fireEvent.change(screen.getByLabelText("View name"), {
      target: { value: "Priority findings" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.getByText("Priority findings")).toBeInTheDocument(),
    );
  });

  it("shows posture targets on a fixed scoring surface", () => {
    renderView();
    fireEvent.click(screen.getByRole("tab", { name: /Posture/ }));

    expect(
      screen.getByRole("heading", { name: /pillars at target/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Fixed 0–100 scale/)).toBeInTheDocument();
    expect(screen.getAllByText("Target 70%").length).toBeGreaterThan(0);
  });

  it("adds a shared exception without hiding the raw finding", async () => {
    renderView();
    const evidenceCount = screen.getAllByRole("button", {
      name: "Open evidence",
    }).length;
    fireEvent.click(
      screen.getAllByRole("button", { name: "Add exception" })[0],
    );
    fireEvent.change(screen.getByLabelText("Justification"), {
      target: { value: "Accepted while the owner record is corrected." },
    });
    fireEvent.change(screen.getByLabelText("Expires"), {
      target: { value: "2099-09-05T12:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save exception" }));

    await waitFor(() =>
      expect(screen.getByText("Active exception")).toBeInTheDocument(),
    );
    expect(
      screen.getAllByRole("button", { name: "Open evidence" }),
    ).toHaveLength(evidenceCount);
  });
});

describe("RadarPanel", () => {
  const readyRadar = {
    state: "ready" as const,
    currentSnapshotId: "current",
    previousSnapshotId: "previous",
    deltas: [],
    riskyChanges: [],
    observedChanges: [],
    provenanceComplete: true,
  };
  const baseProps = {
    entries: [],
    suppressed: [],
    loading: false,
    historyLoading: false,
    failedSnapshotIds: [],
    pendingIds: new Set<string>(),
    onAcknowledge: vi.fn(async () => undefined),
    onMute: vi.fn(async () => undefined),
    onRestore: vi.fn(async () => undefined),
    onReviewChanges: vi.fn(),
    onRetryHistory: vi.fn(),
    onOpen: vi.fn(),
    onDownload: vi.fn(),
  };

  it("keeps monitored signals in expandable details when no risk is new", () => {
    render(<RadarPanel {...baseProps} radar={readyRadar} />);

    expect(
      screen.getByText("No new high-priority regression detected"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Radar monitored signals"),
    ).toHaveTextContent("AccessSensitivityLineageConsumed removals");
  });

  it("shows an armed baseline immediately after the first snapshot", () => {
    render(
      <RadarPanel
        {...baseProps}
        radar={{
          state: "baseline",
          currentSnapshotId: "current",
          reason: "first-snapshot",
        }}
      />,
    );

    expect(screen.getByText("Baseline established")).toBeInTheDocument();
    expect(
      screen.getByText(/first validated snapshot is now the reference/i),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Radar monitored signals"),
    ).toHaveTextContent("AccessSensitivityLineageConsumed removals");
  });

  it("links non-risky synchronized changes from the clear Radar state", () => {
    const onReviewChanges = vi.fn();
    render(
      <RadarPanel
        {...baseProps}
        radar={{
          ...readyRadar,
          observedChanges: [
            {
              id: "item-added:new-warehouse",
              type: "item-added",
              domain: "item",
              snapshotId: "current",
              syncedAt: "2026-08-30T13:00:00.000Z",
              label: "New warehouse added",
              itemFabricId: "new-warehouse",
            },
          ],
        }}
        onReviewChanges={onReviewChanges}
      />,
    );

    expect(
      screen.getByText(/1 workspace change detected/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
    expect(onReviewChanges).toHaveBeenCalledTimes(1);
  });

  it("offers a retry instead of leaving a failed comparison loading", () => {
    const onRetryHistory = vi.fn();
    render(
      <RadarPanel
        {...baseProps}
        radar={{ state: "loading", missingSnapshotIds: ["previous"] }}
        failedSnapshotIds={["previous"]}
        onRetryHistory={onRetryHistory}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Retry comparison" }),
    );
    expect(onRetryHistory).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText("The latest governance comparison is unavailable"),
    ).toBeInTheDocument();
  });
});
