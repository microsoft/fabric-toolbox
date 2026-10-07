import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VegaVisualProps } from "@microsoft/fabric-visuals";
import { lightThemeColors } from "@microsoft/fabric-visuals-core";
import { AtlasProvider, useAtlas } from "../store";
import { OverviewView } from "./Overview";
import { SAMPLE_DATA, type AtlasData } from "../model";
import { scorePosture } from "../posture";
import { snapshotCatalogFromData } from "../history";

const harness = vi.hoisted(() => ({
  overrides: {} as Partial<ReturnType<typeof useAtlas>>,
  visualProps: undefined as VegaVisualProps | undefined,
}));

vi.mock("../store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../store")>();
  return {
    ...actual,
    useAtlas: () => ({ ...actual.useAtlas(), ...harness.overrides }),
  };
});

vi.mock("@microsoft/fabric-visuals", () => ({
  useCssTheme: () => lightThemeColors,
  VegaVisual: (props: VegaVisualProps) => {
    harness.visualProps = props;
    return <div data-testid="overview-radar" className={props.className} />;
  },
}));

afterEach(() => {
  harness.overrides = {};
  harness.visualProps = undefined;
});

function setFixture(data: AtlasData) {
  harness.overrides = {
    data,
    history: {
      snapshots: [],
      summaries: [],
      snapshotSummaries: [],
      trend: [],
      trendPoints: [],
      changes: [],
    },
  };
}

async function renderOverview() {
  const onOpen = vi.fn();
  await act(async () => {
    render(<AtlasProvider isPreview><OverviewView onOpen={onOpen} /></AtlasProvider>);
  });
  return onOpen;
}

function GovernanceTargetButton() {
  const { governanceTargets, saveGovernanceTargets } = useAtlas();
  return (
    <button
      onClick={() => void saveGovernanceTargets({ ...governanceTargets, documentation: 95 })}
    >
      Set documentation target
    </button>
  );
}

describe("OverviewView", () => {
  it("restores the governance radar beside health and priorities without duplicate navigation", async () => {
    await renderOverview();
    const inventory = screen.getByLabelText("Workspace inventory");
    expect(within(inventory).getAllByRole("definition")[0]).toHaveTextContent(String(SAMPLE_DATA.items.length));
    expect(screen.getByRole("heading", { name: SAMPLE_DATA.workspace.displayName })).toBeVisible();
    const header = screen.getByRole("heading", { name: SAMPLE_DATA.workspace.displayName }).closest("[data-slot='page-header']");
    expect(header).not.toBeNull();
    expect(within(header as HTMLElement).queryByRole("button", { name: "Open Governance Center" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Governance posture" })).toBeVisible();
    expect(await screen.findByRole("figure", { name: "Governance posture radar" })).toBeVisible();
    expect(screen.getByTestId("overview-radar").parentElement).toHaveClass("atlas-posture-chart");
    expect(screen.getByRole("heading", { name: "Workspace health" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Priority signals" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Open Governance Center" })).toHaveLength(1);
    expect(within(screen.getByRole("list", { name: "Governance pillar scores" })).getAllByRole("button")).toHaveLength(6);
    expect(screen.queryByRole("heading", { name: "Workspace pulse" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /posture score:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Assessed item health" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Overview destinations" })).not.toBeInTheDocument();
    expect(screen.getByText("Metadata coverage", { selector: "summary" }).closest("details")).not.toHaveAttribute("open");
  });

  it("opens the same filtered posture from radar interactions and focusable pillar controls", async () => {
    const onOpen = await renderOverview();
    await screen.findByRole("figure", { name: "Governance posture radar" });
    act(() => harness.visualProps?.onInteraction?.([{
      action: "select",
      selections: [{ predicates: [{ type: "set", name: "pillar", values: ["lineage"] }] }],
    }]));
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({
      tab: "governance", focus: expect.objectContaining({ governanceSection: "posture", filters: { pillar: "lineage" } }),
    }));
    const lineage = screen.getByRole("button", { name: /lineage: \d+%/i });
    lineage.focus();
    expect(lineage).toHaveFocus();
    expect(lineage).toHaveAttribute("type", "button");
    fireEvent.click(screen.getByRole("button", { name: /lineage: \d+%/i }));
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({
      tab: "governance", focus: expect.objectContaining({ governanceSection: "posture", filters: { pillar: "lineage" } }),
    }));
    fireEvent.click(screen.getByRole("button", { name: "Open Governance Center" }));
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({
      tab: "governance", focus: expect.objectContaining({ governanceSection: "posture" }),
    }));
    expect(onOpen.mock.lastCall?.[0].focus.filters).toBeUndefined();
  });

  it("reflects shared target changes without reverting to the default", async () => {
    render(
      <AtlasProvider isPreview>
        <GovernanceTargetButton />
        <OverviewView onOpen={vi.fn()} />
      </AtlasProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Set documentation target" }));
    expect(
      await screen.findByRole("button", {
        name: /documentation: \d+%\. Target 95%/i,
      }),
    ).toBeVisible();
  });

  it("opens governance and access signals with actionable filters", async () => {
    const onOpen = await renderOverview();

    fireEvent.click(screen.getByRole("button", { name: /External access:/ }));
    expect(onOpen).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tab: "access",
        focus: expect.objectContaining({
          filters: { risk: "external" },
        }),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /Needs attention:/ }));
    expect(onOpen).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tab: "governance",
        focus: expect.objectContaining({
          governanceSection: "findings",
          filters: { section: "findings", category: "operations" },
        }),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /Confidential items:/ }));
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({
      tab: "governance", focus: expect.objectContaining({ governanceSection: "coverage" }),
    }));
    fireEvent.click(screen.getByRole("button", { name: /Item-only access:/ }));
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({
      tab: "access", focus: expect.objectContaining({ filters: { origin: "item" } }),
    }));
  });

  it("identifies the largest gap using the current scored metadata and targets", async () => {
    setFixture(SAMPLE_DATA);
    await renderOverview();
    const gap = scorePosture(snapshotCatalogFromData(SAMPLE_DATA)).pillars
      .filter((pillar) => pillar.score != null && pillar.score < pillar.target)
      .sort((a, b) => (b.target - b.score!) - (a.target - a.score!))[0];
    expect(gap).toBeDefined();
    expect(screen.getByText(/Largest target gap:/)).toHaveTextContent(
      `Largest target gap: ${gap.pillar}, ${gap.target - gap.score!} points below target.`,
    );
  });

  it("shows all health states without counting unknown items as assessed", async () => {
    setFixture({
      ...SAMPLE_DATA,
      items: (["healthy", "stale", "failing", "unknown"] as const).map((health, index) => ({
        ...SAMPLE_DATA.items[index],
        health,
      })),
    });
    await renderOverview();
    const health = screen.getByRole("region", { name: "Workspace health" });
    expect(within(health).getByText("33%")).toBeVisible();
    expect(within(health).getByText("3 of 4 items assessed")).toBeVisible();
    expect(within(health).getByRole("img", {
      name: "Item health distribution: 1 healthy, 1 stale, 1 failing, 1 unknown",
    })).toBeVisible();
    expect(within(health).getAllByRole("definition").map((value) => value.textContent)).toEqual(["1", "1", "1", "1"]);
  });

  it("does not report an entirely unassessed inventory as healthy or zero percent", async () => {
    setFixture({
      ...SAMPLE_DATA,
      items: SAMPLE_DATA.items.map((item) => ({ ...item, health: "unknown" })),
    });
    await renderOverview();
    const health = screen.getByRole("region", { name: "Workspace health" });
    expect(within(health).getByText("Not assessed")).toBeVisible();
    expect(within(health).getByText(`0 of ${SAMPLE_DATA.items.length} items assessed`)).toBeVisible();
    expect(within(health).queryByText(/^\d+%$/)).not.toBeInTheDocument();
    expect(within(health).getByRole("img", {
      name: `Item health distribution: 0 healthy, 0 stale, 0 failing, ${SAMPLE_DATA.items.length} unknown`,
    })).toBeVisible();
  });

  it("keeps unavailable scores explicit and provides a next step for an empty inventory", async () => {
    setFixture({
      ...SAMPLE_DATA,
      items: [],
      edges: [],
      principals: [],
      grants: [],
      jobs: [],
      config: [],
      comments: [],
      syncRuns: [],
      schema: {},
    });
    await renderOverview();
    await screen.findByRole("figure", { name: "Governance posture radar" });
    expect(screen.getByText("Sync the workspace to assess item health.")).toBeVisible();
    expect(screen.getByText("Not assessed")).toBeVisible();
    expect(screen.getAllByRole("button", { name: /: not available\. Target/ })).toHaveLength(6);
    expect(screen.queryByRole("img", { name: /Item health distribution:/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Largest target gap:/)).not.toBeInTheDocument();
  });

  it.each([
    { governancePolicyLoading: true, governancePolicyError: undefined },
    { governancePolicyLoading: false, governancePolicyError: "Policy service unavailable." },
  ])("keeps scores but suppresses target comparisons when policy is unavailable: %j", async (policy) => {
    harness.overrides = policy;
    await renderOverview();
    const radar = await screen.findByRole("figure", { name: "Governance posture radar" });
    expect(within(radar).queryByText("Target")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /: \d+%\. Target unavailable/ })).toHaveLength(6);
    expect(screen.queryByText(/pillars at target/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Largest target gap:/)).not.toBeInTheDocument();
    if (policy.governancePolicyLoading) {
      expect(screen.getByRole("status")).toHaveTextContent("Loading governance targets.");
    } else {
      expect(screen.getByRole("alert")).toHaveTextContent("Policy service unavailable.");
    }
    expect(screen.getByRole("button", { name: "Open Governance Center" })).toBeEnabled();
  });

  it("preserves the collapsed metadata coverage meters and their semantic score bands", async () => {
    await renderOverview();
    const details = screen.getByText("Metadata coverage", { selector: "summary" }).closest("details")!;
    fireEvent.click(within(details).getByText("Metadata coverage", { selector: "summary" }));
    expect(details).toHaveAttribute("open");
    const meters = within(details).getAllByRole("meter");
    expect(meters).toHaveLength(3);
    for (const meter of meters) {
      expect(meter).toHaveAttribute("aria-valuemax", "100");
      expect(meter).toHaveAttribute("data-score-band", expect.stringMatching(/^(low|mid|high)$/));
      expect(Number(meter.getAttribute("aria-valuenow"))).toBeGreaterThanOrEqual(0);
      expect(Number(meter.getAttribute("aria-valuenow"))).toBeLessThanOrEqual(100);
    }
  });
});
