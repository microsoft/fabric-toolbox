import { describe, expect, it } from "vitest";
import { snapshotFromData, type HistoricalSnapshot } from "./history";
import type { AtlasData, Item, Job } from "./model";
import { buildSyncBrief, syncBriefMarkdown } from "./sync-brief";

function item(fabricId: string, overrides: Partial<Item> = {}): Item {
  return {
    fabricId,
    displayName: fabricId,
    itemType: "Lakehouse",
    health: "healthy",
    endorsement: "none",
    tags: [],
    ...overrides,
  };
}

function job(status: Job["status"]): Job {
  return {
    itemFabricId: "pipe",
    itemName: "pipe",
    jobType: "Pipeline",
    status,
    startedAt: "2026-08-28T09:00:00.000Z",
    durationSec: 10,
  };
}

function data(overrides: Partial<AtlasData> = {}): AtlasData {
  return {
    workspace: { fabricId: "ws", displayName: "WS", capacity: "F2", region: "West Europe" },
    items: [],
    edges: [],
    principals: [],
    grants: [],
    jobs: [],
    config: [],
    comments: [],
    syncRuns: [],
    schema: {},
    ...overrides,
  };
}

function snap(id: string, value: AtlasData): HistoricalSnapshot {
  return snapshotFromData(value, id, id === "old" ? "2026-08-28T10:00:00.000Z" : "2026-08-29T10:00:00.000Z");
}

function sectionOf(brief: ReturnType<typeof buildSyncBrief>, id: string) {
  return brief.sections.find((entry) => entry.id === id)!;
}

describe("sync brief", () => {
  it("reports a baseline for the first snapshot", () => {
    const current = snap("new", data({ items: [item("lake")] }));
    const brief = buildSyncBrief(undefined, current);
    expect(brief.state).toBe("first-snapshot");
    expect(syncBriefMarkdown(brief)).toContain("first validated snapshot");
    expect(buildSyncBrief(undefined, undefined).state).toBe("no-snapshot");
  });

  it("shows no monitored changes for identical snapshots", () => {
    const value = data({ items: [item("lake")], jobs: [job("completed")] });
    const brief = buildSyncBrief(snap("old", value), snap("new", value));
    expect(brief.state).toBe("no-changes");
    expect(brief.totalEntries).toBe(0);
    expect(syncBriefMarkdown(brief)).toContain("No monitored changes.");
  });

  it("lists removed objects without a navigation target and added items with one", () => {
    const brief = buildSyncBrief(
      snap("old", data({ items: [item("gone")] })),
      snap("new", data({ items: [item("fresh")] })),
    );
    const items = sectionOf(brief, "items").entries;
    expect(items.map((entry) => [entry.title, entry.detail])).toEqual([
      ["fresh", "Added"],
      ["gone", "Removed"],
    ]);
    expect(items.find((entry) => entry.title === "gone")?.link).toBeUndefined();
    expect(items.find((entry) => entry.title === "fresh")?.link).toEqual({ kind: "item", itemId: "fresh" });
  });

  it("marks missing schema and job metadata as unavailable, not zero", () => {
    const previous = snap("old", data({ items: [item("lake")], schema: { lake: [{ name: "t", columns: [], measures: [] }] } }));
    const current = snap("new", data({ items: [item("lake"), item("more")], schema: undefined }));
    const brief = buildSyncBrief(previous, current);
    expect(sectionOf(brief, "schema").status).toBe("unavailable");
    expect(sectionOf(brief, "jobs").status).toBe("unavailable");
    expect(brief.tenantSettings).toBe("unavailable");
    expect(syncBriefMarkdown(brief)).toContain("Unavailable — Schema metadata");
  });

  it("separates new high-priority findings from pre-existing ones", () => {
    const certified = { endorsement: "certified" as const, sensitivityMetadataAvailable: true };
    const brief = buildSyncBrief(
      snap("old", data({ items: [item("a", certified)] })),
      snap("new", data({ items: [item("a", certified), item("b", certified)] })),
    );
    const findings = sectionOf(brief, "findings").entries;
    expect(findings.some((entry) => entry.title.includes(": b"))).toBe(true);
    expect(findings.some((entry) => entry.title.includes(": a"))).toBe(false);
    expect(brief.preExistingHighFindings).toBeGreaterThanOrEqual(1);
  });

  it("flags elevated access, failed or recovered jobs and downstream impact", () => {
    const edges = [
      { source: "src", target: "mid", relation: "feeds" },
      { source: "mid", target: "end", relation: "feeds" },
    ];
    const items = [item("src"), item("mid"), item("end"), item("pipe", { itemType: "DataPipeline" })];
    const brief = buildSyncBrief(
      snap("old", data({
        items,
        edges,
        jobs: [job("failed")],
        grants: [{ itemFabricId: "src", principalRef: "bob", accessLevel: "view", source: "directShare" }],
      })),
      snap("new", data({
        items,
        edges,
        jobs: [job("completed")],
        grants: [
          { itemFabricId: "src", principalRef: "bob", accessLevel: "edit", source: "directShare" },
          { itemFabricId: "src", principalRef: "guest", accessLevel: "view", source: "directShare", flag: "external" },
        ],
      })),
    );
    expect(sectionOf(brief, "access").entries.map((entry) => entry.title).sort()).toEqual(["bob", "guest"]);
    expect(sectionOf(brief, "jobs").entries[0]?.detail).toBe("Recovered");
    expect(sectionOf(brief, "impact").entries[0]).toMatchObject({ title: "src", detail: "2 downstream items" });
  });
});
