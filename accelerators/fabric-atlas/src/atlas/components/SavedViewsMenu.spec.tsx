import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SavedViewsMenu } from "./SavedViewsMenu";

describe("SavedViewsMenu", () => {
  it("prevents creating a view while the initial list is loading", () => {
    const onCreate = vi.fn();
    render(
      <SavedViewsMenu
        views={[]}
        loading
        activeSection="governance"
        currentFilters={{ section: "findings" }}
        onCreate={onCreate}
        onApply={() => undefined}
        onDelete={async () => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Saved views/ }));
    const create = screen.getByRole("button", {
      name: "Save current filters",
    });
    expect(create).toBeDisabled();
    fireEvent.click(create);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("shows mutation failures instead of leaving an unhandled action", async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error("Save failed"));
    render(
      <SavedViewsMenu
        views={[]}
        loading={false}
        activeSection="governance"
        currentFilters={{ section: "findings" }}
        onCreate={onCreate}
        onApply={() => undefined}
        onDelete={async () => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Saved views/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Save current filters" }),
    );
    fireEvent.change(screen.getByLabelText("View name"), {
      target: { value: "My view" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.getByText("Save failed")).toBeInTheDocument(),
    );
  });

  it("closes on Escape and restores focus to the trigger", async () => {
    render(
      <SavedViewsMenu
        views={[]}
        loading={false}
        activeSection="governance"
        currentFilters={{ section: "findings" }}
        onCreate={async () => undefined}
        onApply={() => undefined}
        onDelete={async () => undefined}
      />,
    );
    const trigger = screen.getByRole("button", { name: /Saved views/ });

    fireEvent.click(trigger);
    expect(screen.getByText("Personal shortcuts for this workspace")).toBeVisible();

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    await waitFor(() =>
      expect(
        screen.queryByText("Personal shortcuts for this workspace"),
      ).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
  });
});
