import { describe, expect, it } from "vitest";
import { radarToMarkdown } from "./radar-markdown";

const summary = (snapshotId: string, syncedAt: string) => ({
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
});

describe("radarToMarkdown", () => {
  it("produces stable escaped snapshot evidence", () => {
    const markdown = radarToMarkdown({
      workspace: "Ops * workspace",
      currentSummary: summary("current", "2026-08-30"),
      previousSummary: summary("previous", "2026-08-29"),
      findings: [],
      riskyChanges: [],
    });

    expect(markdown).toContain("Ops \\* workspace");
    expect(markdown).toContain("Current snapshot: current");
    expect(markdown).toContain("## Risky changes");
    expect(markdown).not.toContain("Generated");
  });
});
