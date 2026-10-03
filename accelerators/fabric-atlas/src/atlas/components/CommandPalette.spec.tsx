import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  CatalogSearchEntry,
  CatalogSearchEnvelope,
  CatalogSearchRequest,
} from "../catalog-search";
import { SAMPLE_DATA } from "../model";
import { buildSearchIndex } from "../search";
import { CommandPalette, type CommandPaletteCatalogSearch } from "./CommandPalette";

const PARTNER_WS = "11111111-1111-4111-8111-111111111111";
const EXTERNAL_ID = "66666666-6666-4666-8666-666666666666";

function catalogEntry(
  id: string,
  displayName: string,
  overrides: Partial<CatalogSearchEntry> = {},
): CatalogSearchEntry {
  return {
    key: `item:${id}`,
    id,
    catalogEntryType: "FabricItem",
    type: "Report",
    displayName,
    workspaceId: PARTNER_WS,
    workspaceDisplayName: "Partner workspace",
    ...overrides,
  };
}

function catalogEnvelope(
  entries: CatalogSearchEntry[],
  overrides: Partial<CatalogSearchEnvelope> = {},
): CatalogSearchEnvelope {
  return {
    contractVersion: 1,
    source: "onelake-catalog-search",
    apiVersion: "v1-preview",
    authoritative: false,
    identity: "fabric-application",
    status: "complete",
    retryable: false,
    searchedAt: "2026-10-02T12:00:00.000Z",
    entries,
    coverage: {
      pagesFetched: 1,
      entriesReceived: entries.length,
      entriesReturned: entries.length,
      entriesSkipped: 0,
      duplicatesDropped: 0,
      descriptionsTruncated: 0,
      moreAvailable: false,
    },
    continuationToken: null,
    ...overrides,
  };
}

function renderWithCatalog(
  catalogSearch: CommandPaletteCatalogSearch,
  onSelect = vi.fn(),
) {
  render(
    <CommandPalette
      index={buildSearchIndex(SAMPLE_DATA)}
      open
      onClose={() => undefined}
      onSelect={onSelect}
      catalogSearch={catalogSearch}
    />,
  );
  return {
    onSelect,
    input: screen.getByRole("combobox", { name: "Search workspace metadata" }),
  };
}

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

describe("CommandPalette OneLake Catalog Search", () => {
  const snapshotItem = SAMPLE_DATA.items[0];
  const snapshotEntry = catalogEntry(snapshotItem.fabricId.toLowerCase(), "Catalog name for a synchronized item", {
    workspaceId: SAMPLE_DATA.workspace.fabricId.toLowerCase(),
    workspaceDisplayName: SAMPLE_DATA.workspace.displayName,
  });
  const externalEntry = catalogEntry(EXTERNAL_ID, "Partner revenue report");

  it("keeps the palette unchanged when Catalog Search is off", async () => {
    render(
      <CommandPalette
        index={buildSearchIndex(SAMPLE_DATA)}
        open
        onClose={() => undefined}
        onSelect={() => undefined}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Search workspace metadata" }), {
      target: { value: "report" },
    });
    await screen.findAllByRole("option");
    expect(screen.queryByRole("region", { name: /OneLake catalog/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Search catalog/ })).not.toBeInTheDocument();
  });

  it("appends source-labelled catalog results after unchanged snapshot results", async () => {
    const search = vi.fn(async () => catalogEnvelope([snapshotEntry, externalEntry]));
    const { input } = renderWithCatalog({ availability: "available", search });
    fireEvent.change(input, { target: { value: "report" } });
    const localNames = (await screen.findAllByRole("option")).map((option) => option.textContent);
    expect(screen.queryByRole("note", { name: "Preview API information" })).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Search catalog" }));

    const group = await screen.findByRole("group", { name: "OneLake catalog · Preview" });
    expect(search).toHaveBeenCalledWith({ kind: "search", search: "report" });
    const catalogOptions = within(group).getAllByRole("option");
    expect(catalogOptions).toHaveLength(2);
    expect(catalogOptions[0]).toHaveTextContent("in the Atlas snapshot");
    expect(catalogOptions[1]).toHaveTextContent("Partner revenue report");
    expect(catalogOptions[1]).toHaveTextContent("outside the snapshot");
    const snapshotGroup = screen.getByRole("group", { name: "Atlas snapshot" });
    expect(within(snapshotGroup).getAllByRole("option").map((option) => option.textContent)).toEqual(localNames);
    expect(screen.getByRole("status", { name: "OneLake catalog status" })).toHaveTextContent(
      "2 catalog entries · 1 in snapshot",
    );
    expect(screen.getByRole("note", { name: "Preview API information" })).toHaveTextContent("OneLake Catalog Search");
    expect(screen.getByText(/discovery only; snapshot evidence is unchanged/)).toBeInTheDocument();
    expect(screen.getByText(`${localNames.length} snapshot · 2 catalog`)).toBeInTheDocument();
  });

  it("opens snapshot matches in Atlas and other entries in Fabric", async () => {
    const openExternal = vi.fn();
    const search = vi.fn(async () => catalogEnvelope([snapshotEntry, externalEntry]));
    const { input, onSelect } = renderWithCatalog({ availability: "available", search, openExternal });
    fireEvent.change(input, { target: { value: "report" } });
    const localCount = (await screen.findAllByRole("option")).length;
    fireEvent.click(await screen.findByRole("button", { name: "Search catalog" }));
    await screen.findByRole("group", { name: "OneLake catalog · Preview" });

    for (let step = 0; step <= localCount; step += 1) fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", "atlas-catalog-result-1");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(openExternal).toHaveBeenCalledWith(expect.stringContaining(`/groups/${PARTNER_WS}/list`));
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("option", { name: /Catalog name for a synchronized item/ }));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "item", target: expect.objectContaining({ itemId: snapshotItem.fabricId }) }),
    );
  });

  it("loads more with the continuation token and keeps earlier entries", async () => {
    const later = catalogEntry("77777777-7777-4777-8777-777777777777", "Later partner report");
    const search = vi
      .fn<(request: CatalogSearchRequest) => Promise<CatalogSearchEnvelope>>()
      .mockResolvedValueOnce(catalogEnvelope([externalEntry], { continuationToken: "t1" }))
      .mockResolvedValueOnce(catalogEnvelope([externalEntry, later]));
    const { input } = renderWithCatalog({ availability: "available", search });
    fireEvent.change(input, { target: { value: "report" } });
    fireEvent.click(await screen.findByRole("button", { name: "Search catalog" }));
    expect(await screen.findByRole("status", { name: "OneLake catalog status" })).toHaveTextContent("more available");

    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));

    await screen.findByRole("option", { name: /Later partner report/ });
    expect(search).toHaveBeenLastCalledWith({ kind: "continue", continuationToken: "t1" });
    const group = screen.getByRole("group", { name: "OneLake catalog · Preview" });
    expect(within(group).getAllByRole("option").map((option) => option.textContent)).toEqual([
      expect.stringContaining("Partner revenue report"),
      expect.stringContaining("Later partner report"),
    ]);
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("explains the synchronizer-only state without searching", async () => {
    const search = vi.fn();
    const { input } = renderWithCatalog({ availability: "not-authorized", search });
    fireEvent.change(input, { target: { value: "report" } });
    expect(await screen.findByRole("status", { name: "OneLake catalog status" })).toHaveTextContent(
      "Only the configured Atlas synchronizer",
    );
    expect(screen.queryByRole("button", { name: /Search catalog/ })).not.toBeInTheDocument();
    expect(search).not.toHaveBeenCalled();
  });

  it("reports a permission failure without a misleading retry", async () => {
    const search = vi.fn(async () =>
      catalogEnvelope([], { status: "failed", failureCode: "permission-denied", retryable: false }),
    );
    const { input } = renderWithCatalog({ availability: "available", search });
    fireEvent.change(input, { target: { value: "report" } });
    fireEvent.click(await screen.findByRole("button", { name: "Search catalog" }));
    expect(await screen.findByText("Catalog Search permission denied.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
  });

  it("offers a retry for a transient failure and never treats empty results as absence", async () => {
    const search = vi
      .fn<(request: CatalogSearchRequest) => Promise<CatalogSearchEnvelope>>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(catalogEnvelope([]));
    const { input } = renderWithCatalog({ availability: "available", search });
    fireEvent.change(input, { target: { value: "report" } });
    fireEvent.click(await screen.findByRole("button", { name: "Search catalog" }));
    expect(await screen.findByText("Catalog Search unavailable.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("status", { name: "OneLake catalog status" })).toHaveTextContent(
      "does not prove that an asset is absent",
    );
    expect(search).toHaveBeenLastCalledWith({ kind: "search", search: "report" });
  });

  it("drops catalog results when the query changes", async () => {
    const search = vi.fn(async () => catalogEnvelope([externalEntry]));
    const { input } = renderWithCatalog({ availability: "available", search });
    fireEvent.change(input, { target: { value: "report" } });
    fireEvent.click(await screen.findByRole("button", { name: "Search catalog" }));
    await screen.findByRole("group", { name: "OneLake catalog · Preview" });

    fireEvent.change(input, { target: { value: "lakehouse" } });

    expect(await screen.findByRole("button", { name: "Search catalog" })).toBeEnabled();
    expect(screen.queryByRole("group", { name: "OneLake catalog · Preview" })).not.toBeInTheDocument();
  });

  it("keeps focus on a busy catalog action and ignores repeated clicks", async () => {
    let finish: (value: CatalogSearchEnvelope) => void = () => undefined;
    const search = vi.fn(
      () =>
        new Promise<CatalogSearchEnvelope>((resolve) => {
          finish = resolve;
        }),
    );
    const { input } = renderWithCatalog({ availability: "available", search });
    fireEvent.change(input, { target: { value: "report" } });
    const button = await screen.findByRole("button", { name: "Search catalog" });
    button.focus();
    fireEvent.click(button);

    const busy = await screen.findByRole("button", { name: "Searching…" });
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(busy).toHaveFocus();
    fireEvent.click(busy);
    expect(search).toHaveBeenCalledTimes(1);

    finish(catalogEnvelope([externalEntry]));
    await screen.findByRole("group", { name: "OneLake catalog · Preview" });
  });
  it("keeps Enter on the catalog action from opening a snapshot result", async () => {
    const search = vi.fn(async () => catalogEnvelope([]));
    const { input, onSelect } = renderWithCatalog({ availability: "available", search });
    fireEvent.change(input, { target: { value: "report" } });
    const button = await screen.findByRole("button", { name: "Search catalog" });
    fireEvent.keyDown(button, { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
