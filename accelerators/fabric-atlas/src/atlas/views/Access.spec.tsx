import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildAccessReviewRows } from "../governance";
import { accessRowsToCsv } from "../access-export";
import { GRANT_ONLY_NOTICE } from "../access-coverage";
import { WHAT_IF_NOTICE } from "../access-what-if";
import type { AccessReviewHistory } from "../access-reviews";
import { SAMPLE_DATA } from "../model";
import { AtlasProvider } from "../store";
import { AccessReviewDetailPanel, AccessView } from "./Access";

function renderAccess() {
  return render(
    <AtlasProvider isPreview>
      <AccessView />
    </AtlasProvider>,
  );
}

describe("AccessView", () => {
  it("filters the review matrix and clears filters", () => {
    renderAccess();

    fireEvent.change(screen.getByLabelText("Search access reviews"), {
      target: { value: "ext-partner@vendor.com" },
    });

    expect(screen.getByText(/1 of \d+ recorded grant pairs/)).toBeInTheDocument();
    expect(
      screen.getAllByLabelText(
        /Review ext-partner@vendor\.com access to AlpineRent Executive Dashboard/,
      ),
    ).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(
      screen.getByText(
        `${buildAccessReviewRows(SAMPLE_DATA).filter((row) => row.effectiveAccess !== "none").length} of ${buildAccessReviewRows(SAMPLE_DATA).filter((row) => row.effectiveAccess !== "none").length} recorded grant pairs`,
      ),
    ).toBeInTheDocument();
  });

  it("moves keyboard focus through the single responsive matrix", () => {
    renderAccess();
    const rows = screen.getAllByLabelText(/Review .+ access to .+/);
    rows[0].focus();
    fireEvent.keyDown(rows[0], { key: "ArrowDown" });
    expect(rows[1]).toHaveFocus();
    fireEvent.keyDown(rows[1], { key: "End" });
    expect(rows.at(-1)).toHaveFocus();
  });

  it("shows additive grants without implying fully evaluated data access", () => {
    renderAccess();

    fireEvent.click(
      screen.getAllByLabelText(
        /Review System Administrator access to AlpineRent Executive Dashboard/,
      )[0],
    );

    expect(screen.getByRole("heading", { name: "Review detail" })).toBeVisible();
    expect(
      within(screen.getByRole("region", { name: "Access evidence" })).getByText(GRANT_ONLY_NOTICE),
    ).toBeInTheDocument();
    expect(screen.getByText("2 contributing grants · 2 determine the highest recorded grant")).toBeInTheDocument();
    expect(screen.getAllByText("Determines highest grant")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "1. Granted permissions" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "2. Restriction evidence" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "3. Assessment" })).toBeVisible();
    expect(screen.getByRole("link", { name: "OneLake portal review guidance" }))
      .toHaveAttribute("href", "https://learn.microsoft.com/en-us/fabric/onelake/security/data-access-control-model");
  });

  it("shows changed evidence as needing review while retaining the prior decision", () => {
    const row = buildAccessReviewRows(SAMPLE_DATA).find(
      (candidate) =>
        candidate.principalRef === "System Administrator" &&
        candidate.item.displayName === "AlpineRent Executive Dashboard",
    )!;
    const review: AccessReviewHistory = {
      rowKey: row.id,
      itemFabricId: row.itemId,
      principalRef: row.principalRef,
      decision: {
        id: "event-1",
        rowKey: row.id,
        itemFabricId: row.itemId,
        principalRef: row.principalRef,
        status: "accepted",
        evidenceKey: "old-evidence",
        reviewedAt: "2026-09-04T10:00:00.000Z",
        updatedAt: "2026-09-04T10:00:00.000Z",
        needsReview: true,
        source: "event",
      },
      history: [
        {
          id: "event-1",
          rowKey: row.id,
          itemFabricId: row.itemId,
          principalRef: row.principalRef,
          status: "accepted",
          evidenceKey: "old-evidence",
          eventOrder: "0000000000001:event-1",
          occurredAt: "2026-09-04T10:00:00.000Z",
          source: "event",
        },
      ],
    };

    render(
      <AccessReviewDetailPanel
        row={row}
        review={review}
        reviewsLoading={false}
        saving={false}
        onSaveDecision={vi.fn()}
        onClearDecision={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Needs review")).toBeVisible();
    expect(
      screen.getByText(/recorded grant evidence changed/i),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Accepted" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    const history = screen
      .getByRole("heading", { name: "Personal review history" })
      .closest("section")!;
    expect(within(history).getByText("Accepted")).toBeVisible();
  });

  it("starts principal groups collapsed and expands them on click", () => {
    renderAccess();
    fireEvent.click(screen.getByRole("button", { name: "Principals" }));

    const groups = screen
      .getAllByRole("button", { expanded: false })
      .filter((button) =>
        button
          .getAttribute("aria-controls")
          ?.startsWith("principal-access-group-"),
      );
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(group).toHaveAccessibleName(/Evaluated layers across recorded pairs:.+Restrictions not evaluated/);
    }
    expect(
      screen.queryByLabelText(
        /Review System Administrator access to AlpineRent Daily Load/,
      ),
    ).not.toBeInTheDocument();

    fireEvent.click(groups[0]);
    expect(groups[0]).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getAllByLabelText(/Review .+ access to .+/).length,
    ).toBeGreaterThan(0);
  });

  it("expands matching principal groups only while searching", () => {
    renderAccess();
    fireEvent.click(screen.getByRole("button", { name: "Principals" }));
    expect(
      screen.queryByLabelText(
        /Review System Administrator access to AlpineRent Daily Load/,
      ),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search access reviews"), {
      target: { value: "AlpineRent Daily Load" },
    });
    expect(
      screen.getAllByLabelText(
        /Review .+ access to AlpineRent Daily Load/,
      ).length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(
      screen.queryByLabelText(
        /Review System Administrator access to AlpineRent Daily Load/,
      ),
    ).not.toBeInTheDocument();
  });

  it("opens a departure pack from a resolved principal group", () => {
    renderAccess();
    fireEvent.click(screen.getByRole("button", { name: "Principals" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Departure pack" })[0]);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Urgent orphan risks/)).toBeInTheDocument();
    expect(
      screen.getByText("Ownership metadata coverage"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Close departure pack" }),
    ).toBeInTheDocument();
  });

  it("opens and closes row detail from the matrix", () => {
    renderAccess();

    fireEvent.change(screen.getByLabelText("Search access reviews"), {
      target: { value: "Léa Martin" },
    });
    fireEvent.click(screen.getAllByLabelText(/Review Léa Martin access to/)[0]);

    expect(screen.getByRole("heading", { name: "Item context" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Applicable grants" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Close review detail" }));
    expect(
      screen.queryByRole("heading", { name: "Review detail" }),
    ).not.toBeInTheDocument();
  });

  it("serializes the visible review row and clears it on dismissal", async () => {
    const onStateChange = vi.fn();
    render(
      <AtlasProvider isPreview>
        <AccessView onStateChange={onStateChange} />
      </AtlasProvider>,
    );
    fireEvent.click(
      screen.getAllByLabelText(
        /Review System Administrator access to AlpineRent Executive Dashboard/,
      )[0],
    );

    await waitFor(() =>
      expect(onStateChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          tab: "access",
          focus: expect.objectContaining({
            itemId: expect.any(String),
            principalId: expect.any(String),
          }),
        }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Close review detail" }));
    await waitFor(() =>
      expect(onStateChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          focus: expect.objectContaining({
            itemId: undefined,
            principalId: undefined,
          }),
        }),
      ),
    );
  });

  it("keeps preview decisions and clears in personal history", async () => {
    renderAccess();

    fireEvent.click(
      screen.getAllByLabelText(
        /Review System Administrator access to AlpineRent Executive Dashboard/,
      )[0],
    );
    expect(screen.getByText("Not reviewed yet")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Review note (optional)"), {
      target: { value: "Owner access confirmed." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Accepted" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Accepted" }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
    expect(screen.queryByText("Not reviewed yet")).not.toBeInTheDocument();
    expect(
      screen.getByText("Decision is saved for your account."),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Owner access confirmed.")).toBeVisible();

    const history = screen
      .getByRole("heading", { name: "Personal review history" })
      .closest("section")!;
    expect(within(history).getByText("Accepted")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Clear decision" }));
    await waitFor(() =>
      expect(screen.getByText("Not reviewed yet")).toBeInTheDocument(),
    );
    const retainedHistory = screen
      .getByRole("heading", { name: "Personal review history" })
      .closest("section")!;
    expect(within(retainedHistory).getByText("Cleared")).toBeVisible();
    expect(within(retainedHistory).getByText("Accepted")).toBeVisible();
    expect(
      within(retainedHistory).getByText("Owner access confirmed."),
    ).toBeVisible();
  });

  it("downloads the filtered rows as CSV", async () => {
    let downloadedBlob: Blob | undefined;
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation((blob) => {
        downloadedBlob = blob as Blob;
        return "blob:access-review";
      });
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    renderAccess();

    fireEvent.change(screen.getByLabelText("Search access reviews"), {
      target: { value: "ext-partner@vendor.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:access-review");
    expect(downloadedBlob?.type).toBe("text/csv;charset=utf-8");

    const csv = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(downloadedBlob!);
    });
    expect(csv).toContain('"Principal","Principal ID","Resolution"');
    expect(csv).toContain('"ext-partner@vendor.com"');
    expect(csv.split("\r\n")).toHaveLength(2);
    expect(csv).toContain('"Not evaluated","Partial"');
    expect(csv).toContain("Evaluated layers");
    expect(csv).toContain(GRANT_ONLY_NOTICE);

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    click.mockRestore();
  });

  it("neutralizes spreadsheet formulas in CSV values", () => {
    const row = buildAccessReviewRows(SAMPLE_DATA)[0];
    const csv = accessRowsToCsv([
      {
        ...row,
        principalRef: "=HYPERLINK(\"https://example.com\")",
      },
    ]);

    expect(csv).toContain(
      "\"'=HYPERLINK(\"\"https://example.com\"\")\"",
    );
  });

  it("states evaluated layers on every matrix row and labels What-if as recorded grants only", () => {
    renderAccess();
    for (const row of screen.getAllByRole("option", { name: /Review .+ access to/ })) {
      expect(row).toHaveAccessibleName(/Highest recorded grant.+Restrictions not evaluated.+Evaluated layers:/);
      expect(row).toHaveClass("focus-visible:ring-ring");
    }
    expect(screen.getByRole("button", { name: "What-if" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "What-if" }))
      .toHaveAccessibleDescription(WHAT_IF_NOTICE);
    expect(screen.getByText(GRANT_ONLY_NOTICE)).toBeVisible();
    expect(screen.queryByText(/effective permission|reachable pairs|no restrictions|none observed/i))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Workspace" })).toBeNull();
  });

  it("states evidence once in a legend and keeps rows to compact badges", () => {
    renderAccess();
    const legend = screen.getByRole("region", { name: "Access evidence legend" });
    expect(
      within(legend).getAllByRole("term").map((term) => term.textContent),
    ).toEqual(["Granted", "Partial", "Unknown", "Denied"]);
    expect(within(legend).getByText(GRANT_ONLY_NOTICE)).toBeInTheDocument();

    const rows = screen.getAllByRole("option", { name: /Review .+ access to/ });
    for (const row of rows) {
      expect(within(row).getByText("Partial")).toHaveAttribute(
        "title",
        expect.stringMatching(/Evaluated: .+Unknown or incomplete layers:/),
      );
      expect(row).toHaveAccessibleName(/Restrictions not evaluated/);
    }
    expect(screen.queryByText(/^Restrictions: not evaluated$/)).toBeNull();
    expect(screen.queryByText(/^Not evaluated$/)).toBeNull();
    expect(screen.queryByText(/^Evaluated: /)).toBeNull();
    expect(screen.queryByText(/^\d+ recorded grants$/)).toBeNull();
    expect(screen.queryByText("No recorded flags")).toBeNull();
    expect(screen.queryByText("Not fully evaluated")).toBeNull();
    expect(screen.queryByText("Granted access only; restrictions not evaluated")).toBeNull();
    expect(screen.getByText(WHAT_IF_NOTICE)).toHaveClass("sr-only");

    fireEvent.click(screen.getByRole("button", { name: "Principals" }));
    expect(screen.getAllByText(/Evaluated layers across recorded pairs/)[0]).toHaveClass("sr-only");
  });

  it.each(["Enter", " "])("opens evidence with %s and restores focus on Escape", (key) => {
    renderAccess();
    const row = screen.getAllByRole("option", { name: /Review .+ access to/ })[0];
    row.focus();
    fireEvent.keyDown(row, { key });
    const close = screen.getByRole("button", { name: "Close review detail" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Access evidence" })).not.toBeInTheDocument();
    expect(row).toHaveFocus();
  });

  it("filters by evidence state, clears the empty result and serializes the filter", async () => {
    const onStateChange = vi.fn();
    render(
      <AtlasProvider isPreview>
        <AccessView onStateChange={onStateChange} />
      </AtlasProvider>,
    );
    const coverage = screen.getByRole("combobox", { name: "Evidence coverage" });
    fireEvent.change(coverage, { target: { value: "unsupported" } });
    expect(screen.getAllByRole("option", { name: /Review .+ access to/ }).length)
      .toBeGreaterThan(0);
    fireEvent.change(coverage, { target: { value: "denied" } });
    expect(screen.getByText("No recorded grant pairs match")).toBeVisible();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
    await waitFor(() => expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        focus: expect.objectContaining({ filters: expect.objectContaining({ coverage: "denied" }) }),
      }),
    ));
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(coverage).toHaveValue("all");
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeEnabled();
  });

  it("copies grant and coverage evidence rather than an unrestricted result", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    renderAccess();
    fireEvent.click(screen.getAllByRole("option", { name: /Review .+ access to/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Copy review summary" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const summary = writeText.mock.calls[0][0] as string;
    expect(summary).toContain("Highest recorded grant:");
    expect(summary).toContain("Restrictions: Not evaluated");
    expect(summary).toContain("Evaluated layers:");
    expect(summary).toContain("OneLake security: Unsupported");
    expect(summary).toContain("Purview DLP: Unsupported");
    expect(summary).toContain(GRANT_ONLY_NOTICE);
    expect(summary).not.toMatch(/Effective permission|no restrictions|none observed/i);
    vi.unstubAllGlobals();
  });
});
