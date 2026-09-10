import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_DATA } from "../model";
import { displayPreferenceKey } from "../display-preferences";
import { CatalogView } from "./Catalog";

vi.mock("../store", () => ({
  useAtlas: () => ({
    data: SAMPLE_DATA,
    currentUser: { id: "catalog-reviewer", name: "Reviewer" },
  }),
}));

describe("CatalogView layout", () => {
  beforeEach(() => localStorage.clear());

  it("preserves the card default and saves a personal table preference", () => {
    render(<CatalogView />);
    expect(screen.getByRole("button", { name: "Cards" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.getByRole("table")).toBeVisible();
    expect(localStorage.getItem(
      displayPreferenceKey("catalog-reviewer", SAMPLE_DATA.workspace.fabricId, "catalog-layout"),
    )).toBe('"table"');
  });

  it("opens a table item in the existing detail drawer", () => {
    const model = SAMPLE_DATA.items.find((item) => item.itemType === "SemanticModel")!;
    render(<CatalogView />);
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    const table = within(screen.getByRole("region", { name: "Catalog table" }));
    expect(table.queryByRole("button", { name: `Open details for ${model.displayName}` })).not.toBeInTheDocument();
    fireEvent.click(table.getByRole("button", { name: /Semantic model/i }));
    fireEvent.click(table.getByRole("button", { name: `Open details for ${model.displayName}` }));
    expect(screen.getByRole("dialog", { name: `${model.displayName} details` })).toBeVisible();
  });

  it("expands search results without changing the default collapsed groups", () => {
    const model = SAMPLE_DATA.items.find((item) => item.itemType === "SemanticModel")!;
    render(<CatalogView />);
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    fireEvent.change(screen.getByLabelText("Search catalog"), { target: { value: model.displayName } });
    const table = within(screen.getByRole("region", { name: "Catalog table" }));
    expect(table.getByRole("button", { name: `Open details for ${model.displayName}` })).toBeVisible();
    fireEvent.change(screen.getByLabelText("Search catalog"), { target: { value: "" } });
    expect(table.queryByRole("button", { name: `Open details for ${model.displayName}` })).not.toBeInTheDocument();
  });
});
