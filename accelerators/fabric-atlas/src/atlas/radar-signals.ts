import type { GovernanceCategory, GovernanceSeverity } from "./governance";
import type { RadarEntry, RadarRiskKind } from "./radar";

export type RadarSignalId =
  | RadarRiskKind
  | "job-failure"
  | `finding-${GovernanceCategory}`
  | "other";

/** Radar entries of one signal, summarized for the Radar tile row. */
export interface RadarSignalGroup {
  id: RadarSignalId;
  title: string;
  summary: string;
  /** Most severe entry in the group. */
  severity: GovernanceSeverity;
  entries: RadarEntry[];
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

const SIGNALS: Record<
  RadarSignalId,
  { title: (count: number) => string; summary: (count: number) => string }
> = {
  "external-grant-added": {
    title: (count) => (count === 1 ? "New external grant" : "New external grants"),
    summary: (count) => `${plural(count, "grant")} to external principals`,
  },
  "broad-grant-added": {
    title: () => "New broad access",
    summary: (count) => `${plural(count, "grant")} to broad groups`,
  },
  "sensitivity-downgraded": {
    title: () => "Sensitivity downgraded",
    summary: (count) => `${plural(count, "item")} with a lower label`,
  },
  "lineage-broken": {
    title: () => "Lineage broken",
    summary: (count) => `${plural(count, "relationship")} became broken`,
  },
  "consumed-item-removed": {
    title: (count) =>
      count === 1 ? "Consumed item removed" : "Consumed items removed",
    summary: (count) => `${plural(count, "removed item")} had consumers`,
  },
  "job-failure": {
    title: (count) => (count === 1 ? "New job failure" : "New job failures"),
    summary: (count) => `${plural(count, "item")} failing since the last sync`,
  },
  "finding-access": {
    title: (count) => (count === 1 ? "New access finding" : "New access findings"),
    summary: (count) => plural(count, "high-priority finding"),
  },
  "finding-metadata": {
    title: (count) =>
      count === 1 ? "New metadata finding" : "New metadata findings",
    summary: (count) => plural(count, "high-priority finding"),
  },
  "finding-operations": {
    title: (count) =>
      count === 1 ? "New operations finding" : "New operations findings",
    summary: (count) => plural(count, "high-priority finding"),
  },
  "finding-lineage": {
    title: (count) =>
      count === 1 ? "New lineage finding" : "New lineage findings",
    summary: (count) => plural(count, "high-priority finding"),
  },
  other: {
    title: () => "Other review items",
    summary: (count) => `${plural(count, "item")} to review`,
  },
};

/** Tile order inside one severity: exposure first, then integrity, then operations. */
const SIGNAL_ORDER: RadarSignalId[] = [
  "external-grant-added",
  "broad-grant-added",
  "sensitivity-downgraded",
  "consumed-item-removed",
  "lineage-broken",
  "job-failure",
  "finding-access",
  "finding-metadata",
  "finding-lineage",
  "finding-operations",
  "other",
];

const SEVERITY_RANK: Record<GovernanceSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Entries whose source is unknown are kept visible under "other", never guessed. */
export function radarSignalOf(entry: RadarEntry): RadarSignalId {
  const id: string = entry.risk
    ? entry.risk.kind
    : entry.incident
      ? "job-failure"
      : entry.delta
        ? `finding-${entry.delta.finding.category}`
        : "other";
  return id in SIGNALS ? (id as RadarSignalId) : "other";
}

/**
 * Groups actionable Radar entries into one tile per signal. Counts are the
 * entries themselves; nothing is estimated. Groups are ordered by their most
 * severe entry, then by a fixed signal order.
 */
export function groupRadarSignals(
  entries: readonly RadarEntry[],
): RadarSignalGroup[] {
  const byId = new Map<RadarSignalId, RadarEntry[]>();
  for (const entry of entries) {
    const id = radarSignalOf(entry);
    const group = byId.get(id);
    if (group) group.push(entry);
    else byId.set(id, [entry]);
  }
  return [...byId.entries()]
    .map(([id, grouped]) => ({
      id,
      title: SIGNALS[id].title(grouped.length),
      summary: SIGNALS[id].summary(grouped.length),
      severity: grouped.reduce<GovernanceSeverity>(
        (worst, entry) =>
          SEVERITY_RANK[entry.severity] < SEVERITY_RANK[worst]
            ? entry.severity
            : worst,
        "low",
      ),
      entries: grouped,
    }))
    .sort(
      (left, right) =>
        SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
        SIGNAL_ORDER.indexOf(left.id) - SIGNAL_ORDER.indexOf(right.id),
    );
}

export function radarReviewHeadline(count: number): string {
  if (count === 0) return "No change needs review";
  return count === 1 ? "1 change needs review" : `${count} changes need review`;
}
