import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createItemRelationsEvidence,
  recordItemRelationsResponse,
} from "../item-relations-evidence";
import type { ItemRelationsEvidenceLoader } from "../item-relations-evidence-source";
import { SAMPLE_DATA } from "../model";
import { AtlasProvider } from "../store";
import { MapView } from "./Map";

const WORKSPACE = SAMPLE_DATA.workspace.fabricId;
const LAKEHOUSE = "10000000-0000-4000-8000-000000000001";
const WAREHOUSE = "10000000-0000-4000-8000-000000000007";
const MODEL = "10000000-0000-4000-8000-000000000008";
const PIPELINE = "10000000-0000-4000-8000-000000000011";
const BRONZE = "10000000-0000-4000-8000-000000000003";
const EXTERNAL_WORKSPACE = "20000000-0000-4000-8000-0000000000f0";
const EXTERNAL = "20000000-0000-4000-8000-000000000001";
const OBSERVED = "2026-10-01T08:00:00.000Z";
const BETA_EDGES = '[data-evidence-source="fabric-item-relations-api-beta"]';

function evidenceEnvelope() {
  return createItemRelationsEvidence(WORKSPACE, OBSERVED, [
    recordItemRelationsResponse(MODEL, "upstream", OBSERVED, {
      items: [
        {
          id: LAKEHOUSE,
          workspaceId: WORKSPACE,
          type: "Lakehouse",
          displayName: "alpinerent_lakehouse",
        },
        {
          id: EXTERNAL,
          workspaceId: EXTERNAL_WORKSPACE,
          type: "Lakehouse",
          displayName: "Shared reference lakehouse",
        },
      ],
      relations: [
        {
          itemId: LAKEHOUSE,
          dependentOnItemId: MODEL,
          relationType: "Datasource",
        },
        {
          itemId: MODEL,
          dependentOnItemId: EXTERNAL,
          relationType: "Shortcut",
        },
      ],
      workspaces: [{ id: EXTERNAL_WORKSPACE, displayName: "Shared data" }],
    }),
    recordItemRelationsResponse(PIPELINE, "downstream", OBSERVED, {
      items: [],
      relations: [
        {
          itemId: PIPELINE,
          dependentOnItemId: BRONZE,
          relationType: "Orchestration",
        },
      ],
      workspaces: [],
    }),
    recordItemRelationsResponse(WAREHOUSE, "upstream", OBSERVED, {
      items: [],
      relations: [
        {
          itemId: WAREHOUSE,
          dependentOnItemId: LAKEHOUSE,
          relationType: "Shortcut",
        },
      ],
      workspaces: [],
    }),
  ]);
}

const loadEvidence: ItemRelationsEvidenceLoader = async () => ({
  envelope: JSON.parse(JSON.stringify(evidenceEnvelope())),
  snapshotId: SAMPLE_DATA.workspace.snapshotId,
  coverage: { stopReasons: [] },
});
const loadNothing: ItemRelationsEvidenceLoader = async () => null;
const loadPartialEvidence: ItemRelationsEvidenceLoader = async () => ({
  envelope: JSON.parse(JSON.stringify(evidenceEnvelope())),
  snapshotId: "30000000-0000-4000-8000-000000000001",
  coverage: {
    sampledItemCount: 3,
    workspaceItemCount: SAMPLE_DATA.items.length,
    stopReasons: ["deadline-exhausted"],
  },
});
const SECOND_EXTERNAL = "20000000-0000-4000-8000-000000000002";
const OTHER_WORKSPACE = "40000000-0000-4000-8000-0000000000f0";
const loadChainEvidence: ItemRelationsEvidenceLoader = async () => ({
  envelope: JSON.parse(
    JSON.stringify(
      createItemRelationsEvidence(WORKSPACE, OBSERVED, [
        recordItemRelationsResponse(MODEL, "upstream", OBSERVED, {
          items: [
            {
              id: EXTERNAL,
              workspaceId: EXTERNAL_WORKSPACE,
              type: "Lakehouse",
              displayName: "Shared reference lakehouse",
            },
            {
              id: SECOND_EXTERNAL,
              workspaceId: OTHER_WORKSPACE,
              type: "Warehouse",
              displayName: "Raw landing warehouse",
            },
          ],
          relations: [
            { itemId: MODEL, dependentOnItemId: EXTERNAL, relationType: "Shortcut" },
            { itemId: EXTERNAL, dependentOnItemId: SECOND_EXTERNAL, relationType: "Datasource" },
          ],
          workspaces: [
            { id: EXTERNAL_WORKSPACE, displayName: "Shared data" },
            { id: OTHER_WORKSPACE, displayName: "Raw data" },
          ],
        }),
      ]),
    ),
  ),
});

function renderMap(
  props: Parameters<typeof MapView>[0] = {},
  url = "/#map",
) {
  window.history.replaceState(null, "", url);
  return render(
    <AtlasProvider isPreview>
      <MapView {...props} />
    </AtlasProvider>,
  );
}

function previewCheckbox() {
  return screen.getByRole("switch", {
    name: "Item Relations API evidence (Preview)",
  });
}

describe("Map & lineage unified evidence", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  it("draws one graph source at a time and never falls back to Atlas during Preview loading", async () => {
    let resolve: ((value: Awaited<ReturnType<ItemRelationsEvidenceLoader>>) => void) | undefined;
    const loader: ItemRelationsEvidenceLoader = () => new Promise((finish) => { resolve = finish; });
    const { container } = renderMap({ itemRelationsEnabled: true, loadItemRelationsEvidence: loader });
    const snapshotEdges = () => container.querySelectorAll("svg g:not([data-evidence-source]) > path");
    expect(snapshotEdges().length).toBeGreaterThan(0);
    const dataFlow = screen.getByRole("switch", { name: "Data flow relations" });
    const control = screen.getByRole("switch", { name: "Control relations" });
    const treatment = { data: dataFlow.className, control: control.className };

    fireEvent.click(previewCheckbox());
    expect(screen.getByText("Loading persisted Item Relations evidence…")).toBeVisible();
    expect(snapshotEdges()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "objects" })).toBeDisabled();
    await act(async () => { resolve?.(await loadEvidence(WORKSPACE, new AbortController().signal)); });
    await waitFor(() => expect(container.querySelectorAll(BETA_EDGES)).toHaveLength(4));
    expect(snapshotEdges()).toHaveLength(0);
    expect({ data: dataFlow.className, control: control.className }).toEqual(treatment);
    expect(dataFlow).toHaveAttribute("aria-checked", "true");
    expect(control).toHaveAttribute("aria-checked", "true");

    fireEvent.click(previewCheckbox());
    expect(container.querySelectorAll(BETA_EDGES)).toHaveLength(0);
    expect(snapshotEdges().length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "objects" })).toBeEnabled();
  });
  it("honors the Preview object-lineage boundary even in an object-mode deep link", async () => {
    const { container } = renderMap({
      itemRelationsEnabled: true, loadItemRelationsEvidence: loadNothing,
    }, "/?lineage=objects&preview=item-relations#map");
    await screen.findByText("No persisted Item Relations evidence for this workspace.");
    expect(screen.getByRole("button", { name: "objects" })).toBeDisabled();
    expect(container.querySelectorAll("svg g:not([data-evidence-source]) > path")).toHaveLength(0);
    expect(new URL(window.location.href).searchParams.get("lineage")).toBe("items");
  });

  it("restores the selected Lakehouse object view and inspector schema after Preview", async () => {
    renderMap({ itemRelationsEnabled: true, loadItemRelationsEvidence: loadEvidence });
    fireEvent.click(screen.getByLabelText(/^alpinerent_lakehouse, Lakehouse, healthy/));
    fireEvent.click(screen.getByRole("button", { name: "objects" }));
    expect(screen.getByRole("region", { name: "Selected object lineage relationships" })).toBeInTheDocument();
    fireEvent.click(previewCheckbox());
    await screen.findByText("Shared reference lakehouse");
    expect(screen.getByRole("button", { name: "objects" })).toBeDisabled();
    fireEvent.click(previewCheckbox());
    expect(new URL(window.location.href).searchParams.get("lineage")).toBe("objects");
    expect(screen.getByRole("region", { name: "Selected object lineage relationships" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Schema" }), { key: "Enter" });
    expect(within(screen.getByRole("complementary", { name: "Item details inspector" }))
      .getByRole("button", { name: /revenue_by_month/ })).toBeVisible();
  });

  it("keeps a Preview-only item inventory visible when no relations have been collected", async () => {
    const { container } = renderMap({ itemRelationsEnabled: true, loadItemRelationsEvidence: loadNothing });
    fireEvent.click(previewCheckbox());
    await screen.findByText("No persisted Item Relations evidence for this workspace.");
    expect(container.querySelectorAll("svg g:not([data-evidence-source]) > path")).toHaveLength(0);
    expect(screen.getByLabelText(/^alpinerent_lakehouse, Lakehouse, healthy/)).toBeVisible();
  });

  it("makes the real Preview switch and its authority boundary visible even while off", async () => {
    renderMap({ itemRelationsEnabled: true, loadItemRelationsEvidence: loadNothing });
    const toggle = previewCheckbox();
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toHaveAccessibleDescription("Preview shows item relations only. Turn it off to return to your Atlas view.");
    expect(toggle).toHaveClass("min-h-[var(--atlas-touch-target)]");
    expect(screen.getByRole("tablist", { name: "Map and lineage views" })).toHaveClass("atlas-line-tabs");
    expect(screen.getByText("80%")).toBeVisible();
    expect(screen.getByText("Only Atlas snapshot lineage is drawn.")).toBeVisible();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(await screen.findByText("No persisted Item Relations evidence for this workspace.")).toBeVisible();
    expect(screen.queryByText("Item Relations API (Beta, observed)")).not.toBeInTheDocument();
  });

  it("keeps one map with Graph, Evidence and Changes and no Preview control when the flag is off", () => {
    const loader = vi.fn(loadEvidence);
    const { container } = renderMap({
      itemRelationsEnabled: false,
      loadItemRelationsEvidence: loader,
    });

    const views = screen.getByRole("tablist", { name: "Map and lineage views" });
    expect(
      within(views)
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual(["Graph", "Evidence", "Changes", "X-Ray"]);
    expect(screen.getByRole("tab", { name: "Graph" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.queryByRole("checkbox", { name: /Item Relations/ }),
    ).not.toBeInTheDocument();
    expect(loader).not.toHaveBeenCalled();
    expect(container.querySelectorAll(BETA_EDGES)).toHaveLength(0);
    expect(container.querySelectorAll("button[aria-pressed]")).toHaveLength(
      SAMPLE_DATA.items.length,
    );
    expect(
      within(screen.getByLabelText("Map summary"))
        .getAllByRole("term")
        .map((term) => term.textContent),
    ).toEqual(["Items", "Relationships", "Source"]);
    expect(screen.queryByText("Beta evidence · evaluation")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("switch").map((control) => control.textContent),
    ).toEqual(["Data flow relations", "Control relations", "Impact mode"]);
    expect(
      within(screen.getByRole("group", { name: "Lineage legend" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Atlas snapshot (verified)", "Upstream path"]);
  });

  it("loads persisted evidence only when Preview is included and reports when none exists", async () => {
    const loader = vi.fn(loadNothing);
    const { container } = renderMap({
      itemRelationsEnabled: true,
      loadItemRelationsEvidence: loader,
    });

    expect(previewCheckbox()).not.toBeChecked();
    expect(loader).not.toHaveBeenCalled();

    fireEvent.click(previewCheckbox());

    expect(
      await screen.findByText(
        "No persisted Item Relations evidence for this workspace.",
      ),
    ).toBeInTheDocument();
    expect(loader).toHaveBeenCalledWith(WORKSPACE, expect.any(AbortSignal));
    const notice = screen.getByRole("note", { name: "Preview API information" });
    expect(notice).not.toBeVisible();
    fireEvent.click(screen.getByLabelText("Help: Map & lineage"));
    expect(notice).toBeVisible();
    fireEvent.keyDown(screen.getByLabelText("Help: Map & lineage"), { key: "Escape" });
    expect(notice).not.toBeVisible();
    expect(new URL(window.location.href).searchParams.get("preview")).toBe(
      "item-relations",
    );
    expect(container.querySelectorAll(BETA_EDGES)).toHaveLength(0);
    expect(
      screen.queryByText("Item Relations API (Beta, observed)"),
    ).not.toBeInTheDocument();
  });

  it("shows Preview graph edges with API relationType labels and no Atlas comparison", async () => {
    const { container } = renderMap({
      itemRelationsEnabled: true,
      loadItemRelationsEvidence: loadEvidence,
    });
    const lakehouse = () =>
      screen.getByLabelText(/^alpinerent_lakehouse, Lakehouse, healthy/);
    fireEvent.click(previewCheckbox());

    await waitFor(() =>
      expect(container.querySelectorAll(BETA_EDGES)).toHaveLength(4),
    );
    for (const group of container.querySelectorAll(BETA_EDGES)) {
      const coordinates = group.querySelector("path")!.getAttribute("d")!.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      expect(coordinates[0]).toBeLessThan(coordinates[6]);
      expect(group.querySelector("path")).toHaveAttribute("marker-end", expect.stringMatching(/^url\(#atlas-/));
    }
    for (const marker of container.querySelectorAll("marker")) {
      expect(marker).toHaveAttribute("refX", "7");
      expect(marker).toHaveAttribute("markerUnits", "userSpaceOnUse");
    }
    expect(container.querySelectorAll("svg g:not([data-evidence-source]) > path")).toHaveLength(0);
    expect(lakehouse()).toHaveAccessibleName(
      "alpinerent_lakehouse, Lakehouse, healthy",
    );
    expect(screen.getByText("Shared reference lakehouse")).toBeInTheDocument();
    expect(
      container.querySelectorAll("[data-preview-node]"),
    ).toHaveLength(1);
    expect(
      screen.getByText("Item Relations API (Beta, observed)"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Datasource").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Shortcut").length).toBeGreaterThan(0);
    expect(screen.queryByText("Conflict (review needed)")).not.toBeInTheDocument();
    const summary = screen.getByLabelText("Map summary");
    expect(within(summary).getByText("Relationships").nextSibling).toHaveTextContent(
      "4",
    );
    expect(within(summary).getByText("Source").nextSibling).toHaveTextContent(
      "Item Relations Preview",
    );
    expect(container.querySelectorAll("button[aria-pressed]")).toHaveLength(
      5,
    );
  });

  it("moves external Preview nodes freely and releases them on pointer up", async () => {
    const { container } = renderMap({
      itemRelationsEnabled: true,
      loadItemRelationsEvidence: loadEvidence,
    });
    fireEvent.click(previewCheckbox());
    await waitFor(() =>
      expect(container.querySelectorAll(BETA_EDGES)).toHaveLength(4),
    );
    const external = container.querySelector<HTMLElement>("[data-preview-node]")!;
    const initial = { left: external.style.left, top: external.style.top };

    fireEvent.pointerDown(external, {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 11,
    });
    fireEvent.pointerMove(external, {
      clientX: 160,
      clientY: 145,
      pointerId: 11,
    });
    fireEvent.pointerUp(external, {
      button: 0,
      clientX: 160,
      clientY: 145,
      pointerId: 11,
    });

    expect(external.style.left).not.toBe(initial.left);
    expect(external.style.top).not.toBe(initial.top);
    const released = { left: external.style.left, top: external.style.top };

    fireEvent.pointerMove(external, {
      clientX: 220,
      clientY: 210,
      pointerId: 11,
    });

    expect({ left: external.style.left, top: external.style.top }).toEqual(
      released,
    );
  });

  it("hides unrelated Preview components in Impact mode and Reset restores the initial graph", async () => {
    const { container } = renderMap({
      itemRelationsEnabled: true,
      loadItemRelationsEvidence: loadEvidence,
    });
    fireEvent.click(previewCheckbox());
    await waitFor(() =>
      expect(container.querySelectorAll(BETA_EDGES)).toHaveLength(4),
    );
    fireEvent.click(
      screen.getByLabelText(
        "AlpineRent Sales Model, Semantic model, healthy",
      ),
    );
    fireEvent.click(screen.getByRole("switch", { name: "Impact mode" }));

    expect(
      screen.queryByLabelText(/^AlpineRent Daily Load,/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "AlpineRent Sales Model, Semantic model, healthy",
      ),
    ).toBeVisible();
    expect(container.querySelectorAll(BETA_EDGES).length).toBeLessThan(4);

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(screen.getByRole("switch", { name: "Impact mode" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(await screen.findByLabelText(/^AlpineRent Daily Load,/)).toBeVisible();
    expect(container.querySelectorAll(BETA_EDGES)).toHaveLength(4);
    expect(document.querySelectorAll("button[aria-pressed='true']")).toHaveLength(0);
    await waitFor(() => {
      const url = new URL(window.location.href);
      expect(url.searchParams.has("item")).toBe(false);
      expect(url.searchParams.has("impact")).toBe(false);
    });
  });

  it("opens the active Preview source from the Evidence tab", async () => {
    renderMap({
      itemRelationsEnabled: true,
      loadItemRelationsEvidence: loadEvidence,
    }, "/?preview=item-relations#map");

    await screen.findByText("4 drawn relations");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Evidence" }));
    const table = screen.getByRole("table", { name: "Lineage relationships" });
    const row = within(table)
      .getAllByRole("button")
      .find((button) => button.textContent?.includes("AlpineRent Sales Model"));
    fireEvent.click(row!);

    const pane = screen.getByRole("region", { name: "Line evidence" });
    expect(pane).toHaveTextContent("Item Relations API · Preview");
    expect(pane).toHaveTextContent("Datasource");
    expect(pane).not.toHaveTextContent("Atlas snapshot · Validated");

    fireEvent.click(
      within(pane).getByRole("button", { name: "Close relationship evidence" }),
    );
    expect(screen.getByText(/Select a line to review/)).toBeInTheDocument();
  });

  it("explains the active graph source without agreement controls", async () => {
    renderMap({
      itemRelationsEnabled: true,
      loadItemRelationsEvidence: loadEvidence,
    }, "/?preview=item-relations#map");
    await screen.findByText("4 drawn relations");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Evidence" }));

    expect(screen.getByRole("tab", { name: "Evidence" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const table = screen.getByRole("table", { name: "Lineage relationships" });
    expect(
      within(table).getAllByRole("columnheader").map((header) => header.textContent),
    ).toEqual(["Relationship", "Relation type", "Scope", "Evidence", "Open"]);
    expect(screen.queryByRole("combobox", { name: /agreement/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Review the exact relation type/)).toBeVisible();
  });

  it("filters data-flow and control relations without moving nodes", async () => {
    const { container } = renderMap({
      itemRelationsEnabled: true,
      loadItemRelationsEvidence: loadEvidence,
    }, "/?preview=item-relations#map");
    await waitFor(() =>
      expect(container.querySelectorAll(BETA_EDGES)).toHaveLength(4),
    );
    const pipeline = screen.getByLabelText(/^AlpineRent Daily Load,/);
    const position = { left: pipeline.style.left, top: pipeline.style.top };
    const drawnTitles = () =>
      [...container.querySelectorAll("svg g > title")].map((node) => node.textContent);
    expect(drawnTitles()).toContain("Item Relations API (Beta): Orchestration");

    fireEvent.click(screen.getByRole("switch", { name: "Control relations" }));

    expect(screen.getByRole("switch", { name: "Control relations" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(drawnTitles()).not.toContain("Item Relations API (Beta): Orchestration");
    expect(drawnTitles()).toContain("Item Relations API (Beta): Datasource");
    expect({ left: pipeline.style.left, top: pipeline.style.top }).toEqual(position);

    fireEvent.click(screen.getByRole("switch", { name: "Data flow relations" }));

    expect(drawnTitles()).not.toContain("Item Relations API (Beta): Datasource");
    expect(container.querySelectorAll(BETA_EDGES)).toHaveLength(0);
  });

  it("keeps the Data flow and Control relations switches unchanged in look and filtering", () => {
    const { container } = renderMap();
    const drawnTitles = () =>
      [...container.querySelectorAll("svg g > title")].map((node) => node.textContent ?? "");
    const dataFlow = screen.getByRole("switch", { name: "Data flow relations" });
    const control = screen.getByRole("switch", { name: "Control relations" });
    const track = (control: HTMLElement) => control.querySelector('span[aria-hidden="true"]')!;

    expect(dataFlow.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const toggle of [dataFlow, control]) {
      expect(toggle).toHaveClass("min-h-[var(--atlas-touch-target)]", "sm:min-h-[var(--atlas-control-height)]", "gap-s", "rounded-md", "px-s", "font-semibold", "text-foreground", "hover:bg-accent");
      expect(track(toggle)).toHaveClass("h-l", "w-xxxl", "rounded-full", "border", "after:h-m", "after:w-m", "after:translate-x-[12px]");
    }
    expect(dataFlow).toHaveClass("ml-auto");
    expect(track(dataFlow)).toHaveClass("border-primary", "bg-primary", "after:bg-primary-foreground");
    expect(track(control)).toHaveClass("border-lineage-upstream", "bg-lineage-upstream", "after:bg-card");
    expect(drawnTitles()).toHaveLength(14);

    fireEvent.click(dataFlow);
    expect(dataFlow).toHaveAttribute("aria-checked", "false");
    expect(track(dataFlow)).toHaveClass("border-input", "bg-muted", "after:bg-muted-foreground");
    expect(drawnTitles()).toHaveLength(7);
    expect(drawnTitles().every((title) => ["orchestrates", "endpoint", "default db", "database"].includes(title))).toBe(true);

    fireEvent.click(dataFlow);
    fireEvent.click(control);
    expect(track(control)).toHaveClass("border-input", "bg-muted", "after:bg-muted-foreground");
    expect(drawnTitles()).toHaveLength(7);
    expect(drawnTitles()).not.toContain("orchestrates");
  });

  it("redirects legacy map-beta links to the single map with Preview included", async () => {
    renderMap(
      { itemRelationsEnabled: true, loadItemRelationsEvidence: loadNothing },
      "/#map-beta",
    );

    expect(previewCheckbox()).toBeChecked();
    await waitFor(() => expect(window.location.hash).toBe("#map"));
    expect(new URL(window.location.href).searchParams.get("preview")).toBe(
      "item-relations",
    );
    expect(
      await screen.findByText(
        "No persisted Item Relations evidence for this workspace.",
      ),
    ).toBeInTheDocument();
  });

  it("lists every relationship by source on the Evidence tab", async () => {
    renderMap({
      itemRelationsEnabled: true,
      loadItemRelationsEvidence: loadEvidence,
    }, "/?preview=item-relations#map");
    await screen.findByText("4 drawn relations");

    await act(async () => {
      fireEvent.mouseDown(screen.getByRole("tab", { name: "Evidence" }));
    });

    const table = screen.getByRole("table", { name: "Lineage relationships" });
    expect(within(table).getAllByRole("button")).toHaveLength(4);
    expect(
      within(table).getAllByRole("columnheader").map((header) => header.textContent),
    ).toEqual(["Relationship", "Relation type", "Scope", "Evidence", "Open"]);
    expect(
      screen.getByRole("region", { name: "Item Relations evidence coverage" }),
    ).toHaveTextContent("Complete queries3");
    const rows = within(table).getAllByRole("button");
    expect(rows).toHaveLength(4);

    fireEvent.click(rows[0]);
    expect(rows[0]).toHaveAttribute("aria-current", "true");
    expect(
      screen.getByRole("region", { name: "Line evidence" }),
    ).toHaveTextContent("Item Relations API · Preview");
    expect(new URL(window.location.href).searchParams.get("view")).toBe(
      "evidence",
    );
  });

  it("shows snapshot lineage on the Evidence tab without Preview evidence", () => {
    renderMap({ itemRelationsEnabled: false }, "/?view=evidence#map");

    const table = screen.getByRole("table", { name: "Lineage relationships" });
    expect(within(table).getAllByRole("button")).toHaveLength(
      SAMPLE_DATA.edges.length,
    );
    expect(within(table).getAllByText("Validated snapshot")).toHaveLength(
      SAMPLE_DATA.edges.length,
    );
    expect(screen.getByText("Atlas snapshot evidence")).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Item Relations evidence coverage" }),
    ).not.toBeInTheDocument();
  });

  it("reports load failures and invalid envelopes without drawing evidence", async () => {
    const loader = vi
      .fn<ItemRelationsEvidenceLoader>()
      .mockRejectedValueOnce(new Error("network detail"))
      .mockResolvedValueOnce({ envelope: { schemaVersion: 2 } });
    const { container } = renderMap(
      { itemRelationsEnabled: true, loadItemRelationsEvidence: loader },
      "/?preview=item-relations#map",
    );

    expect(
      screen.getByText("Loading persisted Item Relations evidence…"),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("svg g:not([data-evidence-source]) > path")).toHaveLength(0);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Persisted Item Relations evidence could not be loaded.",
    );
    expect(alert).not.toHaveTextContent("network detail");

    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "failed validation",
      ),
    );
    expect(loader).toHaveBeenCalledTimes(2);
    expect(container.querySelectorAll(BETA_EDGES)).toHaveLength(0);
    expect(container.querySelectorAll("svg g:not([data-evidence-source]) > path")).toHaveLength(0);
  });

  it("labels partial persisted coverage and early collector stops", async () => {
    renderMap(
      { itemRelationsEnabled: true, loadItemRelationsEvidence: loadPartialEvidence },
      "/?preview=item-relations#map",
    );

    expect(
      await screen.findByText(
        `Partial: 3 of ${SAMPLE_DATA.items.length} items queried`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Stopped early: deadline-exhausted"),
    ).toBeInTheDocument();
  });

  it("expands stored cross-workspace relations without moving shown nodes", async () => {
    const { container } = renderMap(
      { itemRelationsEnabled: true, loadItemRelationsEvidence: loadChainEvidence },
      "/?preview=item-relations#map",
    );
    const expand = await screen.findByRole("button", {
      name: "Expand stored relations of Shared reference lakehouse (1 hidden)",
    });
    const lane = () => [...container.querySelectorAll<HTMLElement>("[data-preview-node]")];
    const first = lane()[0];
    const position = { left: first.style.left, top: first.style.top };
    expect(lane()).toHaveLength(1);

    fireEvent.click(expand);

    expect(lane()).toHaveLength(2);
    expect({ left: lane()[0].style.left, top: lane()[0].style.top }).toEqual(position);
    expect(screen.getByText("Raw landing warehouse")).toBeInTheDocument();
    const path = screen.getByRole("navigation", { name: "Cross-workspace exploration path" });
    expect(path).toHaveTextContent("Shared data: Shared reference lakehouse");
    expect(new URL(window.location.href).searchParams.get("expand")).toBe(
      `${EXTERNAL_WORKSPACE}:${EXTERNAL}`,
    );

    fireEvent.click(within(path).getByRole("button", { name: "Reset exploration" }));

    expect(lane()).toHaveLength(1);
    expect(new URL(window.location.href).searchParams.has("expand")).toBe(false);
  });

  it("restores expansions from the URL and ignores malformed keys", async () => {
    const { container } = renderMap(
      { itemRelationsEnabled: true, loadItemRelationsEvidence: loadChainEvidence },
      `/?preview=item-relations&expand=${EXTERNAL_WORKSPACE}:${EXTERNAL},not-a-key#map`,
    );

    expect(await screen.findByText("Raw landing warehouse")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-preview-node]")).toHaveLength(2);
    expect(new URL(window.location.href).searchParams.get("expand")).toBe(
      `${EXTERNAL_WORKSPACE}:${EXTERNAL}`,
    );
  });

  it("never reaches the backend for evidence in preview builds", async () => {
    renderMap({ itemRelationsEnabled: true }, "/?preview=item-relations#map");

    expect(
      await screen.findByText(
        "No persisted Item Relations evidence for this workspace.",
      ),
    ).toBeInTheDocument();
  });

  it("explains that Changes need a second snapshot and never track Beta evidence", async () => {
    renderMap(
      { itemRelationsEnabled: true, loadItemRelationsEvidence: loadNothing },
      "/?view=changes&preview=item-relations#map",
    );

    expect(
      await screen.findByText(
        "No persisted Item Relations evidence for this workspace.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Atlas snapshot lineage changes" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Lineage changes appear after a second synchronized snapshot.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Item Relations changes are not tracked."),
    ).toBeInTheDocument();
  });
});
