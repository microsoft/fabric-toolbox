import type { FindingDelta, RiskyChange } from "./radar";
import type { SnapshotSummary } from "./history";
import { INCIDENT_LIMITATIONS, type IncidentDelta } from "./observability";
import { markdownText } from "./markdown";

function clean(value: unknown): string {
  return markdownText(value);
}

function incidentLine(delta: IncidentDelta): string {
  const observed = delta.impact.filter((impact) => impact.evidence === "observed").length;
  const inferred = delta.impact.length - observed;
  return `- **${clean(delta.incident.jobType)}** ${clean(delta.incident.itemName)}: latest captured run failed at ${clean(delta.incident.occurredAt)}; downstream ${inferred} inferred, ${observed} observed failing`;
}

export function radarToMarkdown(input: {
  workspace: string;
  currentSummary: SnapshotSummary;
  previousSummary: SnapshotSummary;
  findings: FindingDelta[];
  riskyChanges: RiskyChange[];
  incidents?: IncidentDelta[];
}): string {
  const findings = [...input.findings].sort((left, right) =>
    left.finding.id.localeCompare(right.finding.id),
  );
  const risks = [...input.riskyChanges].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const incidents = [...(input.incidents ?? [])].sort((left, right) =>
    left.key.localeCompare(right.key),
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
    "",
    "## Operational incidents opened",
    ...(incidents.length ? incidents.map(incidentLine) : ["- None"]),
    "",
    "Incident provenance and limits:",
    ...INCIDENT_LIMITATIONS.map((limitation) => `- ${clean(limitation)}`),
  ].join("\n");
}
