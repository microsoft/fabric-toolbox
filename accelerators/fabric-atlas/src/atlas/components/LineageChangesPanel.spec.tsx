import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildAtlasHistory, type AtlasHistory } from "../history";
import { fixtureItem, fixtureSnapshot } from "@/test/snapshot-fixtures";

const store = vi.hoisted(() => ({
  value: {} as {
    history: AtlasHistory;
    historyLoading: boolean;
    historyError?: string;
    historyFailedSnapshotIds: Set<string>;
    loadHistorySnapshot: (id: string) => Promise<void>;
  },
}));

vi.mock("../store", () => ({ useAtlas: () => store.value }));

import { LineageChangesPanel } from "./LineageChangesPanel";

const LAKEHOUSE = "aaaaaaaa-0000-4000-8000-000000000001";
const MODEL = "aaaaaaaa-0000-4000-8000-000000000002";
const REPORT = "aaaaaaaa-0000-4000-8000-000000000003";
const NOTEBOOK = "aaaaaaaa-0000-4000-8000-000000000004";

const older = fixtureSnapshot("older", "2026-09-01T08:00:00.000Z", {
  items: [
    fixtureItem(LAKEHOUSE, "Lakehouse", "Sales lakehouse"),
    fixtureItem(MODEL, "SemanticModel", "Sales model"),
    fixtureItem(NOTEBOOK, "Notebook", "Load"),
  ],
  edges: [
    { source: LAKEHOUSE, target: MODEL, relation: "Direct Lake" },
    { source: NOTEBOOK, target: LAKEHOUSE, relation: "writes" },
  ],
  schema: {
    [MODEL]: [{ name: "Sales", columns: [{ name: "Amount", dataType: "decimal" }], measures: [] }],
  },
});
const newer = fixtureSnapshot("newer", "2026-10-01T08:00:00.000Z", {
  items: [
    fixtureItem(LAKEHOUSE, "Lakehouse", "Sales lakehouse"),
    fixtureItem(MODEL, "SemanticModel", "Sales model", { health: "failing" }),
    fixtureItem(REPORT, "Report", "Sales report"),
  ],
  edges: [
    { source: LAKEHOUSE, target: MODEL, relation: "Direct Lake" },
    { source: MODEL, target: REPORT, relation: "binds" },
  ],
  schema: { [MODEL]: [{ name: "Sales", columns: [], measures: [] }] },
});

function setHistory(snapshots = [older, newer]) {
  store.value = {
    history: buildAtlasHistory(snapshots),
    historyLoading: false,
    historyFailedSnapshotIds: new Set(),
    loadHistorySnapshot: vi.fn(async () => undefined),
  };
}

describe("LineageChangesPanel", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/#map");
    setHistory();
  });

  it("compares the two newest snapshots on a stable union graph", () => {
    render(<LineageChangesPanel previewIncluded={false} />);

    const graph = screen.getByLabelText("Load, Notebook, Removed");
    const position = { left: graph.style.left, top: graph.style.top };
    expect(screen.getByLabelText("Sales report, Report, Added")).toBeInTheDocument();
    expect(screen.getByLabelText("Sales model, Semantic model, Changed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /^After/ }));

    expect(screen.queryByLabelText("Load, Notebook, Removed")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /^Before/ }));
    const ghost = screen.getByLabelText("Load, Notebook, Removed");
    expect({ left: ghost.style.left, top: ghost.style.top }).toEqual(position);
  });

  it("keeps removed items inspectable and links to the exact Change Center comparison", () => {
    render(<LineageChangesPanel previewIncluded={false} />);

    fireEvent.click(screen.getByLabelText("Load, Notebook, Removed"));

    const inspector = screen.getByRole("complementary", { name: "Time machine inspector" });
    expect(inspector).toHaveTextContent("Removed");
    expect(within(inspector).getByRole("row", { name: /Type Notebook/ })).toBeInTheDocument();
    const link = within(inspector).getByRole("link", { name: "Open in Change Center" });
    const url = new URL(link.getAttribute("href")!, "https://atlas.test");
    expect(url.hash).toBe("#governance");
    expect(url.searchParams.get("governance.baseline")).toBe("older");
    expect(url.searchParams.get("governance.current")).toBe("newer");
    expect(url.searchParams.get("governance.changeq")).toBe("Load");
    expect(new URL(window.location.href).searchParams.get("tm.item")).toBe(NOTEBOOK);
  });

  it("restores deep-linked snapshots, section and selection", async () => {
    window.history.replaceState(
      null,
      "",
      "/?tm.from=older&tm.to=newer&tm.section=breaking#map",
    );
    render(<LineageChangesPanel previewIncluded={false} />);

    const table = screen.getByRole("table", { name: "Breaking-change candidates" });
    expect(
      within(table).getAllByRole("columnheader").map((header) => header.textContent),
    ).toEqual(["Severity", "Change", "Owner", "Downstream", "Open"]);
    expect(within(table).getByText("Column removed: Sales.Amount")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(table).getByText("Column removed: Sales.Amount"));
    });
    expect(
      screen.getByRole("complementary", { name: "Breaking change evidence" }),
    ).toHaveTextContent("Report visual field usage is not exposed");
    expect(new URL(window.location.href).searchParams.get("tm.from")).toBe("older");
  });

  it("loads missing snapshots and reports unavailable history", () => {
    const loadHistorySnapshot = vi.fn(async () => undefined);
    store.value = {
      history: buildAtlasHistory([newer], buildAtlasHistory([older, newer]).summaries),
      historyLoading: false,
      historyFailedSnapshotIds: new Set(),
      loadHistorySnapshot,
    };
    const { rerender } = render(<LineageChangesPanel previewIncluded={false} />);

    expect(screen.getByText("Loading snapshot history…")).toBeInTheDocument();
    expect(loadHistorySnapshot).toHaveBeenCalledWith("older");

    store.value = { ...store.value, historyFailedSnapshotIds: new Set(["older"]) };
    rerender(<LineageChangesPanel previewIncluded={false} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "A snapshot needed for this comparison could not be loaded",
    );
  });

  it("asks for a second snapshot when only one is retained", () => {
    setHistory([newer]);
    render(<LineageChangesPanel previewIncluded />);

    expect(
      screen.getByText("Lineage changes appear after a second synchronized snapshot."),
    ).toBeInTheDocument();
    expect(screen.getByText("Item Relations changes are not tracked.")).toBeInTheDocument();
  });
});
