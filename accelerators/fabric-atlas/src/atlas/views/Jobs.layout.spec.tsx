import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SAMPLE_DATA, type AtlasData, type Job } from "../model";
import type { AtlasContextValue } from "../store";

const harness = vi.hoisted(() => ({ context: undefined as unknown }));

vi.mock("../store", () => ({ useAtlas: () => harness.context }));

import { JobsView } from "./Jobs";

const LONG_JOB_TYPE =
  "Microsoft.WaaS.BusinessProcessSolutions.BackgroundJob.ExtendedSynchronizationPass";
const LONG_ITEM_NAME =
  "PixelSlimeAnalytics - SQL endpoint metadata refresh for the complete operational estate";
const notebook = SAMPLE_DATA.items.find((item) => item.itemType === "Notebook")!;

function job(overrides: Partial<Job>): Job {
  return {
    itemFabricId: notebook.fabricId,
    itemName: notebook.displayName,
    jobType: "RunNotebook",
    status: "completed",
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    durationSec: 32,
    ...overrides,
  };
}

function renderJobs(jobs: Job[]) {
  const data: AtlasData = { ...SAMPLE_DATA, jobs };
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
  return render(<JobsView />);
}

function runRows(): HTMLElement[] {
  const timeline = screen.getByRole("list", {
    name: "Fabric job runs grouped by start date",
  });
  return within(timeline)
    .getAllByRole("listitem")
    .filter((row) => row.querySelector("dl"));
}

function gridTemplate(element: Element): string {
  const token = [...element.classList].find((name) =>
    name.startsWith("md:grid-cols-["),
  );
  if (!token) throw new Error("Missing desktop grid template");
  return token;
}

describe("JobsView run history layout", () => {
  it("truncates long item and job names in place with the full text available", () => {
    renderJobs([job({ jobType: LONG_JOB_TYPE, itemName: LONG_ITEM_NAME })]);

    const [row] = runRows();
    const jobName = within(row).getByText(LONG_JOB_TYPE);
    expect(jobName).toHaveAttribute("title", LONG_JOB_TYPE);
    expect(jobName.className).toContain("truncate");
    expect(jobName.closest("div")?.className).toContain("min-w-0");

    const itemName = within(row).getByText(LONG_ITEM_NAME);
    expect(itemName).toHaveAttribute("title", LONG_ITEM_NAME);
    expect(itemName.className).toContain("truncate");
  });

  it("keeps the same column template for every status, including failed runs", () => {
    const { container } = renderJobs([
      job({ status: "completed" }),
      job({ status: "failed", startedAt: new Date(Date.now() - 120_000).toISOString() }),
      job({ status: "cancelled", startedAt: new Date(Date.now() - 180_000).toISOString() }),
      job({ status: "running", startedAt: new Date(Date.now() - 30_000).toISOString() }),
    ]);

    const header = container.querySelector('[aria-hidden="true"].md\\:grid');
    expect(header).not.toBeNull();
    const template = gridTemplate(header!);
    expect(template).not.toMatch(/\[auto_/);
    for (const row of runRows()) {
      expect(gridTemplate(row)).toBe(template);
    }
  });
});

describe("JobsView failure detail", () => {
  it("states that Atlas did not collect a failure reason instead of a generic placeholder", () => {
    renderJobs([job({ status: "failed" })]);

    const [row] = runRows();
    expect(within(row).getByText("Error detail not collected by Atlas")).toBeInTheDocument();
    expect(within(row).queryByText("No additional detail")).toBeNull();
    const link = within(row).getByRole("link", {
      name: "Job runs in Monitor hub (opens in a new tab)",
    });
    expect(link.getAttribute("href")).toContain("/monitoringhub/jobs?");
  });

  it("shows a captured failure detail with its provenance", () => {
    renderJobs([job({ status: "failed", message: "Spark session terminated." })]);

    const [row] = runRows();
    expect(within(row).getByText("Spark session terminated.")).toBeInTheDocument();
    expect(within(row).getByText("Fabric job detail")).toBeInTheDocument();
  });

  it("keeps the neutral placeholder for runs that did not fail", () => {
    renderJobs([job({ status: "completed" })]);

    const [row] = runRows();
    expect(within(row).getByText("No additional detail")).toBeInTheDocument();
  });
});
