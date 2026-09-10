import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AtlasProvider } from "../store";
import { AssetCatalogView } from "./AssetCatalog";

describe("AssetCatalogView", () => {
  it("opens matching groups during search and restores collapsed state", () => {
    render(
      <AtlasProvider isPreview>
        <AssetCatalogView />
      </AtlasProvider>,
    );

    expect(
      screen.queryByRole("button", { name: /Total Revenue/ }),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search assets"), {
      target: { value: "Total Revenue" },
    });
    expect(
      screen.getByRole("button", { name: /Total Revenue/ }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear asset search" }));
    expect(
      screen.queryByRole("button", { name: /Total Revenue/ }),
    ).not.toBeInTheDocument();
  });

  it("omits a selected asset when the visible kind filter excludes it", () => {
    const onStateChange = vi.fn();
    render(
      <AtlasProvider isPreview>
        <AssetCatalogView
          focus={{
            requestId: "focused-table",
            itemId: "10000000-0000-4000-8000-000000000001",
            objectName: "rentals",
            objectKind: "table",
          }}
          onStateChange={onStateChange}
        />
      </AtlasProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Measures/ }));
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        focus: expect.objectContaining({
          objectName: undefined,
          objectKind: undefined,
          filters: { kind: "measure" },
        }),
      }),
    );
  });

  it("shows resolved DAX dependencies for a selected measure", async () => {
    render(
      <AtlasProvider isPreview>
        <AssetCatalogView />
      </AtlasProvider>,
    );
    fireEvent.change(screen.getByLabelText("Search assets"), {
      target: { value: "Total Revenue" },
    });
    const measureButton = screen.getByText("Total Revenue").closest("button")!;
    expect(measureButton).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(measureButton);
    expect(measureButton).toHaveAttribute("aria-pressed", "true");

    expect(
      await screen.findByLabelText("Total Revenue inspector"),
    ).toBeInTheDocument();
    expect(screen.getByText("Depends on")).toBeInTheDocument();
    expect(screen.getAllByText("DAX").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/total_revenue_chf/).length).toBeGreaterThan(0);
  });

  it("keeps synchronized schema-capable items visible without objects", () => {
    render(
      <AtlasProvider isPreview>
        <AssetCatalogView />
      </AtlasProvider>,
    );

    const group = screen
      .getAllByText("AlpineRent Telemetry")
      .map((element) => element.closest("button"))
      .find((button) => button?.textContent?.includes("Eventhouse"));
    expect(group).toBeInTheDocument();
    fireEvent.click(group!);
    expect(screen.getByText("Item synchronized")).toBeInTheDocument();
    expect(
      screen.getByText(/No discoverable objects were exposed/),
    ).toBeInTheDocument();
  });

  it("does not present missing visibility or provenance as confirmed metadata", async () => {
    render(
      <AtlasProvider isPreview>
        <AssetCatalogView />
      </AtlasProvider>,
    );
    fireEvent.change(screen.getByLabelText("Search assets"), {
      target: { value: "Total Revenue" },
    });
    fireEvent.click(screen.getByText("Total Revenue").closest("button")!);
    const inspector = within(await screen.findByLabelText("Total Revenue inspector"));
    expect(inspector.getByText("Visibility").parentElement).toHaveTextContent("Not collected");
    expect(inspector.getByText("Source").parentElement).toHaveTextContent("Source not recorded");
  });

  it("keeps real assets visible when searching by item type", () => {
    render(
      <AtlasProvider isPreview>
        <AssetCatalogView />
      </AtlasProvider>,
    );

    fireEvent.change(screen.getByLabelText("Search assets"), {
      target: { value: "Warehouse" },
    });
    expect(screen.getByText("dim_date")).toBeInTheDocument();
    expect(screen.queryByText("Item synchronized")).not.toBeInTheDocument();
  });
});
