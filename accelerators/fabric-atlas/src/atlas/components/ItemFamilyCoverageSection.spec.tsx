import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AtlasData, Item, Job } from "../model";
import { ItemFamilyCoverageSection } from "./ItemFamilyCoverageSection";

// Item types and shapes as observed in the reference tenant on 2026-10-02.
function item(fabricId: string, itemType: string): Item {
  return {
    fabricId,
    displayName: fabricId,
    itemType: itemType as Item["itemType"],
    health: "unknown",
    endorsement: "none",
    tags: [],
  };
}

function snapshot(items: Item[], jobs: Job[] = []): Pick<AtlasData, "items" | "jobs" | "workspace"> {
  return {
    items,
    jobs,
    workspace: {
      fabricId: "6bf4c521-7412-4e6b-8867-68253bbfb18a",
      displayName: "FGI-MAIN",
      capacity: "F64",
      region: "Central US",
      syncedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
    },
  };
}

const TENANT_SHAPED = snapshot(
  [
    item("nb-1", "Notebook"),
    item("nb-2", "Notebook"),
    item("lh-1", "Lakehouse"),
    item("md-1", "MirroredDatabase"),
    item("ab-1", "AppBackend"),
    item("wk-1", "Microsoft.WaaS.BusinessProcessSolutions"),
  ],
  [
    {
      itemFabricId: "lh-1",
      itemName: "lh-1",
      jobType: "RefreshMaterializedLakeViews",
      status: "completed",
      startedAt: "2026-10-02T10:00:00.000Z",
      durationSec: 30,
    } as Job,
  ],
);

function mobile() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ItemFamilyCoverageSection", () => {
  it("summarizes partial coverage without treating gaps as collected", () => {
    render(<ItemFamilyCoverageSection data={TENANT_SHAPED} />);
    expect(screen.getByRole("note")).toHaveTextContent(
      "Coverage is partial. Adapter-only, deferred and unsupported dimensions are not treated as collected.",
    );
    const families = screen.getByText("Item families").parentElement!;
    expect(families).toHaveTextContent("6");
    expect(families).toHaveTextContent("6 items in this snapshot");
    expect(screen.getByText("Adapter only or deferred").parentElement).toHaveTextContent(/\d+/);
  });

  it("lists every observed family in one keyboard-navigable inventory", () => {
    render(<ItemFamilyCoverageSection data={TENANT_SHAPED} />);
    const inventory = screen.getByRole("listbox", { name: "Item family coverage" });
    const options = within(inventory).getAllByRole("option");
    expect(options[0]).toHaveAccessibleName(/^Notebook\. 2 items\. Catalog Collected\. Objects Excluded by design/);
    expect(options.map((option) => option.getAttribute("aria-label")?.split(".")[0])).toEqual([
      "Notebook",
      "Business Process Solutions (Microsoft",
      "Fabric app",
      "Lakehouse",
      "Mirrored DB",
      "Materialized lake view",
    ]);
    expect(options[0]).toHaveAttribute("tabindex", "0");
    options[0].focus();
    fireEvent.keyDown(options[0], { key: "ArrowDown" });
    expect(options[1]).toHaveFocus();
    fireEvent.keyDown(options[1], { key: "End" });
    expect(options.at(-1)).toHaveFocus();
  });

  it("opens the selected family in the evidence details pane on desktop", () => {
    render(<ItemFamilyCoverageSection data={TENANT_SHAPED} />);
    const pane = () => within(screen.getByRole("complementary", { name: "Selected family evidence" }));
    expect(pane().getByRole("heading", { name: "Evidence details" })).toBeVisible();
    expect(pane().getByRole("heading", { name: "Notebook" })).toBeVisible();

    fireEvent.click(screen.getByRole("option", { name: /^Mirrored DB\./ }));

    expect(pane().getByRole("heading", { name: "Mirrored DB" })).toBeVisible();
    expect(pane().getAllByRole("term").map((term) => term.textContent)).toEqual([
      "Catalog",
      "Objects",
      "Lineage",
      "Access",
      "Operations",
      "Last observed",
      "Follow-up",
    ]);
    expect(pane().queryByText("Adapter only")).not.toBeInTheDocument();
    expect(pane().getAllByText("Collected").length).toBeGreaterThanOrEqual(3);
    expect(pane().getByText("2m ago")).toBeVisible();
    expect(pane().getByRole("link", { name: "Open definition documentation" })).toHaveAttribute(
      "href",
      expect.stringContaining("mirrored-database-definition"),
    );
    expect(screen.getByRole("option", { name: /^Mirrored DB\./ })).toHaveAttribute("aria-selected", "true");
  });

  it("shows derived MLV evidence from refresh jobs instead of a fabricated item", () => {
    render(<ItemFamilyCoverageSection data={TENANT_SHAPED} />);
    fireEvent.click(screen.getByRole("option", { name: /^Materialized lake view\./ }));
    const pane = within(screen.getByRole("complementary", { name: "Selected family evidence" }));
    expect(pane.getByText("Inside Lakehouse")).toBeVisible();
    expect(pane.getByText("1 refresh job on 1 Lakehouse")).toBeVisible();
    expect(pane.getByText(/Not a top-level Fabric item type/)).toBeVisible();
  });

  it("filters the inventory and announces the visible count", () => {
    render(<ItemFamilyCoverageSection data={TENANT_SHAPED} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search item families" }), {
      target: { value: "workload" },
    });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("No item family matches this search.")).toBeVisible();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search item families" }), {
      target: { value: "lake" },
    });
    expect(screen.getAllByRole("option").map((option) => option.getAttribute("aria-label")?.split(".")[0])).toEqual([
      "Lakehouse",
      "Materialized lake view",
    ]);
    expect(screen.getByText("2 of 6 item families shown")).toHaveAttribute("aria-live", "polite");
  });

  it("keeps unobserved families collapsed until requested", () => {
    render(<ItemFamilyCoverageSection data={TENANT_SHAPED} />);
    const observed = screen.getByRole("list", { name: "Gaps in observed families" });
    expect(within(observed).queryByRole("heading", { name: "Mirrored DB" })).not.toBeInTheDocument();
    expect(
      within(observed).getByRole("heading", {
        name: /Business Process Solutions/,
      }),
    ).toBeVisible();
    const toggle = screen.getByRole("button", { name: /Show families not in this snapshot/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("list", { name: "Gaps in families not in this snapshot" })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(
      within(screen.getByRole("list", { name: "Gaps in families not in this snapshot" })).getByRole("heading", {
        name: "Event schema set",
      }),
    ).toBeVisible();
  });

  it("uses a focus-managed dialog for evidence on narrow screens", () => {
    mobile();
    render(<ItemFamilyCoverageSection data={TENANT_SHAPED} />);
    expect(screen.queryByRole("heading", { name: "Evidence details" })).not.toBeInTheDocument();
    const option = screen.getByRole("option", { name: /^Lakehouse\./ });
    option.focus();
    fireEvent.keyDown(option, { key: "Enter" });
    const dialog = screen.getByRole("dialog", { name: "Item family evidence" });
    const close = within(dialog).getByRole("button", { name: "Close evidence details" });
    expect(close).toHaveFocus();
    expect(within(dialog).getByText(/Source provenance\./)).toBeVisible();
    fireEvent.click(close);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("states that coverage appears after the first synchronization", () => {
    render(<ItemFamilyCoverageSection data={snapshot([])} />);
    expect(screen.getByText(/Coverage appears after the first synchronization/)).toBeVisible();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });
});
