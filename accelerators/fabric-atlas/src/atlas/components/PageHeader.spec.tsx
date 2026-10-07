import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PageHeader } from "./PageHeader";

describe("compact page header", () => {
  it("keeps the title, purpose and primary action together without a banner", () => {
    const action = vi.fn();
    render(<PageHeader title="Catalog" purpose="Browse stored items."
      actions={<button onClick={action}>Open item</button>} />);
    const title = screen.getByRole("heading", { level: 1, name: "Catalog" });
    expect(title.closest("[data-slot='page-header']")).toHaveClass("atlas-page-header", "flex-wrap", "min-w-0");
    expect(title).toHaveClass("text-500");
    expect(screen.getByText("Browse stored items.")).toBeVisible();
    expect(screen.queryByLabelText("Help: Catalog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open item" }));
    expect(action).toHaveBeenCalledOnce();
  });
  it("offers help only when needed and closes it with Escape, returning focus", () => {
    render(<PageHeader title="Map" purpose="Trace dependencies." help="Sources appear before consumers." />);
    const help = screen.getByLabelText("Help: Map");
    expect(help.closest("details")).not.toHaveAttribute("open");
    fireEvent.click(help);
    expect(screen.getByText("Sources appear before consumers.")).toBeVisible();
    fireEvent.keyDown(help, { key: "Escape" });
    expect(help.closest("details")).not.toHaveAttribute("open");
    expect(help).toHaveFocus();
  });
});
