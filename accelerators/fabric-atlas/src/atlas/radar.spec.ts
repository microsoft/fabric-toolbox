import { describe, expect, it } from "vitest";
import { buildAtlasHistory, snapshotFromData } from "./history";
import { SAMPLE_DATA } from "./model";
import {
  buildRadar,
  diffFindings,
  filterRiskyChanges,
  incidentRadarEntries,
  radarEntries,
} from "./radar";

describe("Governance Radar", () => {
  it("diffs new, persisting and resolved findings deterministically", () => {
    const finding = (id: string) => ({
      id,
      severity: "high" as const,
      category: "access" as const,
      title: id,
      detail: id,
      recommendation: id,
      evidenceIds: [],
    });
    expect(
      diffFindings([finding("persist"), finding("resolved")], [
        finding("new"),
        finding("persist"),
      ], {
        currentSnapshotId: "current",
        currentSyncedAt: "2026-08-30T12:00:00.000Z",
        previousSnapshotId: "previous",
        previousSyncedAt: "2026-08-29T12:00:00.000Z",
      }).map(({ status, finding: value }) => [status, value.id]),
    ).toEqual([
      ["new", "new"],
      ["persisting", "persist"],
      ["resolved", "resolved"],
    ]);
  });

  it("returns a deployment baseline instead of an alert avalanche", () => {
    const previous = structuredClone(SAMPLE_DATA);
    previous.workspace.snapshotId = "previous";
    previous.workspace.syncedAt = "2026-08-29T12:00:00.000Z";
    previous.workspace.deploymentId = "old";
    const current = structuredClone(SAMPLE_DATA);
    current.workspace.snapshotId = "current";
    current.workspace.syncedAt = "2026-08-30T12:00:00.000Z";
    current.workspace.deploymentId = "new";
    const history = buildAtlasHistory([
      snapshotFromData(current),
      snapshotFromData(previous),
    ]);

    expect(buildRadar(history)).toMatchObject({
      state: "baseline",
      reason: "deployment-changed",
    });
  });

  it("establishes a visual baseline after the first validated snapshot", () => {
    const current = structuredClone(SAMPLE_DATA);
    current.workspace.snapshotId = "current";
    current.workspace.syncedAt = "2026-08-30T12:00:00.000Z";
    const history = buildAtlasHistory([snapshotFromData(current)]);

    expect(buildRadar(history)).toMatchObject({
      state: "baseline",
      currentSnapshotId: "current",
      reason: "first-snapshot",
    });
  });

  it("reports loading when summary catalogs are not hydrated", () => {
    const current = snapshotFromData(SAMPLE_DATA, "current", "2026-08-30");
    const history = buildAtlasHistory([current], [
      {
        ...historySummary("previous", "2026-08-29"),
      },
    ]);
    expect(buildRadar(history)).toEqual({
      state: "loading",
      missingSnapshotIds: ["previous"],
    });
  });

  it("retains non-risky inventory changes for Radar context", () => {
    const previous = structuredClone(SAMPLE_DATA);
    previous.workspace.snapshotId = "previous";
    previous.workspace.syncedAt = "2026-08-30T12:00:00.000Z";
    previous.workspace.deploymentId = "1.9.0:old-commit:2026-08-30";
    const current = structuredClone(previous);
    current.workspace.snapshotId = "current";
    current.workspace.syncedAt = "2026-08-30T13:00:00.000Z";
    current.workspace.deploymentId = "1.9.1:new-commit:2026-08-31";
    current.items.push({
      ...current.items[0],
      fabricId: "new-warehouse",
      displayName: "New warehouse",
      itemType: "Warehouse",
    });
    const result = buildRadar(
      buildAtlasHistory([
        snapshotFromData(current),
        snapshotFromData(previous),
      ]),
    );

    expect(result.state).toBe("ready");
    if (result.state !== "ready") return;
    expect(result.observedChanges).toEqual([
      expect.objectContaining({
        type: "item-added",
        itemFabricId: "new-warehouse",
      }),
    ]);
    expect(result.riskyChanges).toEqual([]);
  });

  it("feeds opened incidents into Radar once, with lineage impact and provenance", () => {
    const previous = structuredClone(SAMPLE_DATA);
    previous.workspace.snapshotId = "previous";
    previous.workspace.syncedAt = "2026-08-30T12:00:00.000Z";
    previous.workspace.deploymentId = "1.9.0:old-commit:2026-08-30";
    const current = structuredClone(previous);
    current.workspace.snapshotId = "current";
    current.workspace.syncedAt = "2026-08-30T13:00:00.000Z";
    const bronze = current.jobs.find((job) => job.itemName === "01_bronze_ingest")!;
    current.jobs.push({
      ...bronze,
      status: "failed",
      startedAt: new Date(Date.parse(bronze.startedAt) + 60_000).toISOString(),
    });

    const result = buildRadar(
      buildAtlasHistory([snapshotFromData(current), snapshotFromData(previous)]),
      { minSeverity: "high" },
    );

    expect(result.state).toBe("ready");
    if (result.state !== "ready") return;
    expect(result.incidents.map((delta) => [delta.status, delta.incident.itemName])).toEqual([
      ["opened", "01_bronze_ingest"],
    ]);
    const entries = radarEntries(result);
    const incidentRows = entries.filter((entry) => entry.incident);
    expect(incidentRows).toHaveLength(1);
    expect(incidentRows[0]).toMatchObject({
      severity: "high",
      title: "Notebook run failing: 01_bronze_ingest",
    });
    expect(incidentRows[0].detail).toMatch(/inferred from snapshot lineage/);
    expect(incidentRows[0].detail).toMatch(/failure reason is not collected/);
    expect(
      entries.some(
        (entry) => entry.delta?.finding.jobId === incidentRows[0].incident!.incident.id,
      ),
    ).toBe(false);
  });

  it("raises an incident to critical when a downstream consumer is also failing", () => {
    const delta = {
      status: "opened" as const,
      key: "incident:v1:w:i:refresh",
      incident: {
        evidence: "observed" as const,
        id: "job:1",
        key: "incident:v1:w:i:refresh",
        source: "fabric-job-history" as const,
        workspaceId: "w",
        itemId: "i",
        itemName: "Model",
        jobType: "Refresh",
        occurredAt: "2026-08-30T12:30:00.000Z",
        recorded: false,
        durationSec: 3,
      },
      impact: [
        {
          evidence: "observed" as const,
          incidentId: "job:1",
          itemId: "r",
          itemName: "Report",
          distance: 1,
          basis: "snapshot-lineage" as const,
          observedIncidentId: "job:2",
        },
      ],
    };

    expect(incidentRadarEntries([delta])[0]).toMatchObject({
      severity: "critical",
      detail: expect.stringContaining("1 downstream item also failing (observed)"),
    });
    expect(incidentRadarEntries([{ ...delta, status: "persisting" }])).toEqual([]);
  });

  it("keeps only concrete risky changes", () => {
    const previous = snapshotFromData(
      {
        ...structuredClone(SAMPLE_DATA),
        edges: [
          { source: "removed", target: "consumer", relation: "feeds" },
        ],
      },
      "previous",
      "2026-08-29",
    ).catalog;
    const base = {
      snapshotId: "current",
      syncedAt: "2026-08-30",
      label: "Change",
    };
    const risks = filterRiskyChanges(
      [
        {
          ...base,
          id: "access",
          type: "access-grant-added",
          domain: "access",
          after: { flag: "external" },
        },
        {
          ...base,
          id: "broken",
          type: "lineage-broken-state-changed",
          domain: "lineage",
          after: true,
        },
        {
          ...base,
          id: "removed",
          type: "item-removed",
          domain: "item",
          itemFabricId: "removed",
        },
        {
          ...base,
          id: "sensitivity",
          type: "sensitivity-changed",
          domain: "sensitivity",
          before: "restricted",
          after: "internal",
        },
      ],
      previous,
      { internal: 1, restricted: 3 },
    );

    expect(risks.map((risk) => risk.kind)).toEqual([
      "consumed-item-removed",
      "lineage-broken",
      "external-grant-added",
      "sensitivity-downgraded",
    ]);
  });
});

function historySummary(snapshotId: string, syncedAt: string) {
  return {
    snapshotId,
    syncedAt,
    label: syncedAt,
    items: 0,
    itemCount: 0,
    healthy: 0,
    healthyCount: 0,
    stale: 0,
    staleCount: 0,
    failing: 0,
    failingCount: 0,
    labels: 0,
    labelCount: 0,
    principals: 0,
    principalCount: 0,
    externalPrincipals: 0,
    externalPrincipalCount: 0,
    grants: 0,
    grantCount: 0,
    failedJobs: 0,
    failedJobCount: 0,
    lineage: 0,
    lineageEdges: 0,
    lineageEdgeCount: 0,
    brokenEdges: 0,
    brokenEdgeCount: 0,
    tables: 0,
    tableCount: 0,
    columns: 0,
    columnCount: 0,
    measures: 0,
    measureCount: 0,
  };
}
