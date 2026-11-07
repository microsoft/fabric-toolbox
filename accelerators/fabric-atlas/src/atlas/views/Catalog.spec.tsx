import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_DATA } from "../model";
import { ScoutChatContext, type ScoutChat } from "../scout-chat-context";
import * as download from "../download";
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

  it("closes the detail dialog on Escape and restores the item trigger", async () => {
    const model = SAMPLE_DATA.items.find((item) => item.itemType === "SemanticModel")!;
    render(<CatalogView />);
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    const table = within(screen.getByRole("region", { name: "Catalog table" }));
    fireEvent.click(table.getByRole("button", { name: /Semantic model/i }));
    const trigger = table.getByRole("button", {
      name: `Open details for ${model.displayName}`,
    });
    trigger.focus();
    fireEvent.click(trigger);

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: `${model.displayName} details`,
        }),
      ).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
  });

  it("shows the item family coverage in the detail drawer", () => {
    const model = SAMPLE_DATA.items.find((item) => item.itemType === "SemanticModel")!;
    render(<CatalogView />);
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    const table = within(screen.getByRole("region", { name: "Catalog table" }));
    fireEvent.click(table.getByRole("button", { name: /Semantic model/i }));
    fireEvent.click(table.getByRole("button", { name: `Open details for ${model.displayName}` }));
    const drawer = within(screen.getByRole("dialog", { name: `${model.displayName} details` }));
    expect(drawer.getByRole("button", { name: "Coverage" })).toBeVisible();
    const coverage = within(drawer.getByRole("region", { name: "Atlas coverage" }));
    expect(coverage.getAllByRole("term").map((term) => term.textContent)).toEqual([
      "Catalog",
      "Objects",
      "Lineage",
      "Access",
      "Operations",
    ]);
    expect(coverage.getByText(/Restrictions are not evaluated/)).toBeVisible();
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
  function openModelDrawer() {
    const model = SAMPLE_DATA.items.find((item) => item.itemType === "SemanticModel")!;
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    const table = within(screen.getByRole("region", { name: "Catalog table" }));
    fireEvent.click(table.getByRole("button", { name: /Semantic model/i }));
    fireEvent.click(table.getByRole("button", { name: `Open details for ${model.displayName}` }));
    return { model, drawer: within(screen.getByRole("dialog", { name: `${model.displayName} details` })) };
  }

  it("exports the item identity sheet as Markdown", () => {
    const spy = vi.spyOn(download, "downloadText").mockImplementation(() => {});
    render(<CatalogView />);
    const { model, drawer } = openModelDrawer();
    expect(drawer.queryByRole("button", { name: "Ask Scout" })).not.toBeInTheDocument();
    fireEvent.click(drawer.getByRole("button", { name: "Export identity sheet" }));
    expect(spy).toHaveBeenCalledTimes(1);
    const [content, type, filename] = spy.mock.calls[0];
    expect(type).toBe("text/markdown");
    expect(filename).toBe(`${download.fileSlug(model.displayName)}-identity.md`);
    expect(content).toContain(`# ${model.displayName} — identity sheet`);
    spy.mockRestore();
  });

  it("asks Atlas Scout about the item and opens the dock", async () => {
    const chat: ScoutChat = {
      available: true,
      configured: true,
      turns: [],
      busy: false,
      ask: vi.fn(async () => {}),
      stop: vi.fn(),
      reset: vi.fn(),
      dockOpen: false,
      setDockOpen: vi.fn(),
    };
    render(
      <ScoutChatContext.Provider value={chat}>
        <CatalogView />
      </ScoutChatContext.Provider>,
    );
    const { model, drawer } = openModelDrawer();
    fireEvent.click(drawer.getByRole("button", { name: "Ask Scout" }));
    expect(chat.setDockOpen).toHaveBeenCalledWith(true);
    expect(chat.ask).toHaveBeenCalledWith(expect.stringContaining(`(Fabric ID ${model.fabricId})`));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: `${model.displayName} details` })).not.toBeInTheDocument(),
    );
  });
});
