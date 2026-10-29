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

  it("opens the graph at 80% zoom and returns there on reset", () => {
    window.history.replaceState(null, "", "/#map");
    render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );

    const lakehouse = screen.getByLabelText(
      "alpinerent_lakehouse, Lakehouse, healthy",
    );
    const position = { left: lakehouse.style.left, top: lakehouse.style.top };
    expect(screen.getByText("80%")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByText("90%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(screen.getByText("70%")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText("80%")).toBeInTheDocument();
    const reset = screen.getByLabelText(
      "alpinerent_lakehouse, Lakehouse, healthy",
    );
    expect(reset.style.left).toBe(position.left);
    expect(reset.style.top).toBe(position.top);
    expect(document.querySelectorAll("button[aria-pressed='true']")).toHaveLength(0);
    expect(new URL(window.location.href).searchParams.has("item")).toBe(false);
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

  it.each([
    ["Atlas", "/#map"],
    ["Item Relations Preview", "/?preview=item-relations#map"],
  ])("keeps the %s viewport fixed when an item is selected", async (_source, url) => {
    window.history.replaceState(null, "", url);
    const { container } = render(
      <AtlasProvider isPreview>
        <MapView itemRelationsEnabled />
      </AtlasProvider>,
    );
    const viewport = container.querySelector<HTMLDivElement>(".atlas-map-grid")!;
    viewport.scrollLeft = 140;
    viewport.scrollTop = 180;
    const node = screen.getByLabelText(
      "alpinerent_lakehouse, Lakehouse, healthy",
    );

    expect(fireEvent.mouseDown(node, {
      button: 0,
      clientX: 320,
      clientY: 240,
    })).toBe(false);
    fireEvent.pointerDown(node, {
      button: 0,
      pointerId: 81,
      clientX: 320,
      clientY: 240,
    });
    fireEvent.pointerUp(node, {
      button: 0,
      pointerId: 81,
      clientX: 320,
      clientY: 240,
    });
    fireEvent.click(node);
    await act(async () => {
      await new Promise<void>((resolve) =>
        window.requestAnimationFrame(() => resolve()),
      );
    });

    expect(viewport.scrollLeft).toBe(140);
    expect(viewport.scrollTop).toBe(180);
  });

  it("keeps the selected item position and viewport fixed when Impact mode is enabled", async () => {
    window.history.replaceState(null, "", "/#map");
    const { container } = render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );
    const viewport = container.querySelector<HTMLDivElement>(".atlas-map-grid")!;
    viewport.scrollLeft = 140;
    viewport.scrollTop = 180;
    fireEvent.click(
      screen.getByLabelText("04_demand_forecast, Notebook, healthy"),
    );
    await act(async () => {
      await new Promise<void>((resolve) =>
        window.requestAnimationFrame(() => resolve()),
      );
    });
    const selected = screen.getByLabelText(
      "04_demand_forecast, Notebook, healthy",
    );
    const position = { left: selected.style.left, top: selected.style.top };

    fireEvent.click(screen.getByRole("switch", { name: "Impact mode" }));
    await act(async () => {
      await new Promise<void>((resolve) =>
        window.requestAnimationFrame(() => resolve()),
      );
    });

    const impacted = screen.getByLabelText(
      "04_demand_forecast, Notebook, healthy",
    );
    expect({ left: impacted.style.left, top: impacted.style.top }).toEqual(
      position,
    );
    expect(viewport.scrollLeft).toBe(140);
    expect(viewport.scrollTop).toBe(180);
  });

  it("shows only the selected impact subgraph", () => {
    window.history.replaceState(null, "", "/#map");
    const { container } = render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );
    fireEvent.click(
      screen.getByLabelText("alpinerent_lakehouse, Lakehouse, healthy"),
    );
    fireEvent.click(screen.getByRole("switch", { name: "Impact mode" }));

    expect(
      screen.queryByLabelText("alpinerent_dw, Warehouse, healthy"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("alpinerent_lakehouse, Lakehouse, healthy"),
    ).toBeVisible();
    expect(
      container.querySelectorAll("button[aria-pressed]").length,
    ).toBeLessThan(SAMPLE_DATA.items.length);
    expect(
      document.querySelector('marker[id="atlas-up"]'),
    ).toHaveAttribute("markerWidth", "7");
    expect(
      document.querySelector('marker[id="atlas-up"] path'),
    ).toHaveAttribute("fill", "none");
  });

  it("hides disconnected components when impact mode is enabled", () => {
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
    render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );
    SAMPLE_DATA.edges = originalEdges;

    fireEvent.click(
      screen.getByLabelText("alpinerent_lakehouse, Lakehouse, healthy"),
    );
    fireEvent.click(screen.getByRole("switch", { name: "Impact mode" }));

    expect(
      screen.getByLabelText("alpinerent_lakehouse, Lakehouse, healthy"),
    ).toBeVisible();
    expect(
      screen.getByLabelText("alpinerent_dw, Warehouse, healthy"),
    ).toBeVisible();
    expect(
      screen.queryByLabelText(
        "AlpineRent Sales Model, Semantic model, healthy",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("AlpineRent Executive Report, Report, healthy"),
    ).not.toBeInTheDocument();
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

  it("keeps connected lineage context when selection moves to a filtered item type", () => {
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
      screen.getByLabelText("AlpineRent Sales Model, Semantic model, healthy"),
    ).toBeVisible();
    expect(
      screen.getByLabelText(`${report.displayName}, Report, ${report.health}`),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Item details inspector")).toHaveTextContent(
      report.displayName,
    );
  });

  it("shows every verified notebook object dependency after switching to Object lineage", () => {
    const notebook = SAMPLE_DATA.items.find(
      (item) => item.displayName === "02_silver_transform",
    )!;
    const lakehouse = SAMPLE_DATA.items.find(
      (item) => item.itemType === "Lakehouse",
    )!;
    const originalObjectEdges = SAMPLE_DATA.objectEdges;
    SAMPLE_DATA.objectEdges = [
      {
        source: {
          itemId: lakehouse.fabricId,
          kind: "sourceObject",
          id: "bronze.rentals_raw",
          name: "bronze.rentals_raw",
          tableName: "bronze.rentals_raw",
        },
        target: {
          itemId: notebook.fabricId,
          kind: "notebookObject",
          id: "bronze.rentals_raw",
          name: "bronze.rentals_raw",
          tableName: "bronze.rentals_raw",
        },
        relation: "reads",
        confidence: "verified",
      },
      {
        source: {
          itemId: notebook.fabricId,
          kind: "notebookObject",
          id: "silver.rentals_clean",
          name: "silver.rentals_clean",
          tableName: "silver.rentals_clean",
        },
        target: {
          itemId: lakehouse.fabricId,
          kind: "sourceObject",
          id: "silver.rentals_clean",
          name: "silver.rentals_clean",
          tableName: "silver.rentals_clean",
        },
        relation: "writes",
        confidence: "verified",
      },
    ];
    window.history.replaceState(null, "", "/#map");
    render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );
    SAMPLE_DATA.objectEdges = originalObjectEdges;

    fireEvent.click(
      screen.getByLabelText("02_silver_transform, Notebook, healthy"),
    );
    fireEvent.click(screen.getByRole("button", { name: "objects" }));

    expect(
      screen.getByLabelText(
        /bronze\.rentals_raw, Notebook object reference/,
      ),
    ).toBeVisible();
    expect(
      screen.getByLabelText(
        /silver\.rentals_clean, Notebook object reference/,
      ),
    ).toBeVisible();
    expect(screen.getByText(/Verified object metadata is shown/)).toBeVisible();
  });

  it("falls back to item lineage when a notebook has no static object references", () => {
    const originalObjectEdges = SAMPLE_DATA.objectEdges;
    SAMPLE_DATA.objectEdges = [];
    window.history.replaceState(null, "", "/#map");
    render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );
    SAMPLE_DATA.objectEdges = originalObjectEdges;

    fireEvent.click(
      screen.getByLabelText("02_silver_transform, Notebook, healthy"),
    );
    fireEvent.click(screen.getByRole("button", { name: "objects" }));

    expect(
      screen.getByLabelText(/AlpineRent Daily Load, 1 object · collapsed/),
    ).toBeVisible();
    expect(
      screen.getByLabelText(/alpinerent_lakehouse, 1 object · collapsed/),
    ).toBeVisible();
    expect(
      screen.getByText(
        "No direct notebook object references were resolved. Showing verified item-level dependencies.",
      ),
    ).toBeVisible();
  });

  it("reveals and selects Semantic Model fields without implicit table focus", async () => {
    window.history.replaceState(null, "", "/#map");
    render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "objects" }));
    expect(
      screen.queryByRole("region", {
        name: "rentals_daily_summary fields",
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Expand rentals_daily_summary",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Total Revenue" }),
    );

    expect(
      screen.getByRole("button", { name: "Total Revenue" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Open in X-Ray" })).toBeInTheDocument();
    await waitFor(() =>
      expect(
        new URL(window.location.href).searchParams.get("object"),
      ).toContain("total revenue"),
    );
  });

  it("opens item lineage when an item-level consumer is selected", () => {
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
      screen.getByRole("button", {
        name: /AlpineRent Executive Dashboard.*Report/i,
      }),
    );

    expect(
      screen.getByRole("button", {
        name: "items",
      }),
    ).toHaveAttribute("aria-current", "true");
    expect(
      new URL(window.location.href).searchParams.get("item"),
    ).toBe(report.fabricId);
  });

  it("searches the complete Semantic Model inventory", () => {
    window.history.replaceState(null, "", "/#map");
    render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "objects" }));
    fireEvent.change(screen.getByLabelText("Search lineage"), {
      target: { value: "Total Station Revenue" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: /Total Station Revenue.*station_utilization/i,
      }),
    );

    expect(
      screen.getByRole("region", {
        name: "station_utilization fields",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Total Station Revenue" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("uses the Semantic Model path even when metadata object edges exist", () => {
    const previous = SAMPLE_DATA.objectEdges;
    const model = SAMPLE_DATA.items.find((item) => item.itemType === "SemanticModel")!;
    const lakehouse = SAMPLE_DATA.items.find((item) => item.itemType === "Lakehouse")!;
    SAMPLE_DATA.objectEdges = [{
      source: { itemId: lakehouse.fabricId, kind: "sourceObject", id: "ExternalOnly", name: "ExternalOnly", tableName: "ExternalOnly" },
      target: { itemId: model.fabricId, kind: "sourceObject", id: "ExternalOnly", name: "ExternalOnly", tableName: "ExternalOnly" },
      relation: "binds source", confidence: "verified",
    }];
    try {
      window.history.replaceState(null, "", "/#map");
      render(<AtlasProvider isPreview><MapView /></AtlasProvider>);
      fireEvent.click(screen.getByRole("button", { name: "objects" }));
      expect(screen.getByText("Whole-model search · bounded multi-table view")).toBeInTheDocument();
      expect(screen.queryByLabelText("Filter object lineage by source item")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Filter object lineage by object kind")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", {
          name: "Expand rentals_daily_summary",
        }),
      ).toBeInTheDocument();
    } finally {
      SAMPLE_DATA.objectEdges = previous;
    }
  });

  it("expands a bounded set of tables and clears the object view", () => {
    window.history.replaceState(null, "", "/#map");
    render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "objects" }));
    expect(
      screen.queryAllByRole("region", { name: / fields$/i }),
    ).toHaveLength(0);

    fireEvent.click(
      screen.getByRole("button", { name: "Expand up to 8 tables" }),
    );
    expect(
      screen.getAllByRole("region", { name: / fields$/i }).length,
    ).toBeGreaterThan(1);

    fireEvent.click(
      screen.getByRole("button", { name: "Clear object view" }),
    );
    expect(
      screen.queryAllByRole("region", { name: / fields$/i }),
    ).toHaveLength(0);
  });

  it("cross-navigates between Object Lineage and X-Ray", () => {
    window.history.replaceState(null, "", "/#map");
    render(
      <AtlasProvider isPreview>
        <MapView />
      </AtlasProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "objects" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Expand rentals_daily_summary",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Total Revenue" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Open in X-Ray" }),
    );

    expect(
      screen.getByRole("heading", { name: "Semantic model X-Ray" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Total Revenue" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Open in Object Lineage" }),
    );
    expect(
      screen.getByRole("button", { name: "Total Revenue" }),
    ).toHaveAttribute("aria-pressed", "true");
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
