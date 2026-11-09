import {
  INCIDENT_LIMITATIONS,
  type IncidentComparison,
  type IncidentDelta,
} from "./observability";

/**
 * Incident inputs for the Sync Brief (#40) and Watchlists (#38). Both consume
 * the same snapshot-to-snapshot `IncidentDelta` list that feeds Governance
 * Radar, so every surface reports the same counts and provenance.
 */
export interface IncidentFeedProvenance extends IncidentComparison {
  source: "fabric-job-history";
  limitations: readonly string[];
}

export function incidentFeedProvenance(
  comparison: IncidentComparison,
): IncidentFeedProvenance {
  return {
    ...comparison,
    source: "fabric-job-history",
    limitations: INCIDENT_LIMITATIONS,
  };
}

export interface IncidentBriefSection {
  opened: IncidentDelta[];
  recovered: IncidentDelta[];
  persisting: IncidentDelta[];
  unreported: IncidentDelta[];
  /** Opened or persisting incidents ranked by downstream reach. */
  widestImpact: IncidentDelta[];
  provenance: IncidentFeedProvenance;
}

export function incidentBriefSection(
  deltas: readonly IncidentDelta[],
  comparison: IncidentComparison,
): IncidentBriefSection {
  const byStatus = (status: IncidentDelta["status"]) =>
    deltas.filter((delta) => delta.status === status);
  const open = deltas.filter(
    (delta) => delta.status === "opened" || delta.status === "persisting",
  );
  return {
    opened: byStatus("opened"),
    recovered: byStatus("recovered"),
    persisting: byStatus("persisting"),
    unreported: byStatus("unreported"),
    widestImpact: open
      .filter((delta) => delta.impact.length > 0)
      .sort(
        (left, right) =>
          right.impact.length - left.impact.length ||
          left.key.localeCompare(right.key),
      )
      .slice(0, 5),
    provenance: incidentFeedProvenance(comparison),
  };
}

function clean(value: unknown): string {
  return String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/([\\`*_{}[\]()#+.!|-])/g, "\\$1")
    .trim();
}

function impactSummary(delta: IncidentDelta): string {
  const observed = delta.impact.filter((impact) => impact.evidence === "observed").length;
  const inferred = delta.impact.length - observed;
  return `${inferred} downstream inferred, ${observed} observed failing`;
}

function lines(deltas: readonly IncidentDelta[], describe: (delta: IncidentDelta) => string): string[] {
  return deltas.length ? deltas.map(describe) : ["- None"];
}

/** Markdown for the incident part of a Sync Brief, with provenance and limits. */
export function incidentBriefMarkdown(section: IncidentBriefSection): string {
  const { provenance } = section;
  return [
    "## Operational incidents",
    "",
    `- Compared snapshots: ${provenance.previousSnapshotId} (${provenance.previousObservedAt}) to ${provenance.currentSnapshotId} (${provenance.currentObservedAt})`,
    "- Source: Fabric job history captured at synchronization",
    "",
    "### Opened",
    ...lines(
      section.opened,
      (delta) =>
        `- ${clean(delta.incident.itemName)} (${clean(delta.incident.jobType)}): failed at ${clean(delta.incident.occurredAt)}; ${impactSummary(delta)}`,
    ),
    "",
    "### Recovered",
    ...lines(
      section.recovered,
      (delta) =>
        `- ${clean(delta.incident.itemName)} (${clean(delta.incident.jobType)}): newer run ${clean(delta.recoveredBy?.status ?? "")} at ${clean(delta.recoveredBy?.startedAt ?? "")}`,
    ),
    "",
    "### Still failing",
    ...lines(
      section.persisting,
      (delta) =>
        `- ${clean(delta.incident.itemName)} (${clean(delta.incident.jobType)}): ${impactSummary(delta)}`,
    ),
    "",
    "### No longer reported",
    ...lines(
      section.unreported,
      (delta) =>
        `- ${clean(delta.incident.itemName)} (${clean(delta.incident.jobType)}): no newer run captured; the failure may be outside the retained job history`,
    ),
    "",
    "Provenance and limits:",
    ...provenance.limitations.map((limitation) => `- ${clean(limitation)}`),
  ].join("\n");
}

export type IncidentWatchEventKind =
  | "incident-opened"
  | "incident-recovered"
  | "downstream-of-incident";

export interface IncidentWatchEvent {
  kind: IncidentWatchEventKind;
  /** The watched item the event is about. */
  itemId: string;
  /** Observed for the item's own failure or an observed failing consumer. */
  evidence: "observed" | "inferred";
  delta: IncidentDelta;
  provenance: IncidentFeedProvenance;
}

/**
 * Watchlist events for watched items: their own incidents opening or
 * recovering, and opened incidents upstream of them. Upstream impact on a
 * watched item stays inferred unless that item has its own observed failure.
 */
export function incidentWatchEvents(
  deltas: readonly IncidentDelta[],
  watchedItemIds: ReadonlySet<string>,
  comparison: IncidentComparison,
): IncidentWatchEvent[] {
  const provenance = incidentFeedProvenance(comparison);
  const events: IncidentWatchEvent[] = [];
  for (const delta of deltas) {
    if (watchedItemIds.has(delta.incident.itemId)) {
      if (delta.status === "opened" || delta.status === "recovered") {
        events.push({
          kind: delta.status === "opened" ? "incident-opened" : "incident-recovered",
          itemId: delta.incident.itemId,
          evidence: "observed",
          delta,
          provenance,
        });
      }
    }
    if (delta.status !== "opened") continue;
    for (const impact of delta.impact) {
      if (!watchedItemIds.has(impact.itemId)) continue;
      events.push({
        kind: "downstream-of-incident",
        itemId: impact.itemId,
        evidence: impact.evidence,
        delta,
        provenance,
      });
    }
  }
  return events;
}
