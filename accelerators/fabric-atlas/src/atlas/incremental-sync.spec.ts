import { describe, expect, it } from "vitest";
import type { RawSync } from "./live-sync";
import { applyReusedEnrichment, parseSyncPlanSummary, planIncrementalSync, syncPlanSummary } from "./incremental-sync";

const day1 = "2026-01-01T00:00:00Z";
const day2 = "2026-01-02T00:00:00Z";

describe("incremental synchronization plan", () => {
  it("reuses only items whose modification date is known and unchanged", () => {
    const plan = planIncrementalSync({
      generation: 2,
      previous: { generation: 2, items: [{ id: "a", modifiedAt: day1 }, { id: "b", modifiedAt: day1 }, { id: "c" }] },
      current: [{ id: "a", modifiedAt: day1 }, { id: "b", modifiedAt: day2 }, { id: "c" }, { id: "d", modifiedAt: day1 }],
    });
    expect(plan).toEqual({ mode: "incremental", reuse: ["a"], refresh: ["b", "c", "d"] });
  });

  it("forces a full run without a previous snapshot, after a generation change or without dates", () => {
    const current = [{ id: "a", modifiedAt: day1 }];
    expect(planIncrementalSync({ generation: 2, current }).reason).toBe("no-previous-snapshot");
    expect(planIncrementalSync({ generation: 3, current, previous: { generation: 2, items: current } }))
      .toMatchObject({ mode: "full", refresh: ["a"], reason: "generation-changed" });
    expect(planIncrementalSync({ generation: 2, current: [{ id: "a" }], previous: { generation: 2, items: [{ id: "a" }] } }))
      .toMatchObject({ mode: "full", reason: "no-modified-date" });
  });

  it("produces the same snapshot as a full run for unchanged items", () => {
    const full: RawSync = {
      items: [{ id: "a" }, { id: "b" }],
      schema: { a: [{ name: "t1", columns: [] }], b: [{ name: "t2", columns: [] }] } as RawSync["schema"],
      artifactMetadata: { a: { kind: "x" }, b: { kind: "y" } },
      config: [{ itemId: "a", label: "k", value: "1" }, { itemId: "b", label: "k", value: "2" }],
    };
    const freshB: RawSync = {
      items: full.items,
      schema: { b: full.schema!.b } as RawSync["schema"],
      artifactMetadata: { b: { kind: "y" } },
      config: [{ itemId: "b", label: "k", value: "2" }],
    };
    const merged = applyReusedEnrichment(freshB, full, ["a"]);
    expect(merged.schema).toEqual(full.schema);
    expect(merged.artifactMetadata).toEqual(full.artifactMetadata);
    expect([...merged.config!].sort((l, r) => String(l.itemId).localeCompare(String(r.itemId)))).toEqual(full.config);
  });

  it("keeps object-level edges of reused items so catalog object ids stay stable", () => {
    const edge = (itemId: string, table: string, column: string) => ({
      source: { itemId, kind: "sourceObject", id: `fabric-object://${itemId}/kql-table/${table}`, name: table, tableName: table },
      target: { itemId, kind: "sourceField", id: `fabric-object://${itemId}/kql-table/${table}.${column}`, name: column, tableName: table },
      relation: "contains", confidence: "verified",
    });
    const full: RawSync = { items: [{ id: "kql" }, { id: "b" }], objectEdges: [edge("kql", "T", "c1"), edge("b", "U", "c2")] };
    const fresh: RawSync = { items: full.items, objectEdges: [edge("b", "U", "c2")] };
    const merged = applyReusedEnrichment(fresh, full, ["kql"]);
    expect(merged.objectEdges).toEqual([edge("b", "U", "c2"), edge("kql", "T", "c1")]);
    expect(applyReusedEnrichment({ ...fresh, objectEdges: [] }, full, ["kql"]).objectEdges).toEqual([edge("kql", "T", "c1")]);
  });

  it("round-trips the mode and counters recorded on the SyncRun summary", () => {
    const summary = `14 items · Collectors: Rayfin active; ${syncPlanSummary({ mode: "incremental", refresh: ["a"], reuse: ["b", "c"] })}`;
    expect(parseSyncPlanSummary(summary)).toEqual({ mode: "incremental", refreshed: 1, reused: 2 });
    expect(parseSyncPlanSummary("14 items")).toBeUndefined();
  });
});
