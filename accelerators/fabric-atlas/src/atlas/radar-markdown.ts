import type { FindingDelta, RiskyChange } from "./radar";
import type { SnapshotSummary } from "./history";

function clean(value: unknown): string {
  return String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/([\\`*_{}[\]()#+.!|-])/g, "\\$1")
    .trim();
}

export function radarToMarkdown(input: {
  workspace: string;
  currentSummary: SnapshotSummary;
  previousSummary: SnapshotSummary;
  findings: FindingDelta[];
  riskyChanges: RiskyChange[];
}): string {
  const findings = [...input.findings].sort((left, right) =>
    left.finding.id.localeCompare(right.finding.id),
  );
  const risks = [...input.riskyChanges].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  return [
    "# Fabric Atlas Governance Radar",
    "",
    `- Workspace: ${clean(input.workspace)}`,
    `- Current snapshot: ${input.currentSummary.snapshotId} (${input.currentSummary.syncedAt})`,
    `- Previous snapshot: ${input.previousSummary.snapshotId} (${input.previousSummary.syncedAt})`,
    "",
    "## New findings",
    ...(findings.length
      ? findings.map(
          (delta) =>
            `- **${delta.finding.severity.toUpperCase()}** ${clean(delta.finding.title)} — ${clean(delta.finding.detail)} Recommendation: ${clean(delta.finding.recommendation)}`,
        )
      : ["- None"]),
    "",
    "## Risky changes",
    ...(risks.length
      ? risks.map(
          (risk) =>
            `- **${risk.severity.toUpperCase()}** ${clean(risk.detail)} (${clean(risk.change.label)})`,
        )
      : ["- None"]),
  ].join("\n");
}
