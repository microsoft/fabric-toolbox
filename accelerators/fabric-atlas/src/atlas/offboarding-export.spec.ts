import { describe, expect, it } from "vitest";
import {
  offboardingReassignmentToCsv,
  offboardingReportToMarkdown,
} from "./offboarding-export";
import { buildOffboardingReport } from "./offboarding";
import { SAMPLE_DATA } from "./model";

describe("offboarding exports", () => {
  it("produces deterministic Markdown with caller-supplied time", () => {
    const principal = SAMPLE_DATA.principals.find(
      (value) => value.kind === "user" && value.email,
    )!;
    const report = buildOffboardingReport(
      SAMPLE_DATA,
      principal.principalId,
    );
    const markdown = offboardingReportToMarkdown(report, {
      workspaceName: SAMPLE_DATA.workspace.displayName,
      generatedAt: "2026-08-30T12:00:00.000Z",
    });

    expect(markdown).toContain("# Fabric Atlas departure pack");
    expect(markdown).toContain("2026-08-30T12:00:00.000Z");
    expect(markdown).toContain("## Reassignment plan");
    expect(markdown).toContain("Ownership metadata coverage:");
  });

  it("neutralizes spreadsheet formulas in reassignment CSV", () => {
    const principal = SAMPLE_DATA.principals.find(
      (value) => value.kind === "user" && value.email,
    )!;
    const value = structuredClone(SAMPLE_DATA);
    value.items[0].ownerEmail = principal.email;
    value.items[0].displayName = "=FORMULA()";
    const csv = offboardingReassignmentToCsv(
      buildOffboardingReport(value, principal.principalId),
    );

    expect(csv).toContain("\"'=FORMULA()\"");
    expect(csv).toContain("\r\n");
  });

  it("exports downstream consumers for shared ownership roots", () => {
    const principal = SAMPLE_DATA.principals.find(
      (value) => value.kind === "user" && value.email,
    )!;
    const otherOwner = SAMPLE_DATA.principals.find(
      (value) =>
        value.kind === "user" &&
        value.principalId !== principal.principalId,
    )!;
    const value = structuredClone(SAMPLE_DATA);
    const root = value.items[0];
    const consumer = value.items[1];
    root.ownerEmail = principal.email;
    value.edges = [
      { source: root.fabricId, target: consumer.fabricId, relation: "feeds" },
    ];
    value.grants.push({
      principalRef: otherOwner.principalId,
      itemFabricId: root.fabricId,
      accessLevel: "owner",
      source: "directShare",
    });

    const report = buildOffboardingReport(value, principal.principalId);
    const row = offboardingReassignmentToCsv(report)
      .split("\r\n")
      .find((line) => line.includes(root.fabricId));

    expect(report.ownership[0]?.status).toBe("shared");
    expect(row).toContain('"shared","1"');
    expect(row).toContain(consumer.displayName);
  });
});
