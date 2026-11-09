import { describe, expect, it } from "vitest";
import {
  incidentBriefMarkdown,
  incidentBriefSection,
  incidentWatchEvents,
} from "./incident-feeds";
import type { AtlasData, Edge, Item, Job } from "./model";
import { diffIncidents } from "./observability";

const WORKSPACE = "6bf4c521-7412-4e6b-8867-68253bbfb18a";
const NOTEBOOK = "20000000-0000-4000-8000-000000000002";
const LAKEHOUSE = "20000000-0000-4000-8000-000000000001";
const MODEL = "20000000-0000-4000-8000-000000000003";
const REPORT = "20000000-0000-4000-8000-000000000004";

const items = [
  { fabricId: NOTEBOOK, displayName: "Load sales", itemType: "Notebook" },
  { fabricId: LAKEHOUSE, displayName: "Sales lakehouse", itemType: "Lakehouse" },
  { fabricId: MODEL, displayName: "Sales model", itemType: "SemanticModel" },
  { fabricId: REPORT, displayName: "Sales report", itemType: "Report" },
] as Item[];
const edges: Edge[] = [
  { source: NOTEBOOK, target: LAKEHOUSE, relation: "writes" },
  { source: LAKEHOUSE, target: MODEL, relation: "feeds" },
  { source: MODEL, target: REPORT, relation: "binds" },
];

function job(itemFabricId: string, status: Job["status"], startedAt: string, jobType = "Refresh"): Job {
  return { itemFabricId, itemName: "fallback", jobType, status, startedAt, durationSec: 30 };
}

function snapshot(jobs: Job[]): Pick<AtlasData, "workspace" | "items" | "edges" | "jobs"> {
  return {
    workspace: { fabricId: WORKSPACE, displayName: "Sales", capacity: "", region: "" },
    items,
    edges,
    jobs,
  };
}

const comparison = {
  previousSnapshotId: "10000000-0000-4000-8000-0000000000a1",
  currentSnapshotId: "10000000-0000-4000-8000-0000000000a2",
  previousObservedAt: "2026-10-01T10:00:00.000Z",
  currentObservedAt: "2026-10-02T10:00:00.000Z",
};

const deltas = diffIncidents(
  snapshot([job(REPORT, "failed", "2026-10-01T05:00:00.000Z")]),
  snapshot([
    job(NOTEBOOK, "failed", "2026-10-02T06:00:00.000Z", "RunNotebook"),
    job(MODEL, "failed", "2026-10-02T07:00:00.000Z"),
    job(REPORT, "completed", "2026-10-02T08:00:00.000Z"),
  ]),
  comparison,
);

describe("incident Sync Brief section", () => {
  it("groups the two compared snapshots and ranks the widest downstream impact", () => {
    const section = incidentBriefSection(deltas, comparison);

    expect(section.opened.map((delta) => delta.incident.itemId)).toEqual([NOTEBOOK, MODEL]);
    expect(section.recovered.map((delta) => delta.incident.itemId)).toEqual([REPORT]);
    expect(section.persisting).toEqual([]);
    expect(section.widestImpact.map((delta) => delta.incident.itemId)).toEqual([NOTEBOOK, MODEL]);
    expect(section.provenance).toMatchObject({
      source: "fabric-job-history",
      previousSnapshotId: comparison.previousSnapshotId,
      currentSnapshotId: comparison.currentSnapshotId,
    });
  });

  it("exports Markdown with provenance, limits and explicit empty groups", () => {
    const markdown = incidentBriefMarkdown(incidentBriefSection(deltas, comparison));

    expect(markdown).toContain("## Operational incidents");
    expect(markdown).toContain("Load sales (RunNotebook): failed at");
    expect(markdown).toContain("2 downstream inferred, 1 observed failing");
    expect(markdown).toContain("### Still failing\n- None");
    expect(markdown).toContain("Fabric failure reasons, logs, query text and business rows are not collected\\.");
    expect(markdown).toContain(comparison.previousSnapshotId);
  });
});

describe("incident Watchlist events", () => {
  it("reports own incidents as observed and upstream incidents with their evidence", () => {
    const events = incidentWatchEvents(deltas, new Set([REPORT, MODEL]), comparison);

    expect(events.map((event) => [event.kind, event.itemId, event.evidence])).toEqual([
      ["downstream-of-incident", MODEL, "observed"],
      ["downstream-of-incident", REPORT, "inferred"],
      ["incident-opened", MODEL, "observed"],
      ["downstream-of-incident", REPORT, "inferred"],
      ["incident-recovered", REPORT, "observed"],
    ]);
    expect(events.every((event) => event.provenance.limitations.length > 0)).toBe(true);
  });

  it("returns nothing for items outside the watchlist", () => {
    expect(incidentWatchEvents(deltas, new Set([LAKEHOUSE + "-other"]), comparison)).toEqual([]);
  });
});
