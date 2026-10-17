import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SAMPLE_DATA, type AtlasData, type Job } from "../model";
import type { AtlasContextValue } from "../store";

const harness = vi.hoisted(() => ({ context: undefined as unknown }));

vi.mock("../store", () => ({ useAtlas: () => harness.context }));

import { JobsView } from "./Jobs";

const lakehouse = SAMPLE_DATA.items.find((item) => item.itemType === "Lakehouse")!;
const notebook = SAMPLE_DATA.jobs.find((job) => job.jobType === "Notebook run")!;

function renderJobs(onNavigate = vi.fn()) {
  const failed: Job = {
    ...notebook,
    status: "failed",
    startedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    message: "Spark session terminated.",
  };
  const data: AtlasData = { ...SAMPLE_DATA, jobs: [...SAMPLE_DATA.jobs, failed] };
  harness.context = {
    data,
    lastSyncedAt: new Date().toISOString(),
    isPreview: true,
    history: { summaries: [], snapshots: [] },
    historyLoading: false,
    savedViews: [],
    savedViewsLoading: false,
    savedViewsError: undefined,
    addSavedView: vi.fn(),
    removeSavedView: vi.fn(),
  } as unknown as AtlasContextValue;
  render(<JobsView onNavigate={onNavigate} />);
  return { onNavigate, failed };
}

describe("JobsView operational signals", () => {
  it("narrows run history to the observed failure and moves focus there", async () => {
    const { failed } = renderJobs();

    const incidents = screen.getByRole("list", { name: "Observed failures" });
    expect(within(incidents).getByRole("heading", { name: failed.itemName })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(within(incidents).getByRole("button", { name: "Show this run" }));
    });

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Run history" })).toHaveFocus(),
    );
    expect(screen.getByLabelText("Active job filters")).toHaveTextContent("Focused run");
    const timeline = screen.getByRole("list", {
      name: "Fabric job runs grouped by start date",
    });
    expect(within(timeline).getAllByText("Spark session terminated.")).toHaveLength(1);
    expect(within(timeline).queryByText("Completed")).toBeNull();
  });

  it("opens the inferred impact in Map & lineage with the failed item focused", () => {
    const { onNavigate } = renderJobs();
    const incidents = screen.getByRole("list", { name: "Observed failures" });

    fireEvent.click(
      within(incidents).getByRole("button", { name: "Open impact in Map & lineage" }),
    );

    expect(onNavigate).toHaveBeenCalledWith({
      tab: "map",
      focus: {
        requestId: expect.any(String),
        itemId: notebook.itemFabricId,
        filters: { impact: "focused" },
      },
    });
    expect(
      within(incidents).getByRole("list", {
        name: `Downstream impact of ${notebook.itemName}`,
      }),
    ).toHaveTextContent(lakehouse.displayName);
  });
});
