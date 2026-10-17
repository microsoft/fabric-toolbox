import { csvCell } from "./access-export";
import {
  ACCESS_EVIDENCE_LABEL,
  GRANT_ONLY_NOTICE,
} from "./access-coverage";
import { markdownText } from "./markdown";
import type {
  OffboardingReport,
  OffboardingReviewEvidence,
} from "./offboarding";

const EVIDENCE_LABEL: Record<OffboardingReviewEvidence, string> = {
  "documented-owner": "Documented owner",
  "direct-owner-access": "Direct Owner access",
  "workspace-owner-access": "Workspace Owner access",
  "direct-edit-access": "Direct Edit access",
  "workspace-edit-access": "Workspace Edit access",
  "configured-by": "Configured by",
  "modified-by": "Modified by",
  "ownership-unknown": "Ownership unknown",
};

interface ReviewExportEntry {
  item: OffboardingReport["ownershipUnknown"][number];
  evidence: Set<OffboardingReviewEvidence>;
  accessLevel?: string;
  accessOrigin?: string;
}

function reviewEntries(
  report: OffboardingReport,
): Map<string, ReviewExportEntry> {
  const review = new Map<string, ReviewExportEntry>();
  const add = (
    item: OffboardingReport["ownershipUnknown"][number],
    evidence: readonly OffboardingReviewEvidence[],
    accessLevel?: string,
    accessOrigin?: string,
  ) => {
    const entry = review.get(item.fabricId) ?? {
      item,
      evidence: new Set<OffboardingReviewEvidence>(),
    };
    evidence.forEach((value) => entry.evidence.add(value));
    entry.accessLevel = accessLevel ?? entry.accessLevel;
    entry.accessOrigin = accessOrigin ?? entry.accessOrigin;
    review.set(item.fabricId, entry);
  };
  report.ownership.forEach((assessment) =>
    add(assessment.item, ["documented-owner"]),
  );
  report.privilegedReview.forEach((entry) =>
    add(
      entry.item,
      entry.evidence,
      entry.accessLevel,
      entry.accessOrigin,
    ),
  );
  report.identityDependencies.forEach((entry) =>
    add(entry.item, entry.evidence),
  );
  report.ownershipUnknown.forEach((item) =>
    add(item, ["ownership-unknown"]),
  );
  return review;
}

function evidenceText(entry: ReviewExportEntry | undefined): string {
  return entry
    ? [...entry.evidence].map((value) => EVIDENCE_LABEL[value]).join("; ")
    : "";
}

function itemConsumers(
  report: OffboardingReport,
  itemId: string,
): OffboardingReport["blastRadius"] {
  return report.blastRadius.filter((consumer) =>
    report.blastSources[consumer.id]?.includes(itemId),
  );
}

function manualReviewReason(
  entry: ReviewExportEntry | undefined,
): string {
  if (!entry) return "";
  const reasons: string[] = [];
  if (entry.evidence.has("ownership-unknown")) {
    reasons.push("Ownership evidence is unavailable.");
  }
  if (
    [...entry.evidence].some((value) =>
      value.includes("-owner-access") || value.includes("-edit-access"),
    )
  ) {
    reasons.push(
      "Recorded Owner/Edit access requires review and is not proof of business ownership.",
    );
  }
  if (
    entry.evidence.has("configured-by") ||
    entry.evidence.has("modified-by")
  ) {
    reasons.push(
      "Observed identity reference requires validation before offboarding.",
    );
  }
  return reasons.join(" ");
}

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
    "Evidence categories",
    "Ownership evidence",
    "Access level",
    "Access origin",
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
  const ownershipByItem = new Map(
    report.ownership.map((assessment) => [
      assessment.item.fabricId,
      assessment,
    ]),
  );
  const rows = [...reviewEntries(report).values()]
    .sort((left, right) =>
      left.item.displayName.localeCompare(right.item.displayName),
    )
    .map((entry) => {
      const assessment = ownershipByItem.get(entry.item.fabricId);
      const reassignment = reassignmentByItem.get(entry.item.fabricId);
      const consumers = itemConsumers(report, entry.item.fabricId);
      return [
        report.subject.ref,
        report.subject.principal?.principalId ?? "",
        report.subject.resolution,
        report.kind,
        entry.item.displayName,
        entry.item.fabricId,
        entry.item.itemType,
        evidenceText(entry),
        entry.item.ownerMetadataAvailable === true
          ? "Documented"
          : "Not evaluated",
        entry.accessLevel ?? "",
        entry.accessOrigin ?? "",
        assessment?.status ?? "unknown",
        consumers.length,
        consumers
          .map(
            (consumer) =>
              consumer.item?.displayName ?? `${consumer.id} (unresolved)`,
          )
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

export function offboardingAccessToCsv(report: OffboardingReport): string {
  const review = reviewEntries(report);
  const headers = [
    "Principal",
    "Principal ID",
    "Resolution",
    "Item",
    "Item ID",
    "Item type",
    "Highest recorded grant",
    "Origin",
    "Grant sources",
    "Evidence categories",
    "Ownership evidence",
    "Manual review reason",
    "Identity dependency warning",
    "Consumer count",
    "Consumers",
    "Access coverage",
    "Assessment limitation",
  ];
  const rows = report.access.map((row) => {
    const entry = review.get(row.itemId);
    const consumers = itemConsumers(report, row.itemId);
    const identityWarning = entry
      ? [...entry.evidence]
          .filter(
            (value) => value === "configured-by" || value === "modified-by",
          )
          .map((value) => EVIDENCE_LABEL[value])
          .join("; ")
      : "";
    return [
      row.principalRef,
      row.principalId ?? "",
      row.principalResolution,
      row.item.displayName,
      row.itemId,
      row.item.itemType,
      row.effectiveAccess,
      row.origin,
      row.applicableGrants
        .map(
          (grant) =>
            `${grant.itemFabricId ? "Item" : "Workspace"}: ${grant.source}${grant.roleName ? ` (${grant.roleName})` : ""}`,
        )
        .join("; "),
      evidenceText(entry),
      row.item.ownerMetadataAvailable === true
        ? "Documented"
        : "Not evaluated",
      manualReviewReason(entry),
      identityWarning,
      consumers.length,
      consumers
        .map(
          (consumer) =>
            consumer.item?.displayName ?? `${consumer.id} (unresolved)`,
        )
        .join("; "),
      ACCESS_EVIDENCE_LABEL[row.coverage.state],
      GRANT_ONLY_NOTICE,
    ];
  });
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ].join("\r\n");
}

function line(value: string): string {
  return markdownText(value);
}

function coverageSummary(report: OffboardingReport): string {
  const workspace = report.workspaceOwnershipCoverage;
  const applicable = report.ownershipCoverage;
  const applicableText =
    applicable.percentage == null
      ? "not applicable"
      : `${applicable.percentage}% of applicable items`;
  return `${workspace.documented}/${workspace.total} workspace items documented; ${workspace.unknown} not evaluated; ${applicableText}`;
}

export function offboardingReportToMarkdown(
  report: OffboardingReport,
  context: { workspaceName: string; generatedAt: string },
): string {
  const ownershipRoots =
    report.kind === "person-offboarding"
      ? report.owned
      : report.effectiveOwnerItems;
  const review = reviewEntries(report);
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
    `- Privileged items requiring review: ${report.privilegedReview.length}`,
    `- Observed identity dependencies: ${report.identityDependencies.length}`,
    `- Ownership unknown: ${report.ownershipUnknown.length}`,
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
    "## Privileged items requiring review",
    ...(report.privilegedReview.length
      ? report.privilegedReview.map(
          (entry) =>
            `- ${line(entry.item.displayName)}: ${entry.evidence.map((value) => line(EVIDENCE_LABEL[value])).join(", ")}`,
        )
      : ["- None"]),
    "",
    "## Observed identity dependencies",
    ...(report.identityDependencies.length
      ? report.identityDependencies.map(
          (entry) =>
            `- ${line(entry.item.displayName)}: ${entry.evidence.map((value) => line(EVIDENCE_LABEL[value])).join(", ")}`,
        )
      : ["- None"]),
    "",
    "## Ownership unknown / manual review",
    ...(report.ownershipUnknown.length
      ? report.ownershipUnknown.map(
          (item) => `- ${line(item.displayName)} (${line(item.itemType)})`,
        )
      : ["- None"]),
    "",
    "## Blast radius",
    ...(report.blastRadius.length
      ? report.blastRadius.map((entry) => {
          const sources = (report.blastSources[entry.id] ?? []).map(
            (sourceId) => {
              const source = review.get(sourceId);
              return source
                ? `${line(source.item.displayName)} [${line(evidenceText(source))}]`
                : line(sourceId);
            },
          );
          return `- ${line(entry.item?.displayName ?? entry.id)} (distance ${entry.distance}); roots: ${sources.join(", ")}`;
        })
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
