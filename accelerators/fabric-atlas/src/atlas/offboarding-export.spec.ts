import { describe, expect, it } from "vitest";
import {
  offboardingAccessToCsv,
  offboardingReassignmentToCsv,
  offboardingReportToMarkdown,
} from "./offboarding-export";
import { buildOffboardingReport } from "./offboarding";
import { markdownText } from "./markdown";
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
    expect(markdown).toContain("## Connections\n- No connection inventory collected yet.");
  });

  it("lists the connections of the subject and the ones left without an owner", () => {
    const principal = SAMPLE_DATA.principals.find(
      (value) => value.kind === "user" && value.email,
    )!;
    const value = structuredClone(SAMPLE_DATA);
    const connectionId = "11111111-1111-4111-8111-111111111111";
    value.connections = {
      collectedAt: "2026-11-09T12:00:00.000Z",
      status: "complete",
      truncated: false,
      roleLookups: { done: 1, skipped: 0, failed: 0 },
      connections: [
        {
          id: connectionId,
          displayName: "adls-[landing]",
          connectivityType: "ShareableCloud",
          connectorType: "AzureDataLakeStorage",
          rolesStatus: "complete",
          roles: [{ principalId: principal.principalId, principalType: "User", role: "Owner" }],
        },
      ],
    };
    value.config.push({
      itemFabricId: value.items[0].fabricId,
      section: "Source provenance",
      label: "OneLake shortcut",
      value: `connection=${connectionId}; consumer=${value.items[0].fabricId}`,
    });

    const markdown = offboardingReportToMarkdown(
      buildOffboardingReport(value, principal.principalId),
      { workspaceName: "Workspace", generatedAt: "2026-11-09T12:00:00.000Z" },
    );

    const name = markdownText("adls-[landing]");
    expect(markdown).toContain("- Owned connections: 1 (sole owner: 1)");
    expect(markdown).toContain(
      `- Connection ${name}: no other owner; used by ${markdownText(value.items[0].displayName)}`,
    );
    expect(markdown).toContain(
      `- ${name} (AzureDataLakeStorage): Owner; Sole owner; used by:`,
    );
    expect(markdown).toContain("-> Add another owner before the departure");
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
