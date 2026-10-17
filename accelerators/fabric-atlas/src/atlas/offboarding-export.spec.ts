import { describe, expect, it } from "vitest";
import {
  offboardingAccessToCsv,
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

  it("escapes item names in Markdown exports", () => {
    const principal = SAMPLE_DATA.principals.find(
      (value) => value.kind === "user" && value.email,
    )!;
    const value = structuredClone(SAMPLE_DATA);
    value.items[0].ownerEmail = principal.email;
    value.items[0].displayName = "[Item](javascript:alert(1))<img>";

    const markdown = offboardingReportToMarkdown(
      buildOffboardingReport(value, principal.principalId),
      {
        workspaceName: "Workspace",
        generatedAt: "2026-08-30T12:00:00.000Z",
      },
    );

    expect(markdown).toContain(
      "\\[Item\\]\\(javascript:alert\\(1\\)\\)\\<img\\>",
    );
    expect(markdown).not.toContain("[Item](javascript:alert(1))<img>");
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

  it("retains review evidence and downstream impact in the access CSV", () => {
    const principal = SAMPLE_DATA.principals.find(
      (value) => value.kind === "user" && value.email,
    )!;
    const value = structuredClone(SAMPLE_DATA);
    const reportPrincipal = value.principals.find(
      (candidate) => candidate.principalId === principal.principalId,
    )!;
    reportPrincipal.workspaceRole = "Viewer";
    const principalRefs = new Set([
      principal.principalId,
      principal.displayName,
      principal.email,
    ]);
    value.grants = value.grants.filter(
      (grant) =>
        !!grant.itemFabricId || !principalRefs.has(grant.principalRef),
    );
    const notebook = {
      ...value.items[0],
      fabricId: "notebook-review",
      displayName: "Notebook review",
      itemType: "Notebook" as const,
      ownerName: undefined,
      ownerEmail: undefined,
      ownerMetadataAvailable: false,
      configuredBy: principal.email,
    };
    const consumer = value.items[1];
    value.items.push(notebook);
    value.grants.push({
      principalRef: principal.principalId,
      itemFabricId: notebook.fabricId,
      accessLevel: "edit",
      source: "directShare",
    });
    value.edges = [
      { source: notebook.fabricId, target: consumer.fabricId, relation: "feeds" },
    ];

    const csv = offboardingAccessToCsv(
      buildOffboardingReport(value, principal.principalId),
    );
    const row = csv
      .split("\r\n")
      .find((line) => line.includes(notebook.fabricId));

    expect(csv).toContain("\"Evidence categories\"");
    expect(row).toContain("Direct Edit access");
    expect(row).toContain("Configured by");
    expect(row).toContain("Ownership evidence is unavailable.");
    expect(row).toContain(consumer.displayName);
  });
});
