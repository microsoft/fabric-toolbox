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
});
