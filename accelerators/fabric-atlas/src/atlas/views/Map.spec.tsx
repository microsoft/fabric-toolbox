import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { displayPreferenceKey } from "../display-preferences";
import type { MetadataObjectLineageEdge } from "../item-metadata";
import { MAP_INSPECTOR_DEFAULT_WIDTH } from "../map-inspector";
import {
  buildMetadataObjectGraph,
  groupObjectGraphByItem,
  MAX_VISIBLE_OBJECT_EDGES,
  objectItemGroups,
  shouldUseVerifiedMetadataGraph,
} from "../metadata-object-graph";
import { SAMPLE_DATA, typeMeta } from "../model";
import { AtlasProvider } from "../store";
import { MapView } from "./Map";

describe("MapView selection", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("metadata object graph", () => {
    const items = new Map(
      [
        {
          fabricId: "warehouse",
          displayName: "Operations warehouse",
          itemType: "Warehouse" as const,
          health: "healthy" as const,
          endorsement: "none" as const,
          tags: [],
        },
        {
          fabricId: "ontology",
          displayName: "Operations ontology",
          itemType: "Ontology" as const,
          health: "healthy" as const,
          endorsement: "none" as const,
          tags: [],
        },
      ].map((item) => [item.fabricId, item]),
    );
    const edges: MetadataObjectLineageEdge[] = [
      {
        source: {
          itemId: "warehouse",
          kind: "sourceObject",
          id: "dbo.Devices",
          name: "Devices",
          tableName: "Devices",
        },
        target: {
          itemId: "ontology",
          kind: "ontologyEntity",
          id: "device",
          name: "Device",
        },
        relation: "binds entity",
        confidence: "verified",
      },
      {
        source: {
          itemId: "ontology",
          kind: "ontologyEntity",
          id: "device",
          name: "Device",
        },
        target: {
          itemId: "ontology",
          kind: "ontologyRelationship",
          id: "installed-at",
          name: "Installed at",
        },
        relation: "relationship source",
        confidence: "verified",
      },
      {
        source: {
          itemId: "ontology",
          kind: "ontologyRelationship",
          id: "installed-at",
          name: "Installed at",
        },
        target: {
          itemId: "ontology",
          kind: "ontologyEntity",
          id: "site",
          name: "Site",
        },
        relation: "relationship target",
        confidence: "verified",
      },
      {
        source: {
          itemId: "unrelated",
          kind: "sourceObject",
          id: "Other",
          name: "Other",
        },
        target: {
          itemId: "another-item",
          kind: "graphNode",
          id: "OtherNode",
          name: "Other node",
        },
        relation: "maps node",
        confidence: "verified",
      },
    ];

    it("lays out verified selected-item edges from source to consumer", () => {
      const graph = buildMetadataObjectGraph(edges, "ontology", items);
      const byName = new Map(graph.nodes.map((node) => [node.label, node]));

      expect(graph.verifiedMetadata).toBe(true);
      expect(graph.edges).toHaveLength(3);
      expect(byName.has("Other")).toBe(false);
      expect(byName.get("Devices")!.x).toBeLessThan(byName.get("Device")!.x);
      expect(byName.get("Device")!.x).toBeLessThan(
        byName.get("Installed at")!.x,
      );
      expect(byName.get("Installed at")!.x).toBeLessThan(
        byName.get("Site")!.x,
      );
    });

    it("filters around matching objects and caps dense graphs", () => {
      const relationshipGraph = buildMetadataObjectGraph(
        edges,
        "ontology",
        items,
        { objectKind: "ontologyRelationship" },
      );
      expect(relationshipGraph.edges).toHaveLength(2);
      expect(relationshipGraph.nodes.map((node) => node.label)).toEqual(
        expect.arrayContaining(["Device", "Installed at", "Site"]),
      );

      const denseEdges: MetadataObjectLineageEdge[] = Array.from(
        { length: MAX_VISIBLE_OBJECT_EDGES + 25 },
        (_, index) => ({
          source: {
            itemId: "warehouse",
            kind: "sourceField" as const,
            id: `Devices.Field${index}`,
            name: `Field${index}`,
            tableName: "Devices",
          },
          target: {
            itemId: "ontology",
            kind: "ontologyProperty" as const,
            id: `property-${index}`,
            name: `Property ${index}`,
            tableName: "Device",
          },
          relation: "binds property",
          confidence: "verified" as const,
        }),
      );
      const denseGraph = buildMetadataObjectGraph(
        denseEdges,
        "ontology",
        items,
      );
      expect(denseGraph.edges).toHaveLength(MAX_VISIBLE_OBJECT_EDGES);
      expect(denseGraph.truncated).toBe(true);
    });

    it("groups connected items and keeps only the active item expanded", () => {
      const graph = buildMetadataObjectGraph(edges, "ontology", items);
      const groups = objectItemGroups(graph, "ontology", items);
      const grouped = groupObjectGraphByItem(
        graph,
        "ontology",
        items,
        new Set(["ontology"]),
      );

      expect(groups).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ itemId: "warehouse", objectCount: 1 }),
          expect.objectContaining({ itemId: "ontology", objectCount: 3 }),
        ]),
      );
      expect(
        grouped.nodes.find((node) => node.id === "item-group:warehouse"),
      ).toMatchObject({
        label: "Operations warehouse",
        collapsedItemGroup: true,
        objectCount: 1,
      });
      expect(
        grouped.nodes.some((node) => node.label === "Installed at"),
      ).toBe(true);
    });

    it("keeps local schema graphs for relational items connected to ontologies", () => {
      expect(
        shouldUseVerifiedMetadataGraph(
          items.get("warehouse"),
          3,
          edges.length,
        ),
      ).toBe(false);
      expect(
        shouldUseVerifiedMetadataGraph(
          items.get("ontology"),
          3,
          edges.length,
        ),
      ).toBe(true);
    });
  });

  const selectInspectorTab = async (
    currentName: string,
    nextName: string,
  ) => {
    const current = screen.getByRole("tab", { name: currentName });
    act(() => current.focus());
    fireEvent.keyDown(current, { key: "ArrowRight" });
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: nextName })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
  };

  it("shows the full workspace by default without edge text overlays", () => {
    window.history.replaceState(null, "", "/#map");
    const { container } = render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );

    expect(container.querySelectorAll('button[aria-pressed]')).toHaveLength(
      SAMPLE_DATA.items.length,
    );
    expect(container.querySelectorAll("svg text")).toHaveLength(0);
  });

  it("supports keyboard navigation in the item inspector", async () => {
    window.history.replaceState(null, "", "/#map");
    render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );

    const summary = screen.getByRole("tab", { name: "Summary" });
    await act(async () => {
      summary.focus();
      fireEvent.keyDown(summary, { key: "ArrowRight" });
    });

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Schema" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(screen.getByText(/Deep lineage/)).toBeInTheDocument();
  });

  it("exposes selected lineage without relying on color alone", () => {
    window.history.replaceState(null, "", "/#map");
    const { container } = render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );

    expect(
      screen.getByRole("region", {
        name: "Selected lineage relationships",
      }),
    ).toBeInTheDocument();
    expect(
      container.querySelectorAll('path[stroke-dasharray="2 5"]').length,
    ).toBeGreaterThan(0);
  });

  it("keeps node coordinates stable when selection changes", () => {
    window.history.replaceState(null, "", "/#map");
    render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );

    const lakehouse = screen.getByLabelText(
      "alpinerent_lakehouse, Lakehouse, healthy",
    );
    const position = {
      left: lakehouse.style.left,
      top: lakehouse.style.top,
    };

    fireEvent.pointerDown(lakehouse, {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 1,
    });

    fireEvent.pointerUp(lakehouse, {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 1,
    });

    const selectedLakehouse = screen.getByLabelText(
      "alpinerent_lakehouse, Lakehouse, healthy",
    );
    expect(selectedLakehouse).toHaveAttribute("aria-pressed", "true");
    expect(selectedLakehouse.style.left).toBe(position.left);
    expect(selectedLakehouse.style.top).toBe(position.top);
  });

  it("keeps the complete graph and node positions when impact mode changes", () => {
    window.history.replaceState(null, "", "/#map");
    const { container } = render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );
    fireEvent.click(
      screen.getByLabelText("alpinerent_lakehouse, Lakehouse, healthy"),
    );
    const viewport = container.querySelector<HTMLDivElement>(".atlas-map-grid")!;
    viewport.scrollLeft = 360;
    viewport.scrollTop = 420;

    const before = new Map(
      SAMPLE_DATA.items.map((item) => {
        const node = screen.getByLabelText(
          `${item.displayName}, ${typeMeta(item.itemType).label}, ${item.health}`,
        );
        return [
          item.fabricId,
          { left: node.style.left, top: node.style.top },
        ];
      }),
    );

    fireEvent.click(screen.getByRole("switch", { name: "Impact mode" }));

    expect(viewport.scrollLeft).toBe(360);
    expect(viewport.scrollTop).toBe(420);
    for (const item of SAMPLE_DATA.items) {
      const node = screen.getByLabelText(
        `${item.displayName}, ${typeMeta(item.itemType).label}, ${item.health}`,
      );
      expect({ left: node.style.left, top: node.style.top }).toEqual(
        before.get(item.fabricId),
      );
    }
    expect(
      screen.getByLabelText("alpinerent_dw, Warehouse, healthy"),
    ).toHaveClass("opacity-[0.14]");
    expect(
      document.querySelector('marker[id="atlas-up"]'),
    ).toHaveAttribute("markerWidth", "7");
  });

  it("does not reorder disconnected components when impact mode is enabled", () => {
    const model = SAMPLE_DATA.items.find(
      (item) => item.itemType === "SemanticModel",
    )!;
    const report = SAMPLE_DATA.items.find((item) => item.itemType === "Report")!;
    const lakehouse = SAMPLE_DATA.items.find(
      (item) => item.itemType === "Lakehouse",
    )!;
    const warehouse = SAMPLE_DATA.items.find(
      (item) => item.itemType === "Warehouse",
    )!;
    const originalEdges = SAMPLE_DATA.edges;
    SAMPLE_DATA.edges = [
      { source: model.fabricId, target: report.fabricId, relation: "report" },
      {
        source: lakehouse.fabricId,
        target: warehouse.fabricId,
        relation: "loads",
      },
    ];
    window.history.replaceState(null, "", "/#map");
    const { container } = render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );
    SAMPLE_DATA.edges = originalEdges;

    fireEvent.click(
      screen.getByLabelText("alpinerent_lakehouse, Lakehouse, healthy"),
    );
    const viewport = container.querySelector<HTMLDivElement>(".atlas-map-grid")!;
    viewport.scrollTop = 500;
    const before = {
      lakehouse: {
        left: screen.getByLabelText(
          "alpinerent_lakehouse, Lakehouse, healthy",
        ).style.left,
        top: screen.getByLabelText(
          "alpinerent_lakehouse, Lakehouse, healthy",
        ).style.top,
      },
      model: {
        left: screen.getByLabelText(
          "AlpineRent Sales Model, Semantic model, healthy",
        ).style.left,
        top: screen.getByLabelText(
          "AlpineRent Sales Model, Semantic model, healthy",
        ).style.top,
      },
    };

    fireEvent.click(screen.getByRole("switch", { name: "Impact mode" }));

    expect(viewport.scrollTop).toBe(500);
    expect({
      left: screen.getByLabelText(
        "alpinerent_lakehouse, Lakehouse, healthy",
      ).style.left,
      top: screen.getByLabelText(
        "alpinerent_lakehouse, Lakehouse, healthy",
      ).style.top,
    }).toEqual(before.lakehouse);
    expect({
      left: screen.getByLabelText(
        "AlpineRent Sales Model, Semantic model, healthy",
      ).style.left,
      top: screen.getByLabelText(
        "AlpineRent Sales Model, Semantic model, healthy",
      ).style.top,
    }).toEqual(before.model);
  });

  it("pans the complete graph by dragging its background", () => {
    window.history.replaceState(null, "", "/#map");
    const { container } = render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );
    const viewport = container.querySelector<HTMLDivElement>(".atlas-map-grid")!;
    viewport.scrollLeft = 120;
    viewport.scrollTop = 80;

    fireEvent.pointerDown(viewport, {
      button: 0,
      pointerId: 17,
      clientX: 200,
      clientY: 160,
    });
    fireEvent.pointerMove(viewport, {
      pointerId: 17,
      clientX: 150,
      clientY: 110,
    });
    fireEvent.pointerUp(viewport, {
      button: 0,
      pointerId: 17,
      clientX: 150,
      clientY: 110,
    });

    expect(viewport.scrollLeft).toBe(170);
    expect(viewport.scrollTop).toBe(130);
    expect(viewport).toHaveClass("cursor-grab");
  });

  it("keeps item nodes compact with visible space between rows and stages", () => {
    window.history.replaceState(null, "", "/#map");
    render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );
    const nodes = SAMPLE_DATA.items
      .map((item) =>
        screen.queryByLabelText(
          `${item.displayName}, ${typeMeta(item.itemType).label}, ${item.health}`,
        ),
      )
      .filter((node): node is HTMLButtonElement => node instanceof HTMLButtonElement);
    expect(nodes.length).toBeGreaterThan(1);
    expect(
      Math.max(...nodes.map((node) => parseFloat(node.style.width))),
    ).toBeLessThanOrEqual(224);

    const byColumn = new Map<number, HTMLButtonElement[]>();
    for (const node of nodes) {
      const left = parseFloat(node.style.left);
      byColumn.set(left, [...(byColumn.get(left) ?? []), node]);
    }
    const columns = [...byColumn.keys()].sort((left, right) => left - right);
    for (let index = 1; index < columns.length; index += 1) {
      const previous = byColumn.get(columns[index - 1])![0];
      expect(
        columns[index] -
          columns[index - 1] -
          parseFloat(previous.style.width),
      ).toBeGreaterThanOrEqual(48);
    }
    for (const column of byColumn.values()) {
      const ordered = column.sort(
        (left, right) => parseFloat(left.style.top) - parseFloat(right.style.top),
      );
      for (let index = 1; index < ordered.length; index += 1) {
        const previous = ordered[index - 1];
        expect(
          parseFloat(ordered[index].style.top) -
            parseFloat(previous.style.top) -
            parseFloat(previous.style.height),
        ).toBeGreaterThanOrEqual(16);
      }
    }
  });

  it("moves selection to a matching item when its type is filtered", () => {
    window.history.replaceState(null, "", "/#map");
    render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );
    const report = SAMPLE_DATA.items.find((item) => item.itemType === "Report")!;
    fireEvent.change(screen.getByLabelText("Filter by item type"), {
      target: { value: "Report" },
    });
    expect(
      screen.queryByLabelText("AlpineRent Sales Model, Semantic model, healthy"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText(`${report.displayName}, Report, ${report.health}`),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Item details inspector")).toHaveTextContent(
      report.displayName,
    );
  });

  it("supports object selection, highlighting and drag", () => {
    window.history.replaceState(null, "", "/#map");
    const { container } = render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "objects" }));
    const table = screen.getByLabelText(
      /rentals_daily_summary, \d+ columns · \d+ measures/i,
    );
    const initialLeft = table.style.left;
    const initialTop = table.style.top;

    fireEvent.pointerDown(table, {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 2,
    });

    fireEvent.pointerMove(table, {
      clientX: 150,
      clientY: 130,
      pointerId: 2,
    });
    fireEvent.pointerUp(table, {
      button: 0,
      clientX: 150,
      clientY: 130,
      pointerId: 2,
    });

    expect(table.style.left).not.toBe(initialLeft);
    expect(table.style.top).not.toBe(initialTop);

    fireEvent.pointerDown(table, {
      button: 0,
      clientX: 150,
      clientY: 130,
      pointerId: 3,
    });
    fireEvent.pointerUp(table, {
      button: 0,
      clientX: 150,
      clientY: 130,
      pointerId: 3,
    });

    expect(table).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelectorAll(".atlas-flow").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("region", {
        name: "Selected object lineage relationships",
      }),
    ).toBeInTheDocument();
  });

  it("refreshes object lineage when a node from another item is selected", () => {
    window.history.replaceState(null, "", "/#map");
    render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "objects" }));
    const report = SAMPLE_DATA.items.find(
      (item) => item.displayName === "AlpineRent Executive Dashboard",
    )!;

    fireEvent.click(
      screen.getByLabelText(
        /AlpineRent Executive Dashboard, 1 object · collapsed/i,
      ),
    );

    expect(
      new URL(window.location.href).searchParams.get("item"),
    ).toBe(report.fabricId);
  });

  it("selects the matching table when the object table filter changes", () => {
    window.history.replaceState(null, "", "/#map");
    render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "objects" }));
    const tableFilter = screen.getByLabelText("Select object lineage table");
    const options = [...tableFilter.querySelectorAll("option")];
    expect(options.length).toBeGreaterThan(1);
    const nextTable = options[1].value;
    fireEvent.click(screen.getByLabelText(/Total Revenue, Measure/i));
    fireEvent.change(tableFilter, { target: { value: nextTable } });
    const selectedTable = screen
      .getAllByLabelText(
        new RegExp(`^${nextTable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},`),
      )
      .find((node) => node.getAttribute("aria-label")?.includes("columns"));
    expect(
      selectedTable,
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("expands and collapses every deep-lineage table", async () => {
    window.history.replaceState(null, "", "/#map");
    render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "objects" }));
    await selectInspectorTab("Summary", "Schema");
    const tableToggles = () =>
      [
        ...screen
          .getByLabelText("Item details inspector")
          .querySelectorAll<HTMLButtonElement>("button[aria-expanded]"),
      ];

    expect(tableToggles().length).toBeGreaterThan(1);
    expect(
      tableToggles().every(
        (button) => button.getAttribute("aria-expanded") === "false",
      ),
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(
      tableToggles().every(
        (button) => button.getAttribute("aria-expanded") === "true",
      ),
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(
      tableToggles().every(
        (button) => button.getAttribute("aria-expanded") === "false",
      ),
    ).toBe(true);
  });

  it("expands and collapses object nodes by Fabric item", () => {
    window.history.replaceState(null, "", "/#map");
    render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "objects" }));
    expect(
      screen.getByLabelText(
        /AlpineRent Executive Dashboard, 1 object · collapsed/i,
      ),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Expand all item groups" }),
    );
    expect(
      screen.getByLabelText("AlpineRent Executive Dashboard, Report"),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Collapse all item groups" }),
    );
    expect(
      screen.getByLabelText(
        /AlpineRent Sales Model, \d+ objects · collapsed/i,
      ),
    ).toBeInTheDocument();
  });

  it("moves a multi-selection together and fully resets positions", () => {
    window.history.replaceState(null, "", "/#map");
    render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );

    const model = screen.getByLabelText(
      "AlpineRent Sales Model, Semantic model, healthy",
    );
    const lakehouse = screen.getByLabelText(
      "alpinerent_lakehouse, Lakehouse, healthy",
    );
    const initial = {
      modelLeft: model.style.left,
      modelTop: model.style.top,
      lakehouseLeft: lakehouse.style.left,
      lakehouseTop: lakehouse.style.top,
    };

    fireEvent.click(lakehouse, { ctrlKey: true });
    fireEvent.pointerDown(lakehouse, {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 4,
    });

    fireEvent.pointerMove(lakehouse, {
      clientX: 150,
      clientY: 140,
      pointerId: 4,
    });
    fireEvent.pointerUp(lakehouse, {
      button: 0,
      clientX: 150,
      clientY: 140,
      pointerId: 4,
    });

    expect(model.style.left).not.toBe(initial.modelLeft);
    expect(model.style.top).not.toBe(initial.modelTop);
    expect(lakehouse.style.left).not.toBe(initial.lakehouseLeft);
    expect(lakehouse.style.top).not.toBe(initial.lakehouseTop);

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(model.style.left).toBe(initial.modelLeft);
    expect(model.style.top).toBe(initial.modelTop);
    expect(lakehouse.style.left).toBe(initial.lakehouseLeft);
    expect(lakehouse.style.top).toBe(initial.lakehouseTop);
  });

  it("keeps widened object nodes inside the canvas bounds", () => {
    window.history.replaceState(null, "", "/#map");
    const { container } = render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "objects" }));
    const nodes = [...container.querySelectorAll<HTMLButtonElement>(".atlas-map-grid button[aria-pressed]")]
      .filter((node) => node.style.width && node.style.left);
    expect(nodes.length).toBeGreaterThan(0);
    for (const node of nodes) {
      const canvas = node.parentElement!;
      expect(parseFloat(node.style.left) + parseFloat(node.style.width))
        .toBeLessThanOrEqual(parseFloat(canvas.style.width));
      expect(parseFloat(node.style.top) + parseFloat(node.style.height))
        .toBeLessThanOrEqual(parseFloat(canvas.style.height));
    }
  });

  it("persists and resets the inspector width for the preview identity and workspace", () => {
    window.history.replaceState(null, "", "/#map");
    render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );

    const separator = screen.getByRole("separator", {
      name: "Resize details inspector",
    });
    fireEvent.keyDown(separator, { key: "ArrowLeft" });

    const key = displayPreferenceKey(
      "preview-user",
      SAMPLE_DATA.workspace.fabricId,
      "map-inspector-width",
    );
    expect(localStorage.getItem(key)).toBe(
      JSON.stringify(MAP_INSPECTOR_DEFAULT_WIDTH + 16),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Reset inspector width" }),
    );
    expect(localStorage.getItem(key)).toBe(
      JSON.stringify(MAP_INSPECTOR_DEFAULT_WIDTH),
    );
  });

  it("surfaces an invalid saved inspector preference", () => {
    window.history.replaceState(null, "", "/#map");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    localStorage.setItem(
      displayPreferenceKey(
        "preview-user",
        SAMPLE_DATA.workspace.fabricId,
        "map-inspector-width",
      ),
      JSON.stringify(100),
    );

    render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "saved display setting could not be loaded",
    );
  });

  it("distinguishes documented ownership from owner permission", async () => {
    window.history.replaceState(null, "", "/#map");
    render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );

    expect(screen.getByText("Documented owner")).toBeInTheDocument();
    await selectInspectorTab("Summary", "Schema");
    await selectInspectorTab("Schema", "Access");
    expect(
      await screen.findByText(
        /owner permission is an access role and is separate from documented ownership/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Owner permission").length).toBeGreaterThan(0);
  });

  it("keeps schema groups collapsed until a search is active", async () => {
    window.history.replaceState(null, "", "/#map");
    render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );

    await selectInspectorTab("Summary", "Schema");
    const table = await screen.findByRole("button", {
      name: /rentals_daily_summary/i,
    });
    expect(table).toHaveAttribute("aria-expanded", "false");

    fireEvent.change(screen.getByLabelText("Search lineage"), {
      target: { value: "rentals" },
    });
    expect(table).toHaveAttribute("aria-expanded", "true");
  });
});
