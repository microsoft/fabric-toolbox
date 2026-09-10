import { csvCell } from "./access-export";
import type { OffboardingReport } from "./offboarding";

export function offboardingReassignmentToCsv(
  report: OffboardingReport,
): string {
  const headers = [
    "Principal",
    "Principal ID",
    "Resolution",
    "Report kind",
    "Item",
    "Item ID",
    "Item type",
    "Ownership status",
    "Consumer count",
    "Consumers",
    "Suggested principal",
    "Suggested principal ID",
    "Reason code",
    "Reason",
  ];
  const reassignmentByItem = new Map(
    report.reassignment.map((entry) => [entry.item.fabricId, entry]),
  );
  const rows = report.ownership.map((assessment) => {
    const reassignment = reassignmentByItem.get(assessment.item.fabricId);
    const consumers = report.blastRadius.filter((consumer) =>
      report.blastSources[consumer.id]?.includes(assessment.item.fabricId),
    );
    return [
      report.subject.ref,
      report.subject.principal?.principalId ?? "",
      report.subject.resolution,
      report.kind,
      assessment.item.displayName,
      assessment.item.fabricId,
      assessment.item.itemType,
      assessment.status,
      consumers.length,
      consumers
        .map((consumer) => consumer.item?.displayName ?? `${consumer.id} (unresolved)`)
        .join("; "),
      reassignment?.suggested?.displayName ?? "",
      reassignment?.suggested?.principalId ?? "",
      reassignment?.reasonCode ?? "",
      reassignment?.reason ?? "",
    ];
  });
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ].join("\r\n");
}

function line(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function coverageSummary(report: OffboardingReport): string {
  const { numerator, denominator, percentage } = report.ownershipCoverage;
  return percentage == null
    ? `Not applicable (${numerator}/${denominator} applicable items)`
    : `${percentage}% (${numerator}/${denominator} applicable items)`;
}

export function offboardingReportToMarkdown(
  report: OffboardingReport,
  context: { workspaceName: string; generatedAt: string },
): string {
  const ownershipRoots =
    report.kind === "person-offboarding"
      ? report.owned
      : report.effectiveOwnerItems;
  const lines = [
    "# Fabric Atlas departure pack",
    "",
    `- Workspace: ${line(context.workspaceName)}`,
    `- Subject: ${line(report.subject.ref)}`,
    `- Resolution: ${report.subject.resolution}`,
    `- Generated: ${context.generatedAt}`,
    "",
    "## Warnings",
    ...report.warnings.map((warning) => `- ${line(warning)}`),
    "",
    "## Summary",
    `- ${report.kind === "person-offboarding" ? "Owned items" : "Effective owner items"}: ${ownershipRoots.length}`,
    `- Ownership metadata coverage: ${coverageSummary(report)}`,
    `- Sole-owned items: ${report.soleOwned.length}`,
    `- Urgent orphan risks: ${report.orphanRisk.length}`,
    `- Downstream blast radius: ${report.blastRadius.length}`,
    "",
    "## Urgent orphan risks",
    ...(report.orphanRisk.length
      ? report.orphanRisk.map(
          (risk) =>
            `- ${line(risk.item.displayName)}: ${risk.consumers
              .map((consumer) => line(consumer.item?.displayName ?? consumer.id))
              .join(", ")}`,
        )
      : ["- None"]),
    "",
    "## Reassignment plan",
    ...(report.reassignment.length
      ? report.reassignment.map(
          (entry) =>
            `- ${line(entry.item.displayName)} -> ${line(entry.suggested?.displayName ?? "Unassigned")}: ${line(entry.reason)}`,
        )
      : ["- None"]),
    "",
    "## Blast radius",
    ...(report.blastRadius.length
      ? report.blastRadius.map(
          (entry) =>
            `- ${line(entry.item?.displayName ?? entry.id)} (distance ${entry.distance})`,
        )
      : ["- None"]),
    "",
    "## Effective access evidence",
    ...(report.access.length
      ? report.access.map(
          (row) =>
            `- ${line(row.item.displayName)}: ${row.effectiveAccess} (${row.origin})`,
        )
      : ["- None"]),
  ];
  return lines.join("\n");
}
