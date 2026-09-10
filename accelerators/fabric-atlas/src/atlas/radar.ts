import {
  buildGovernanceFindings,
  type GovernanceFinding,
  type GovernanceSeverity,
} from "./governance";
import {
  compareSnapshots,
  normalizeSensitivity,
  type AtlasChange,
  type AtlasHistory,
  type HistoricalSnapshot,
} from "./history";
import { sameDeploymentGeneration } from "./release";

export type FindingDeltaStatus = "new" | "resolved" | "persisting";

export interface FindingDelta {
  status: FindingDeltaStatus;
  finding: GovernanceFinding;
  snapshotId: string;
  since?: string;
  sinceSnapshotId?: string;
  sinceExact: boolean;
}

export type RadarRiskKind =
  | "external-grant-added"
  | "broad-grant-added"
  | "sensitivity-downgraded"
  | "lineage-broken"
  | "consumed-item-removed";

export interface RiskyChange {
  id: string;
  kind: RadarRiskKind;
  severity: "critical" | "high";
  change: AtlasChange;
  detail: string;
}

export type RadarResult =
  | { state: "insufficient-history"; missing: number }
  | { state: "loading"; missingSnapshotIds: string[] }
  | {
      state: "baseline";
      currentSnapshotId: string;
      previousSnapshotId?: string;
      deploymentId?: string;
      reason: "first-snapshot" | "deployment-changed";
    }
  | {
      state: "ready";
      currentSnapshotId: string;
      previousSnapshotId: string;
      deltas: FindingDelta[];
      riskyChanges: RiskyChange[];
      observedChanges: AtlasChange[];
      provenanceComplete: boolean;
    };

const STATUS_ORDER: Record<FindingDeltaStatus, number> = {
  new: 0,
  persisting: 1,
  resolved: 2,
};
const SEVERITY_ORDER: Record<GovernanceSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase();
}

export function diffFindings(
  previous: GovernanceFinding[],
  current: GovernanceFinding[],
  context: {
    currentSnapshotId: string;
    currentSyncedAt: string;
    previousSnapshotId: string;
    previousSyncedAt: string;
  },
): FindingDelta[] {
  const previousById = new Map(
    previous.map((finding) => [finding.id, finding]),
  );
  const currentById = new Map(current.map((finding) => [finding.id, finding]));
  const ids = [...new Set([...previousById.keys(), ...currentById.keys()])].sort();
  return ids
    .map((id): FindingDelta => {
      const before = previousById.get(id);
      const after = currentById.get(id);
      if (after && !before) {
        return {
          status: "new",
          finding: after,
          snapshotId: context.currentSnapshotId,
          since: context.currentSyncedAt,
          sinceSnapshotId: context.currentSnapshotId,
          sinceExact: true,
        };
      }
      if (after && before) {
        return {
          status: "persisting",
          finding: after,
          snapshotId: context.currentSnapshotId,
          since: context.previousSyncedAt,
          sinceSnapshotId: context.previousSnapshotId,
          sinceExact: false,
        };
      }
      return {
        status: "resolved",
        finding: before!,
        snapshotId: context.currentSnapshotId,
        since: context.previousSyncedAt,
        sinceSnapshotId: context.previousSnapshotId,
        sinceExact: false,
      };
    })
    .sort(
      (left, right) =>
        STATUS_ORDER[left.status] - STATUS_ORDER[right.status] ||
        SEVERITY_ORDER[left.finding.severity] -
          SEVERITY_ORDER[right.finding.severity] ||
        left.finding.category.localeCompare(right.finding.category) ||
        left.finding.id.localeCompare(right.finding.id),
    );
}

function changedDeployment(
  previous: string | undefined,
  current: string | undefined,
): boolean {
  return !sameDeploymentGeneration(previous, current);
}

function sensitivityRank(
  value: unknown,
  ranks: Readonly<Record<string, number>>,
): number | undefined {
  const normalized = normalizeSensitivity(value);
  if (!normalized) return undefined;
  const rank = ranks[normalize(normalized)];
  return Number.isFinite(rank) ? rank : undefined;
}

export function filterRiskyChanges(
  changes: AtlasChange[],
  previous: HistoricalSnapshot["catalog"],
  sensitivityRanks: Readonly<Record<string, number>> = {},
): RiskyChange[] {
  const risks: RiskyChange[] = [];
  for (const change of changes) {
    if (change.type === "access-grant-added") {
      const flag = normalize((change.after as { flag?: unknown } | undefined)?.flag);
      if (flag === "external" || flag === "broad") {
        risks.push({
          id: `risk:v1:${change.id}`,
          kind:
            flag === "external"
              ? "external-grant-added"
              : "broad-grant-added",
          severity: "high",
          change,
          detail: `${flag} access was added.`,
        });
      }
    } else if (change.type === "sensitivity-changed") {
      const before = sensitivityRank(change.before, sensitivityRanks);
      const after = sensitivityRank(change.after, sensitivityRanks);
      if (before != null && after != null && after < before) {
        risks.push({
          id: `risk:v1:${change.id}`,
          kind: "sensitivity-downgraded",
          severity: "high",
          change,
          detail: "Sensitivity protection was downgraded.",
        });
      }
    } else if (
      change.type === "lineage-broken-state-changed" &&
      change.after === true
    ) {
      risks.push({
        id: `risk:v1:${change.id}`,
        kind: "lineage-broken",
        severity: "critical",
        change,
        detail: "A lineage relationship became broken.",
      });
    } else if (
      change.type === "item-removed" &&
      change.itemFabricId &&
      previous.edges.some((edge) => edge.source === change.itemFabricId)
    ) {
      risks.push({
        id: `risk:v1:${change.id}`,
        kind: "consumed-item-removed",
        severity: "critical",
        change,
        detail: "An item with downstream consumers was removed.",
      });
    }
  }
  return risks.sort(
    (left, right) =>
      SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
      left.kind.localeCompare(right.kind) ||
      left.id.localeCompare(right.id),
  );
}

export function buildRadar(
  history: AtlasHistory,
  options: {
    minSeverity?: GovernanceSeverity;
    sensitivityRanks?: Readonly<Record<string, number>>;
  } = {},
): RadarResult {
  if (history.summaries.length === 0) {
    return {
      state: "insufficient-history",
      missing: 1,
    };
  }
  const [currentSummary, previousSummary] = history.summaries;
  const current = history.snapshots.find(
    (snapshot) => snapshot.snapshotId === currentSummary.snapshotId,
  );
  if (!current) {
    return {
      state: "loading",
      missingSnapshotIds: [currentSummary.snapshotId],
    };
  }
  if (!previousSummary) {
    return {
      state: "baseline",
      currentSnapshotId: current.snapshotId,
      deploymentId: currentSummary.deploymentId,
      reason: "first-snapshot",
    };
  }
  const previous = history.snapshots.find(
    (snapshot) => snapshot.snapshotId === previousSummary.snapshotId,
  );
  if (!previous) {
    return {
      state: "loading",
      missingSnapshotIds: [previousSummary.snapshotId],
    };
  }
  if (
    changedDeployment(
      previousSummary.deploymentId,
      currentSummary.deploymentId,
    )
  ) {
    return {
      state: "baseline",
      currentSnapshotId: current.snapshotId,
      previousSnapshotId: previous.snapshotId,
      deploymentId: currentSummary.deploymentId,
      reason: "deployment-changed",
    };
  }
  const threshold = SEVERITY_ORDER[options.minSeverity ?? "low"];
  const deltas = diffFindings(
    buildGovernanceFindings(previous.catalog),
    buildGovernanceFindings(current.catalog),
    {
      currentSnapshotId: current.snapshotId,
      currentSyncedAt: current.syncedAt,
      previousSnapshotId: previous.snapshotId,
      previousSyncedAt: previous.syncedAt,
    },
  ).filter(
    (delta) => SEVERITY_ORDER[delta.finding.severity] <= threshold,
  );
  const changes = compareSnapshots(previous, current);
  return {
    state: "ready",
    currentSnapshotId: current.snapshotId,
    previousSnapshotId: previous.snapshotId,
    deltas,
    riskyChanges: filterRiskyChanges(
      changes,
      previous.catalog,
      options.sensitivityRanks,
    ),
    observedChanges: changes,
    provenanceComplete: history.summaries.length === history.snapshots.length,
  };
}
