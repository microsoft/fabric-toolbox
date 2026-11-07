import { describe, expect, it } from "vitest";
import {
  buildLineageTimeMachine,
  edgeInView,
  nodeVisibleIn,
} from "./lineage-time-machine";
import { fixtureItem, fixtureSnapshot } from "@/test/snapshot-fixtures";

const LAKEHOUSE = "aaaaaaaa-0000-4000-8000-000000000001";
const MODEL = "aaaaaaaa-0000-4000-8000-000000000002";
const REPORT = "aaaaaaaa-0000-4000-8000-000000000003";
const NOTEBOOK = "aaaaaaaa-0000-4000-8000-000000000004";
const WAREHOUSE = "aaaaaaaa-0000-4000-8000-000000000005";
const DASHBOARD = "aaaaaaaa-0000-4000-8000-000000000006";

const before = fixtureSnapshot("old", "2026-09-01T08:00:00.000Z", {
  items: [
    fixtureItem(LAKEHOUSE, "Lakehouse", "Sales lakehouse"),
    fixtureItem(MODEL, "SemanticModel", "Sales model", { ownerName: "Ana" }),
    fixtureItem(REPORT, "Report", "Sales report"),
    fixtureItem(NOTEBOOK, "Notebook", "Load"),
    fixtureItem(WAREHOUSE, "Warehouse", "Finance warehouse"),
  ],
  edges: [
    { source: LAKEHOUSE, target: MODEL, relation: "Direct Lake" },
    { source: MODEL, target: REPORT, relation: "binds" },
    { source: NOTEBOOK, target: LAKEHOUSE, relation: "writes" },
    { source: NOTEBOOK, target: WAREHOUSE, relation: "writes" },
  ],
});

const after = fixtureSnapshot("new", "2026-10-01T08:00:00.000Z", {
  items: [
    fixtureItem(LAKEHOUSE, "Lakehouse", "Sales lakehouse"),
    fixtureItem(MODEL, "SemanticModel", "Sales model", {
      ownerName: "Ben",
      health: "failing",
    }),
    fixtureItem(REPORT, "Report", "Sales report"),
    fixtureItem(WAREHOUSE, "Warehouse", "Finance warehouse"),
    fixtureItem(DASHBOARD, "Dashboard", "Sales dashboard"),
  ],
  edges: [
    { source: LAKEHOUSE, target: MODEL, relation: "reads" },
    { source: MODEL, target: REPORT, relation: "binds", broken: true },
    { source: WAREHOUSE, target: LAKEHOUSE, relation: "shortcut" },
    { source: REPORT, target: DASHBOARD, relation: "dashboard report" },
  ],
});

describe("lineage time machine", () => {
  const machine = buildLineageTimeMachine(before, after);
  const node = (id: string) => machine.nodes.find((entry) => entry.id === id)!;

  it("classifies retained, added, removed and changed items", () => {
    expect(node(LAKEHOUSE).state).toBe("retained");
    expect(node(DASHBOARD).state).toBe("added");
    expect(node(NOTEBOOK)).toMatchObject({
      state: "removed",
      item: { displayName: "Load" },
      after: undefined,
    });
    expect(node(MODEL)).toMatchObject({
      state: "changed",
      changedFields: ["health", "ownerName"],
    });
    expect(machine.counts.nodes).toEqual({
      retained: 3,
      added: 1,
      removed: 1,
      changed: 1,
    });
  });

  it("detects relation changes, broken-state changes, reversals, additions and removals", () => {
    const states = machine.edges.map((edge) => [
      edge.state,
      edge.before?.source ?? "",
      edge.before?.target ?? "",
      edge.after?.source ?? "",
      edge.after?.target ?? "",
    ]);

    expect(states).toEqual(
      expect.arrayContaining([
        ["changed", LAKEHOUSE, MODEL, LAKEHOUSE, MODEL],
        ["changed", MODEL, REPORT, MODEL, REPORT],
        ["removed", NOTEBOOK, LAKEHOUSE, "", ""],
        ["removed", NOTEBOOK, WAREHOUSE, "", ""],
        ["added", "", "", REPORT, DASHBOARD],
        ["added", "", "", WAREHOUSE, LAKEHOUSE],
      ]),
    );
    expect(machine.counts.edges).toMatchObject({ changed: 2, removed: 2, added: 2 });
  });

  it("pairs a reversed relationship instead of reporting a removal and an addition", () => {
    const reversed = buildLineageTimeMachine(
      fixtureSnapshot("a", "2026-09-01T08:00:00.000Z", {
        items: before.catalog.items,
        edges: [{ source: LAKEHOUSE, target: WAREHOUSE, relation: "shortcut" }],
      }),
      fixtureSnapshot("b", "2026-10-01T08:00:00.000Z", {
        items: before.catalog.items,
        edges: [{ source: WAREHOUSE, target: LAKEHOUSE, relation: "shortcut" }],
      }),
    );

    expect(reversed.edges.map((edge) => edge.state)).toEqual(["reversed"]);
    expect(edgeInView(reversed.edges[0], "before")).toMatchObject({
      source: LAKEHOUSE,
      target: WAREHOUSE,
    });
    expect(edgeInView(reversed.edges[0], "after")).toMatchObject({
      source: WAREHOUSE,
      target: LAKEHOUSE,
    });
  });

  it("lays out the union once so every view keeps the same positions", () => {
    expect([...machine.layout.positions.keys()].sort()).toEqual(
      machine.nodes.map((entry) => entry.id).sort(),
    );
    const again = buildLineageTimeMachine(before, after);
    expect([...again.layout.positions.entries()]).toEqual([
      ...machine.layout.positions.entries(),
    ]);
    expect(nodeVisibleIn(node(NOTEBOOK), "before")).toBe(true);
    expect(nodeVisibleIn(node(NOTEBOOK), "after")).toBe(false);
    expect(nodeVisibleIn(node(DASHBOARD), "before")).toBe(false);
    expect(nodeVisibleIn(node(DASHBOARD), "changes")).toBe(true);
  });

  it("keeps removed items inspectable with their historical values", () => {
    expect(node(NOTEBOOK).before).toMatchObject({
      fabricId: NOTEBOOK,
      itemType: "Notebook",
      displayName: "Load",
    });
  });
});
