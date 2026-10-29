import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { searchJobId } from "../search";
import { AtlasProvider } from "../store";
import { SAMPLE_DATA } from "../model";
import { JobsView } from "./Jobs";

describe("JobsView", () => {
  it("renders one responsive timeline without a horizontal table", () => {
    render(
      <AtlasProvider isPreview>
        <JobsView />
      </AtlasProvider>,
    );

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.getByRole("list", {
        name: "Fabric job runs grouped by start date",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Completed|Failed|Running|Cancelled/).length).toBeGreaterThan(0);
  });

  it("shows independently removable active filter chips", () => {
    render(
      <AtlasProvider isPreview>
        <JobsView />
      </AtlasProvider>,
    );
    fireEvent.change(screen.getByLabelText("Search job history"), {
      target: { value: "refresh" },
    });
    fireEvent.change(screen.getByLabelText("Filter jobs by status"), {
      target: { value: "failed" },
    });

    const filters = screen.getByLabelText("Active job filters");
    expect(filters).toHaveTextContent("Search: “refresh”");
    expect(filters).toHaveTextContent("Status: Failed");
    fireEvent.click(
      screen.getByRole("button", { name: "Remove failed status filter" }),
    );
    expect(filters).toHaveTextContent("Search: “refresh”");
    expect(filters).not.toHaveTextContent("Status: Failed");
  });

  it("focuses the exact job selected from global search", () => {
    const job = SAMPLE_DATA.jobs[0];
    render(
      <AtlasProvider isPreview>
        <JobsView
          focus={{
            requestId: "job-focus",
            itemId: job.itemFabricId,
            jobId: searchJobId(job.itemFabricId, job.jobType, job.startedAt),
            query: `${job.jobType}: ${job.itemName}`,
          }}
        />
      </AtlasProvider>,
    );

    expect(screen.getByText(`1 of ${SAMPLE_DATA.jobs.length} recorded runs`)).toBeInTheDocument();
    expect(screen.getByText(job.jobType)).toBeInTheDocument();
  });
});
