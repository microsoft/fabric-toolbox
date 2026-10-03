import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RadarEntry, RadarRiskKind, RiskyChange } from "../radar";
import type { PosturePillar } from "../posture";
import { AtlasProvider } from "../store";
import { GovernanceCenterView, RadarPanel } from "./GovernanceCenter";

vi.mock("../components/PostureRadar", () => ({
  PostureRadar: ({ onSelect }: { onSelect: (pillar: PosturePillar) => void }) => (
    <button onClick={() => onSelect("lineage")}>Select lineage in radar</button>
  ),
}));

function renderView(findings = false) {
  const onNavigate = vi.fn();
  render(
    <AtlasProvider isPreview>
      <GovernanceCenterView onNavigate={onNavigate} />
    </AtlasProvider>,
  );
  if (findings) fireEvent.click(screen.getByRole("tab", { name: /Findings/ }));
  return onNavigate;
}

describe("GovernanceCenterView", () => {
  it("opens on Posture and keeps the other governance sections available", async () => {
    renderView();

    const tabs = within(screen.getByRole("tablist", { name: "Governance Center sections" })).getAllByRole("tab");
    expect(tabs[0]).toHaveTextContent("Posture");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("button", { name: "Select lineage in radar" })).toBeVisible();
    expect(screen.getByText("Latest priority changes").closest("details")).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Latest priority changes"));
    expect(
      screen.getByRole("heading", { name: "Governance Center" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Findings/ })).toBeVisible();
    expect(screen.getByRole("tab", { name: /Changes/ })).toBeVisible();
    expect(screen.getByRole("tab", { name: /History/ })).toBeVisible();
    expect(screen.getByRole("tab", { name: /Coverage/ })).toBeVisible();
    expect(screen.getByRole("tab", { name: /Posture/ })).toBeVisible();
    expect(screen.getByRole("tab", { name: /Policies & AI/ })).toBeVisible();
    expect(screen.getByRole("tablist", { name: "Governance Center sections" })).toHaveClass("atlas-line-tabs");
    expect(screen.getByRole("button", { name: /Saved views/ })).toBeVisible();
    expect(
      screen.getByRole("heading", {
        name: "Your governance baseline is ready",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("No new priority alert")).toBeInTheDocument();
    expect(
      screen.queryByText("Workspace governance summary"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/first validated snapshot arms the Radar/),
    ).not.toBeInTheDocument();
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).toHaveClass("grow");
      expect(tab).not.toHaveClass("flex-1");
    }
  });

  it("groups findings by rule with compact presets and collapsed instances", () => {
    renderView(true);
    expect(screen.getByRole("group", { name: "Finding presets" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All findings" })).toHaveAttribute("aria-pressed", "true");

    const groups = within(screen.getByRole("list", { name: "Findings by rule" }))
      .getAllByRole("listitem")
      .filter((item) => item.parentElement?.getAttribute("aria-label") === "Findings by rule");
    const total = Number(
      /of (\d+) findings/.exec(screen.getByText(/of \d+ findings/).textContent ?? "")?.[1],
    );
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.length).toBeLessThan(total);
    expect(screen.getByText(/findings · \d+ rules/)).toBeInTheDocument();

    const toggle = screen.getAllByRole("button", { name: /^Show \d+ findings$/ })[0];
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const instances = screen.getByRole("list", { name: /findings$/ });
    expect(within(instances).getAllByRole("button", { name: "Open evidence" }).length).toBeGreaterThan(1);

    fireEvent.click(screen.getByRole("button", { name: "External access" }));
    expect(screen.getByRole("button", { name: "External access" })).toHaveAttribute("aria-pressed", "true");
  });

  it("splits Coverage into item families, metadata quality and sensitivity views", async () => {
    renderView();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Coverage/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Coverage/ }));
    const views = await screen.findByRole("tablist", { name: "Coverage views" });
    expect(within(views).getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Item families",
      "Metadata quality",
      "Sensitivity",
    ]);
    expect(screen.queryByRole("heading", { name: "Label distribution" })).toBeNull();

    fireEvent.mouseDown(within(views).getByRole("tab", { name: "Sensitivity" }));
    expect(await screen.findByRole("heading", { name: "Label distribution" })).toBeInTheDocument();
    expect(screen.queryByRole("listbox", { name: "Item family coverage" })).toBeNull();
  });

  it("puts the item family inventory and evidence pane first in Coverage", async () => {
    renderView();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Coverage/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Coverage/ }));

    const inventory = await screen.findByRole("listbox", { name: "Item family coverage" });
    expect(inventory).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Evidence details" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Inventory gaps" })).toBeInTheDocument();
    const collectionStatus = screen.queryByRole("heading", { name: "Collection status" });
    if (collectionStatus) {
      expect(
        inventory.compareDocumentPosition(collectionStatus) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
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
    const onNavigate = renderView(true);
    const actions = screen.getAllByRole("button", { name: "Open evidence" });
    expect(actions.length).toBeGreaterThan(0);

    fireEvent.click(actions[0]);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("opens Policies & AI and persists the real local tab in navigation state", async () => {
    const onStateChange = vi.fn();
    render(<AtlasProvider isPreview><GovernanceCenterView onNavigate={vi.fn()} onStateChange={onStateChange} /></AtlasProvider>);
    fireEvent.click(screen.getByRole("tab", { name: /Policies & AI/ }));
    expect(screen.getByRole("heading", { name: "AI governance inventory" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Evidence details" })).toBeVisible();
    expect(screen.queryByText(/Watchlists and Sync Brief are unavailable/)).not.toBeInTheDocument();
    await waitFor(() => expect(onStateChange).toHaveBeenLastCalledWith(expect.objectContaining({
      focus: expect.objectContaining({ governanceSection: "policies-ai", filters: { section: "policies-ai" } }),
    })));
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

  it("updates posture trend and evidence from the radar or keyboard-accessible pillar controls", async () => {
    const onNavigate = renderView();
    fireEvent.click(screen.getByRole("tab", { name: /Posture/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Select lineage in radar" }));
    expect(screen.getByRole("heading", { name: "Lineage trend" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Lineage posture details" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Posture trend pillar" })).toHaveValue("lineage");
    fireEvent.click(screen.getByRole("button", { name: "Review lineage evidence" }));
    expect(onNavigate).toHaveBeenLastCalledWith(expect.objectContaining({
      tab: "governance", focus: expect.objectContaining({ governanceSection: "findings", filters: { section: "findings", pillar: "lineage" } }),
    }));
    fireEvent.click(screen.getByRole("button", { name: /^Ownership/ }));
    expect(screen.getByRole("heading", { name: "Ownership trend" })).toBeVisible();
    expect(screen.getByRole("button", { name: /^Ownership/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Review ownership evidence" }));
    expect(onNavigate).toHaveBeenLastCalledWith(expect.objectContaining({
      tab: "catalog", focus: expect.objectContaining({ filters: { posturePillar: "ownership" } }),
    }));
  });
  it("does not carry an Ownership posture deep-link into the Findings filter", async () => {
    render(
      <AtlasProvider isPreview>
        <GovernanceCenterView onNavigate={vi.fn()} focus={{
          requestId: "ownership-posture", governanceSection: "posture", filters: { pillar: "ownership" },
        }} />
      </AtlasProvider>,
    );
    expect(screen.getByRole("combobox", { name: "Posture trend pillar" })).toHaveValue("ownership");
    fireEvent.click(screen.getByRole("tab", { name: /Findings/ }));
    await waitFor(() => expect(screen.getByRole("tab", { name: /Findings/ })).toHaveAttribute("aria-selected", "true"));
    expect(screen.getAllByRole("button", { name: "Open evidence" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Clear pillar" })).not.toBeInTheDocument();
  });
  it("ignores metadata posture pillars supplied as Findings categories", () => {
    render(
      <AtlasProvider isPreview>
        <GovernanceCenterView onNavigate={vi.fn()} focus={{
          requestId: "invalid-finding-pillar", governanceSection: "findings", filters: { pillar: "ownership" },
        }} />
      </AtlasProvider>,
    );
    expect(screen.getAllByRole("button", { name: "Open evidence" }).length).toBeGreaterThan(0);
  });

  it("adds a shared exception without hiding the raw finding", async () => {
    renderView(true);
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
    incidents: [],
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
    ).toHaveTextContent("AccessSensitivityLineageConsumed removalsJob failures");
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
    ).toHaveTextContent("AccessSensitivityLineageConsumed removalsJob failures");
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

  function riskEntry(
    id: string,
    kind: RadarRiskKind,
    severity: "critical" | "high",
    label: string,
  ): RadarEntry {
    return {
      id,
      severity,
      title: label,
      detail: `${label} detail`,
      occurrenceSnapshotId: "current",
      risk: { id, kind, severity, detail: "" } as unknown as RiskyChange,
    };
  }

  const signalEntries = [
    riskEntry("grant-a", "external-grant-added", "high", "Guest added to Sales"),
    riskEntry("grant-b", "external-grant-added", "high", "Partner group added to Finance"),
    riskEntry("broken", "lineage-broken", "critical", "Sales model lost its source"),
  ];

  it("summarizes review items as signal tiles with collapsed evidence", () => {
    render(
      <RadarPanel {...baseProps} radar={readyRadar} entries={signalEntries} />,
    );

    expect(
      screen.getByRole("heading", { name: "3 changes need review" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Detected between the two latest validated snapshots/),
    ).toBeInTheDocument();
    const tiles = within(
      screen.getByRole("list", { name: "Radar signals" }),
    ).getAllByRole("button");
    expect(tiles.map((tile) => tile.textContent)).toEqual([
      "Lineage broken1 relationship became broken",
      "New external grants2 grants to external principals",
    ]);
    for (const tile of tiles) {
      expect(tile).toHaveAttribute("aria-expanded", "false");
    }
    expect(screen.queryByRole("button", { name: "Acknowledge" })).toBeNull();
    expect(screen.queryByText("Guest added to Sales")).toBeNull();
  });

  it("expands one signal at a time and keeps review actions on its entries", () => {
    const onAcknowledge = vi.fn(async () => undefined);
    const onOpen = vi.fn();
    render(
      <RadarPanel
        {...baseProps}
        radar={readyRadar}
        entries={signalEntries}
        onAcknowledge={onAcknowledge}
        onOpen={onOpen}
      />,
    );

    const grants = screen.getByRole("button", { name: /New external grants/ });
    fireEvent.click(grants);
    expect(grants).toHaveAttribute("aria-expanded", "true");
    const region = screen.getByRole("region", {
      name: "New external grants to review",
    });
    expect(grants).toHaveAttribute("aria-controls", region.id);
    expect(within(region).getByText("Guest added to Sales")).toBeInTheDocument();
    expect(
      within(region).getAllByRole("button", { name: "Acknowledge" }),
    ).toHaveLength(2);
    expect(within(region).queryByText("Sales model lost its source")).toBeNull();

    fireEvent.click(within(region).getAllByRole("button", { name: "Acknowledge" })[0]);
    expect(onAcknowledge).toHaveBeenCalledWith(signalEntries[0]);
    fireEvent.click(within(region).getAllByRole("button", { name: "Open evidence" })[1]);
    expect(onOpen).toHaveBeenCalledWith(signalEntries[1]);

    const broken = screen.getByRole("button", { name: /Lineage broken/ });
    fireEvent.click(broken);
    expect(grants).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("region", { name: "Lineage broken to review" }),
    ).toHaveTextContent("Sales model lost its source");

    fireEvent.click(broken);
    expect(broken).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region")).toBeNull();
  });
});
