import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SAMPLE_DATA } from "../model";
import { buildSearchIndex } from "../search";
import { CommandPalette } from "./CommandPalette";

describe("CommandPalette", () => {
  it("searches schema objects and opens the selected result", async () => {
    const onSelect = vi.fn();
    render(
      <CommandPalette
        index={buildSearchIndex(SAMPLE_DATA)}
        open
        onClose={() => undefined}
        onSelect={onSelect}
      />,
    );

    fireEvent.change(
      screen.getByRole("combobox", { name: "Search workspace metadata" }),
      { target: { value: "Total Revenue" } },
    );
    fireEvent.click(
      (await screen.findAllByRole("option", { name: /Total Revenue/ }))[0],
    );

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "measure",
        target: expect.objectContaining({
          itemId: expect.any(String),
          tableName: "rentals_daily_summary",
        }),
      }),
    );
  });

  it("supports keyboard navigation and selection", async () => {
    const onSelect = vi.fn();
    render(
      <CommandPalette
        index={buildSearchIndex(SAMPLE_DATA)}
        open
        onClose={() => undefined}
        onSelect={onSelect}
      />,
    );

    const input = screen.getByRole("combobox", {
      name: "Search workspace metadata",
    });
    fireEvent.change(input, { target: { value: "report" } });
    await screen.findAllByRole("option");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("uses the dedicated readable empty-state width", () => {
    render(
      <CommandPalette
        index={buildSearchIndex(SAMPLE_DATA)}
        open
        onClose={() => undefined}
        onSelect={() => undefined}
      />,
    );

    expect(
      screen.getByText(/Find Fabric items, schema objects/),
    ).toHaveClass("atlas-search-empty-copy");
  });

  it("moves focus into the dialog and restores it on Escape", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open search
          </button>
          <CommandPalette
            index={buildSearchIndex(SAMPLE_DATA)}
            open={open}
            onClose={() => setOpen(false)}
            onSelect={() => undefined}
          />
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open search" });
    trigger.focus();
    fireEvent.click(trigger);
    const input = await screen.findByRole("combobox", {
      name: "Search workspace metadata",
    });
    expect(input).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Search Fabric Atlas" }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("does not open results from the previous debounced query", async () => {
    const onSelect = vi.fn();
    render(
      <CommandPalette
        index={buildSearchIndex(SAMPLE_DATA)}
        open
        onClose={() => undefined}
        onSelect={onSelect}
      />,
    );
    const input = screen.getByRole("combobox", {
      name: "Search workspace metadata",
    });
    fireEvent.change(input, { target: { value: "report" } });
    await screen.findAllByRole("option");
    fireEvent.change(input, { target: { value: "no-such-current-query" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelect).not.toHaveBeenCalled();
    expect(
      screen.getByRole("status", {
        name: "",
      }),
    ).toHaveTextContent("Searching workspace metadata");
  });
});
