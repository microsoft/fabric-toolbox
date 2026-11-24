import { describe, expect, it } from "vitest";
import type { AtlasData, Edge, Item, Job } from "./model";
import {
  applyIncidentRecords,
  diffIncidents,
  fabricAppItemUrl,
  incidentImpact,
  MONITORING_SOURCES,
  monitorHubUrl,
  observedIncidents,
} from "./observability";
import { searchJobId } from "./search";

const WORKSPACE = "6bf4c521-7412-4e6b-8867-68253bbfb18a";
const LAKEHOUSE = "20000000-0000-4000-8000-000000000001";
const NOTEBOOK = "20000000-0000-4000-8000-000000000002";
const MODEL = "20000000-0000-4000-8000-000000000003";
const REPORT = "20000000-0000-4000-8000-000000000004";
const PIPELINE = "20000000-0000-4000-8000-000000000005";
const OUTSIDE = "20000000-0000-4000-8000-0000000000ff";

const items: Item[] = [
  { fabricId: LAKEHOUSE, displayName: "Sales lakehouse", itemType: "Lakehouse" },
  { fabricId: NOTEBOOK, displayName: "Load sales", itemType: "Notebook" },
  { fabricId: MODEL, displayName: "Sales model", itemType: "SemanticModel" },
  { fabricId: REPORT, displayName: "Sales report", itemType: "Report" },
  { fabricId: PIPELINE, displayName: "Nightly load", itemType: "DataPipeline" },
] as Item[];

const edges: Edge[] = [
  { source: NOTEBOOK, target: LAKEHOUSE, relation: "writes" },
  { source: LAKEHOUSE, target: MODEL, relation: "feeds" },
  { source: MODEL, target: REPORT, relation: "feeds" },
  { source: MODEL, target: OUTSIDE, relation: "feeds" },
];

function job(
  itemFabricId: string,
  status: Job["status"],
  startedAt: string,
  jobType = "Refresh",
  message?: string,
): Job {
  return {
    itemFabricId,
    itemName: items.find((item) => item.fabricId === itemFabricId)?.displayName ?? "Unknown",
    jobType,
    status,
    startedAt,
    durationSec: 42,
    message,
  };
}

function data(jobs: Job[]): Pick<AtlasData, "workspace" | "items" | "edges" | "jobs"> {
  return {
    workspace: {
      fabricId: WORKSPACE,
      displayName: "Sales",
      capacity: "",
      region: "",
    },
    items,
    edges,
    jobs,
  };
}

describe("observed incidents", () => {
  it("keeps only failures that are the latest run of an item and job type", () => {
    const incidents = observedIncidents(
      data([
        job(NOTEBOOK, "failed", "2026-10-01T06:00:00.000Z", "Notebook run", "Spark session ended"),
        job(PIPELINE, "failed", "2026-10-01T05:00:00.000Z", "Pipeline run"),
        job(PIPELINE, "completed", "2026-10-01T07:00:00.000Z", "Pipeline run"),
        job(MODEL, "failed", "2026-10-01T08:00:00.000Z"),
        job(MODEL, "running", "2026-10-01T09:00:00.000Z"),
        job(LAKEHOUSE, "failed", "not a date"),
      ]),
      "2026-10-01T10:00:00.000Z",
    );

    expect(incidents).toEqual([
      {
        evidence: "observed",
        id: searchJobId(NOTEBOOK, "Notebook run", "2026-10-01T06:00:00.000Z"),
        key: `incident:v1:${WORKSPACE}:${NOTEBOOK}:notebook run`,
        source: "fabric-job-history",
        workspaceId: WORKSPACE,
        itemId: NOTEBOOK,
        itemName: "Load sales",
        itemType: "Notebook",
        jobType: "Notebook run",
        occurredAt: "2026-10-01T06:00:00.000Z",
        observedAt: "2026-10-01T10:00:00.000Z",
        recorded: false,
        durationSec: 42,
        message: "Spark session ended",
      },
    ]);
  });

  it("carries the Fabric run ID and overlays a stored record for the same run only", () => {
    const failed = {
      ...job(NOTEBOOK, "failed", "2026-10-01T06:00:00.000Z", "Notebook run"),
      runId: "a0a0a0a0-0000-4000-8000-000000000001",
    };
    const [incident] = observedIncidents(data([failed]), "2026-10-02T06:00:00.000Z");
    expect(incident.runId).toBe(failed.runId);

    const [recorded] = applyIncidentRecords([incident], [
      {
        key: incident.key,
        occurredAt: "2026-10-01T06:00:00.000Z",
        observedAt: "2026-10-02T06:00:00.000Z",
        firstObservedAt: "2026-10-01T07:00:00.000Z",
      },
    ]);
    expect(recorded).toMatchObject({
      recorded: true,
      firstObservedAt: "2026-10-01T07:00:00.000Z",
    });

    const [otherRun] = applyIncidentRecords([incident], [
      {
        key: incident.key,
        occurredAt: "2026-09-30T06:00:00.000Z",
        observedAt: "2026-10-01T06:00:00.000Z",
        firstObservedAt: "2026-09-30T07:00:00.000Z",
      },
    ]);
    expect(otherRun.recorded).toBe(false);
    expect(otherRun.firstObservedAt).toBeUndefined();
  });

  it("returns nothing when no job history is captured", () => {
    expect(observedIncidents(data([]))).toEqual([]);
    expect(incidentImpact(data([]))).toEqual([]);
  });
});

describe("inferred downstream impact", () => {
  it("labels snapshot-lineage consumers as inferred and never as observed", () => {
    const [entry] = incidentImpact(
      data([job(NOTEBOOK, "failed", "2026-10-01T06:00:00.000Z", "Notebook run")]),
    );

    expect(entry.incident.evidence).toBe("observed");
    expect(
      entry.impact.map((impact) => [
        impact.evidence,
        impact.basis,
        impact.itemId,
        impact.itemName,
        impact.distance,
      ]),
    ).toEqual([
      ["inferred", "snapshot-lineage", LAKEHOUSE, "Sales lakehouse", 1],
      ["inferred", "snapshot-lineage", MODEL, "Sales model", 2],
      ["inferred", "snapshot-lineage", REPORT, "Sales report", 3],
    ]);
    expect(entry.impact.every((impact) => impact.incidentId === entry.incident.id)).toBe(true);
    expect(entry.impact.some((impact) => impact.itemId === OUTSIDE)).toBe(false);
  });

  it("does not report upstream producers or the failed item itself", () => {
    const [entry] = incidentImpact(
      data([job(MODEL, "failed", "2026-10-01T06:00:00.000Z")]),
    );

    expect(entry.impact.map((impact) => impact.itemId)).toEqual([REPORT]);
  });

  it("labels a consumer observed only when it has its own failure in the snapshot", () => {
    const entries = incidentImpact(
      data([
        job(NOTEBOOK, "failed", "2026-10-01T06:00:00.000Z", "Notebook run"),
        job(MODEL, "failed", "2026-10-01T07:00:00.000Z"),
      ]),
    );
    const notebook = entries.find((entry) => entry.incident.itemId === NOTEBOOK)!;
    const model = entries.find((entry) => entry.incident.itemId === MODEL)!;

    expect(
      notebook.impact.map((impact) => [impact.itemId, impact.evidence, impact.observedIncidentId]),
    ).toEqual([
      [LAKEHOUSE, "inferred", undefined],
      [MODEL, "observed", model.incident.id],
      [REPORT, "inferred", undefined],
    ]);
  });
});

describe("incident deltas between snapshots", () => {
  const comparison = {
    previousSnapshotId: "10000000-0000-4000-8000-0000000000a1",
    currentSnapshotId: "10000000-0000-4000-8000-0000000000a2",
    previousObservedAt: "2026-10-01T10:00:00.000Z",
    currentObservedAt: "2026-10-02T10:00:00.000Z",
  };

  it("separates opened, persisting, recovered and no longer reported incidents", () => {
    const previous = data([
      job(NOTEBOOK, "failed", "2026-10-01T06:00:00.000Z", "Notebook run"),
      job(MODEL, "failed", "2026-10-01T07:00:00.000Z"),
      job(PIPELINE, "failed", "2026-10-01T05:00:00.000Z", "Pipeline run"),
    ]);
    const current = data([
      job(NOTEBOOK, "failed", "2026-10-02T06:00:00.000Z", "Notebook run"),
      job(MODEL, "completed", "2026-10-02T07:00:00.000Z"),
      job(REPORT, "failed", "2026-10-02T08:00:00.000Z", "Refresh"),
    ]);

    const deltas = diffIncidents(previous, current, comparison);

    expect(deltas.map((delta) => [delta.status, delta.incident.itemId])).toEqual([
      ["opened", REPORT],
      ["persisting", NOTEBOOK],
      ["recovered", MODEL],
      ["unreported", PIPELINE],
    ]);
    expect(deltas[2].recoveredBy).toEqual({
      status: "completed",
      startedAt: "2026-10-02T07:00:00.000Z",
    });
    expect(deltas[1].incident.occurredAt).toBe("2026-10-02T06:00:00.000Z");
    expect(deltas[0].incident.observedAt).toBe(comparison.currentObservedAt);
  });
});

describe("monitoring sources", () => {
  it("collects only the synchronized job history", () => {
    expect(
      MONITORING_SOURCES.map((source) => [source.id, source.status]),
    ).toEqual([
      ["fabric-job-history", "collected"],
      ["workspace-monitoring", "not-collected"],
      ["monitor-hub-alerts", "fabric-only"],
      ["app-metrics", "fabric-only"],
    ]);
    expect(
      MONITORING_SOURCES.every((source) =>
        source.documentationUrl.startsWith("https://learn.microsoft.com/"),
      ),
    ).toBe(true);
    expect(
      MONITORING_SOURCES.find((source) => source.id === "workspace-monitoring")
        ?.prerequisites.join(" "),
    ).toMatch(/30 days by default.*Fabric capacity/s);
  });
});

describe("native Fabric links", () => {
  it("builds the verified Monitor hub routes with tenant context", () => {
    expect(
      monitorHubUrl("jobs", {
        portalBase: "https://app.fabric.microsoft.com/",
        tenantId: "1E45D0CB-B0DD-408C-8806-58B447605E96",
      }),
    ).toBe(
      "https://app.fabric.microsoft.com/monitoringhub/jobs?experience=fabric-developer&ctid=1e45d0cb-b0dd-408c-8806-58b447605e96",
    );
    expect(monitorHubUrl("alerts", { tenantId: "not-a-tenant" })).toBe(
      "https://app.fabric.microsoft.com/monitoringhub/alerts?experience=fabric-developer",
    );
    expect(
      monitorHubUrl("applications", { portalBase: "http://evil.example" }),
    ).toBe(
      "https://app.fabric.microsoft.com/monitoringhub/applications?experience=fabric-developer",
    );
  });

  it("links the app item only when workspace and item IDs are valid", () => {
    expect(
      fabricAppItemUrl({
        workspaceId: WORKSPACE,
        itemId: "AA0F0E73-3E3C-4E24-902B-78735F992A17",
      }),
    ).toBe(
      `https://app.fabric.microsoft.com/groups/${WORKSPACE}/appbackends/aa0f0e73-3e3c-4e24-902b-78735f992a17?experience=fabric-developer`,
    );
    expect(fabricAppItemUrl({ workspaceId: WORKSPACE, itemId: "" })).toBeUndefined();
    expect(
      fabricAppItemUrl({ workspaceId: "../admin", itemId: WORKSPACE }),
    ).toBeUndefined();
  });
});
