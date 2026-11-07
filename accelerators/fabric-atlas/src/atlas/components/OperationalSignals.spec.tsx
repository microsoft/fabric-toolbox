import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AtlasData, Job } from "../model";
import type { AtlasContextValue } from "../store";

const harness = vi.hoisted(() => ({
  context: undefined as unknown,
  records: { status: "ready", records: [] } as unknown,
}));

vi.mock("../store", () => ({ useAtlas: () => harness.context }));
vi.mock("../use-operational-incidents", () => ({
  useOperationalIncidentRecords: () => harness.records,
}));

import { OperationalSignals } from "./OperationalSignals";

const NOTEBOOK = "30000000-0000-4000-8000-000000000001";
const LAKEHOUSE = "30000000-0000-4000-8000-000000000002";
const REPORT = "30000000-0000-4000-8000-000000000003";
const MODEL = "30000000-0000-4000-8000-000000000004";

function snapshot(jobs: Job[]): AtlasData {
  return {
    workspace: {
      fabricId: "6bf4c521-7412-4e6b-8867-68253bbfb18a",
      displayName: "Sales",
      capacity: "",
      region: "",
    },
    items: [
      { fabricId: NOTEBOOK, displayName: "Load sales", itemType: "Notebook" },
      { fabricId: LAKEHOUSE, displayName: "Sales lakehouse", itemType: "Lakehouse" },
      { fabricId: MODEL, displayName: "Sales model", itemType: "SemanticModel" },
      { fabricId: REPORT, displayName: "Sales report", itemType: "Report" },
    ],
    edges: [
      { source: NOTEBOOK, target: LAKEHOUSE, relation: "writes" },
      { source: LAKEHOUSE, target: MODEL, relation: "feeds" },
      { source: MODEL, target: REPORT, relation: "binds" },
    ],
    principals: [],
    grants: [],
    jobs,
    config: [],
    comments: [],
    syncRuns: [],
    schema: {},
  } as unknown as AtlasData;
}

function renderSignals(
  jobs: Job[],
  handlers: {
    onShowRuns?: () => void;
    onOpenImpact?: (itemId: string) => void;
  } = {},
  history: { summaries: unknown[]; snapshots: unknown[] } = { summaries: [], snapshots: [] },
) {
  harness.context = {
    data: snapshot(jobs),
    lastSyncedAt: "2026-10-02T06:00:00.000Z",
    isPreview: false,
    history,
    historyLoading: false,
  } as unknown as AtlasContextValue;
  const onShowRuns = handlers.onShowRuns ?? vi.fn();
  render(
    <OperationalSignals
      onShowRuns={onShowRuns}
      onOpenImpact={handlers.onOpenImpact}
    />,
  );
  return onShowRuns;
}

const failedNotebook: Job = {
  itemFabricId: NOTEBOOK,
  itemName: "Load sales",
  jobType: "Notebook run",
  status: "failed",
  startedAt: "2026-10-02T05:00:00.000Z",
  durationSec: 61,
  message: "Spark session terminated.",
};

describe("OperationalSignals", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_FABRIC_ITEM_ID", "");
    harness.records = { status: "ready", records: [] };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("separates the observed failure from its inferred downstream impact", () => {
    const onOpenImpact = vi.fn();
    const onShowRuns = renderSignals([failedNotebook], { onOpenImpact });

    const incidents = screen.getByRole("list", { name: "Observed failures" });
    const [incident] = within(incidents).getAllByRole("listitem");
    expect(within(incident).getByRole("heading", { name: "Load sales" })).toBeInTheDocument();
    expect(within(incident).getByText("Observed failure")).toBeInTheDocument();
    expect(within(incident).getByText("Spark session terminated.")).toBeInTheDocument();
    expect(
      within(incident).getByText(/Derived from the snapshot job history/),
    ).toBeInTheDocument();

    const impact = within(incident).getByRole("list", {
      name: "Downstream impact of Load sales",
    });
    expect(within(impact).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      expect.stringContaining("Sales lakehouse"),
      expect.stringContaining("Sales model"),
      expect.stringContaining("Sales report"),
    ]);
    expect(
      within(incident).getByText(
        "3 downstream items in snapshot lineage: 3 inferred, not confirmed by monitoring.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(within(incident).getByRole("button", { name: "Show this run" }));
    expect(onShowRuns).toHaveBeenCalledWith(
      expect.objectContaining({ evidence: "observed", itemId: NOTEBOOK }),
    );
    fireEvent.click(
      within(incident).getByRole("button", {
        name: "Open impact in Map & lineage",
      }),
    );
    expect(onOpenImpact).toHaveBeenCalledWith(NOTEBOOK);
  });

  it("does not raise an incident once a later run of the same job succeeded", () => {
    renderSignals([
      failedNotebook,
      { ...failedNotebook, status: "completed", startedAt: "2026-10-02T05:30:00.000Z", message: undefined },
    ]);

    expect(screen.queryByRole("list", { name: "Observed failures" })).toBeNull();
    expect(screen.getByText(/No current failures\./)).toBeInTheDocument();
  });

  it("explains an empty job history instead of showing a healthy state", () => {
    renderSignals([]);

    expect(screen.getByText(/No job history is in this snapshot\./)).toBeInTheDocument();
  });

  it("states which monitoring sources Atlas does not collect", () => {
    renderSignals([]);

    const sources = screen.getByRole("list", { name: "Monitoring sources" });
    const rows = within(sources).getAllByRole("listitem").filter((row) =>
      within(row).queryByRole("heading"),
    );
    expect(
      rows.map((row) => [
        within(row).getByRole("heading").textContent,
        row.textContent?.match(/Collected|Not collected|Fabric portal only/)?.[0],
      ]),
    ).toEqual([
      ["Fabric job history", "Collected"],
      ["Workspace monitoring", "Not collected"],
      ["Monitor hub job alerts", "Fabric portal only"],
      ["Fabric App Metrics", "Fabric portal only"],
    ]);
    expect(
      screen.getByText(/cannot tell whether monitoring is enabled/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No deployed app item ID is configured in this build/),
    ).toBeInTheDocument();
  });

  it("opens verified Monitor hub pages in a new tab", () => {
    renderSignals([]);

    for (const [name, path] of [
      ["Job runs in Monitor hub", "/monitoringhub/jobs?"],
      ["Alerts in Monitor hub", "/monitoringhub/alerts?"],
      ["Applications in Monitor hub", "/monitoringhub/applications?"],
    ] as const) {
      const link = screen.getByRole("link", {
        name: `${name} (opens in a new tab)`,
      });
      expect(link.getAttribute("href")).toContain(path);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noreferrer");
    }
  });

  it("labels a downstream consumer observed only when it is failing too", () => {
    renderSignals([
      failedNotebook,
      { ...failedNotebook, itemFabricId: MODEL, itemName: "Sales model", jobType: "Refresh" },
    ]);

    const impact = screen.getByRole("list", { name: "Downstream impact of Load sales" });
    const rows = within(impact).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("inferred");
    expect(rows[1]).toHaveTextContent("Sales model");
    expect(rows[1]).toHaveTextContent("also failing (observed)");
    expect(
      screen.getByText(
        "3 downstream items in snapshot lineage: 2 inferred, not confirmed by monitoring; 1 also failing in this snapshot (observed).",
      ),
    ).toBeInTheDocument();
  });

  it("enriches incidents with stored records for the same run", () => {
    harness.records = {
      status: "ready",
      records: [
        {
          key: "incident:v1:6bf4c521-7412-4e6b-8867-68253bbfb18a:30000000-0000-4000-8000-000000000001:notebook run",
          occurredAt: failedNotebook.startedAt,
          runId: "a0a0a0a0-0000-4000-8000-000000000001",
          observedAt: "2026-10-02T06:00:00.000Z",
          firstObservedAt: "2026-09-30T06:00:00.000Z",
        },
      ],
    };
    renderSignals([failedNotebook]);

    const [incident] = within(
      screen.getByRole("list", { name: "Observed failures" }),
    ).getAllByRole("listitem");
    expect(incident).toHaveTextContent("Stored incident record");
    expect(incident).toHaveTextContent("Run a0a0a0a0");
    expect(incident).toHaveTextContent(/failing since/);
    expect(screen.getByText("1 stored incident record for this snapshot.")).toBeInTheDocument();
  });

  it("keeps incidents visible when incident records are not deployed", () => {
    harness.records = { status: "unavailable", reason: "not-deployed" };
    renderSignals([failedNotebook]);

    expect(
      screen.getByText(/Incident records are not deployed yet; incidents are derived/),
    ).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Observed failures" })).toBeInTheDocument();
  });

  it("summarizes incident changes since the previous snapshot and copies the brief", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const previous = snapshot([]);
    const current = snapshot([failedNotebook]);
    renderSignals(
      [failedNotebook],
      {},
      {
        summaries: [
          { snapshotId: "current", syncedAt: "2026-10-02T06:00:00.000Z" },
          { snapshotId: "previous", syncedAt: "2026-10-01T06:00:00.000Z" },
        ],
        snapshots: [
          { snapshotId: "current", syncedAt: "2026-10-02T06:00:00.000Z", catalog: current },
          { snapshotId: "previous", syncedAt: "2026-10-01T06:00:00.000Z", catalog: previous },
        ],
      },
    );

    expect(screen.getByText(/1 opened · 0 recovered · 0 still failing · 0 no longer reported/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy incident brief" }));
    expect(await screen.findByText("Markdown copied.")).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("## Operational incidents"));
  });

  it("states when there is no previous snapshot to compare", () => {
    renderSignals([failedNotebook]);

    expect(
      screen.getByText("No previous snapshot to compare incidents with yet."),
    ).toBeInTheDocument();
  });
});
