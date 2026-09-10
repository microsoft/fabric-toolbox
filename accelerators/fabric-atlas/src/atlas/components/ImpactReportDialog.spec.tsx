import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SAMPLE_DATA } from "../model";
import { ImpactReportDialog } from "./ImpactReportDialog";

describe("ImpactReportDialog", () => {
  it("shows verified item impact", () => {
    const model = SAMPLE_DATA.items.find(
      (item) => item.itemType === "SemanticModel",
    );
    expect(model).toBeTruthy();

    render(
      <ImpactReportDialog
        data={SAMPLE_DATA}
        itemId={model!.fabricId}
        open
        onClose={() => undefined}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "AlpineRent Sales Model" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Upstream dependencies")).toBeInTheDocument();
    expect(screen.getByText("Downstream consumers")).toBeInTheDocument();
  });

  it("shows verified DAX object impact when references resolve", () => {
    const model = SAMPLE_DATA.items.find(
      (item) => item.itemType === "SemanticModel",
    );
    render(
      <ImpactReportDialog
        data={SAMPLE_DATA}
        itemId={model!.fabricId}
        object={{
          itemId: model!.fabricId,
          kind: "measure",
          name: "Total Revenue",
          tableName: "rentals_daily_summary",
        }}
        open
        onClose={() => undefined}
      />,
    );

    expect(
      screen.getByText("Object dependency evidence"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Inferred from item lineage"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("DAX").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Inferred").length).toBeGreaterThan(0);
  });

  it("falls back to manual copy when clipboard access is unavailable", () => {
    const prompt = vi.spyOn(window, "prompt").mockReturnValue(null);
    const model = SAMPLE_DATA.items.find(
      (item) => item.itemType === "SemanticModel",
    )!;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });

    render(
      <ImpactReportDialog
        data={SAMPLE_DATA}
        itemId={model.fabricId}
        open
        onClose={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    expect(prompt).toHaveBeenCalledWith(
      "Copy this impact report",
      expect.stringContaining("# Fabric Atlas impact report"),
    );
    prompt.mockRestore();
  });

  it("restores focus after Escape closes the report", async () => {
    const model = SAMPLE_DATA.items.find(
      (item) => item.itemType === "SemanticModel",
    )!;
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open impact
          </button>
          <ImpactReportDialog
            data={SAMPLE_DATA}
            itemId={model.fabricId}
            open={open}
            onClose={() => setOpen(false)}
          />
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open impact" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(
      screen.getByRole("button", { name: "Close impact report" }),
    ).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
