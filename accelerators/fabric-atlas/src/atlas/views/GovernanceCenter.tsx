import {
  Activity,
  ArrowRight,
  CheckCircle2,
  CheckCheck,
  Clock3,
  Download,
  FileClock,
  FilterX,
  Gauge,
  GitCompareArrows,
  History,
  KeyRound,
  Layers3,
  Radar as RadarIcon,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  VolumeX,
} from "lucide-react";
import * as Tabs from "@radix-ui/react-tabs";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { SavedViewsMenu } from "../components/SavedViewsMenu";
import { TrendChart } from "../components/TrendChart";
import { GovernanceExceptionControl } from "../components/GovernanceExceptionControl";
import { GovernancePolicyEditor } from "../components/GovernancePolicyEditor";
import { HistoricalChangeDetails } from "../components/HistoricalChangeDetails";
import { ATLAS_CONFIG } from "../config";
import {
  buildGovernanceFindings,
  getCoverageDiagnostics,
  type GovernanceCategory,
  type GovernanceFinding,
  type GovernanceSeverity,
} from "../governance";
import {
  compareSnapshots,
  snapshotCatalogFromData,
  type AtlasChange,
  type AtlasChangeDomain,
  type HistoricalSnapshot,
  type SnapshotSummary,
} from "../history";
import type {
  AtlasFocusRequest,
  AtlasNavigation,
  GovernanceSection,
} from "../navigation";
import type { SavedView, SavedViewFilters } from "../saved-views";
import {
  buildRadar,
  type FindingDelta,
  type RadarResult,
  type RiskyChange,
} from "../radar";
import type { FindingAcknowledgement } from "../finding-acks";
import type { GovernanceException } from "../governance-exceptions";
import { radarToMarkdown } from "../radar-markdown";
import {
  scorePosture,
  type PosturePillar,
  type PostureScore,
} from "../posture";
import { useAtlas } from "../store";
import { Card, SectionLabel, cn } from "../ui";
import { SensitivityView } from "./Sensitivity";

const SEVERITY_META: Record<
  GovernanceSeverity,
  { label: string; className: string; dot: string }
> = {
  critical: {
    label: "Critical",
    className:
      "border-status-failing/35 bg-status-failing/10 text-status-failing",
    dot: "bg-status-failing",
  },
  high: {
    label: "High",
    className:
      "border-status-warning/35 bg-status-warning/10 text-status-warning",
    dot: "bg-status-warning",
  },
  medium: {
    label: "Medium",
    className: "border-primary/30 bg-primary/10 text-brand-foreground",
    dot: "bg-primary",
  },
  low: {
    label: "Low",
    className:
      "border-lineage-neutral/30 bg-lineage-neutral/10 text-muted-foreground",
    dot: "bg-lineage-neutral",
  },
};

interface RadarEntry {
  id: string;
  severity: GovernanceSeverity;
  title: string;
  detail: string;
  occurrenceSnapshotId?: string;
  delta?: FindingDelta;
  risk?: RiskyChange;
}

const RADAR_SIGNALS = [
  "Access",
  "Sensitivity",
  "Lineage",
  "Consumed removals",
] as const;

function downloadMarkdown(content: string, filename: string): void {
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/markdown;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const CATEGORY_LABEL: Record<GovernanceCategory, string> = {
  access: "Access",
  metadata: "Metadata",
  operations: "Operations",
  lineage: "Lineage",
};

const CHANGE_DOMAIN_LABEL: Record<AtlasChangeDomain, string> = {
  item: "Items",
  schema: "Schema",
  access: "Access",
  sensitivity: "Sensitivity",
  lineage: "Lineage",
  job: "Jobs",
};

type HistoryMetric =
  | "items"
  | "labels"
  | "externalPrincipals"
  | "failedJobs"
  | "stale"
  | "failing"
  | "lineage"
  | "brokenEdges"
  | "tables"
  | "columns"
  | "measures";

const HISTORY_METRICS: Array<{
  id: HistoryMetric;
  label: string;
  description: string;
}> = [
  { id: "items", label: "Items", description: "Indexed Fabric items" },
  { id: "labels", label: "Labeled", description: "Items with sensitivity metadata" },
  {
    id: "externalPrincipals",
    label: "External principals",
    description: "Guests and explicit external identities",
  },
  { id: "failedJobs", label: "Failed jobs", description: "Failed recorded runs" },
  { id: "stale", label: "Stale items", description: "Items reported as stale" },
  { id: "failing", label: "Failing items", description: "Items reported as failing" },
  { id: "lineage", label: "Lineage edges", description: "Verified item relationships" },
  { id: "brokenEdges", label: "Broken edges", description: "Broken lineage relationships" },
  { id: "tables", label: "Tables", description: "Tables and views inventoried" },
  { id: "columns", label: "Columns", description: "Columns inventoried" },
  { id: "measures", label: "Measures", description: "Measures inventoried" },
];

function snapshotLabel(summary: SnapshotSummary): string {
  const date = new Date(summary.syncedAt);
  if (Number.isNaN(date.valueOf())) return summary.label;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function changeAction(change: AtlasChange): "Added" | "Removed" | "Changed" {
  if (change.type.endsWith("-added") || change.type === "job-new") return "Added";
  if (change.type.endsWith("-removed")) return "Removed";
  return "Changed";
}

function changeTone(change: AtlasChange): string {
  const action = changeAction(change);
  if (action === "Added") {
    return "border-status-healthy/30 bg-status-healthy/10 text-status-healthy";
  }
  if (action === "Removed") {
    return "border-status-failing/30 bg-status-failing/10 text-status-failing";
  }
  return "border-status-warning/30 bg-status-warning/10 text-status-warning";
}

function focusRequest(
  values: Omit<AtlasFocusRequest, "requestId">,
): AtlasFocusRequest {
  return { requestId: crypto.randomUUID(), ...values };
}

function navigationForFinding(finding: GovernanceFinding): AtlasNavigation {
  const target = finding.target;
  if (target?.kind === "principal") {
    return {
      tab: "access",
      focus: focusRequest({
        principalId: target.principalId,
        itemId: target.itemId,
      }),
    };
  }
  if (target?.kind === "job") {
    return {
      tab: "jobs",
      focus: focusRequest({
        itemId: target.itemId,
        jobId: target.jobId,
        query: finding.title,
      }),
    };
  }
  if (target?.kind === "edge") {
    return { tab: "map" };
  }
  if (target?.kind === "workspace") {
    return { tab: "access" };
  }
  return {
    tab: "catalog",
    focus: focusRequest({ itemId: finding.itemId }),
  };
}

export function GovernanceCenterView({
  focus,
  onNavigate,
  onStateChange,
}: {
  focus?: AtlasFocusRequest;
  onNavigate: (navigation: AtlasNavigation) => void;
  onStateChange?: (navigation: AtlasNavigation) => void;
}) {
  const {
    data,
    history,
    historyLoading,
    historyError,
    historyFailedSnapshotIds,
    savedViews,
    savedViewsLoading,
    savedViewsError,
    addSavedView,
    removeSavedView,
    loadHistorySnapshot,
    findingAcks,
    findingAcksLoading,
    findingAcksError,
    findingAckPendingIds,
    saveFindingAcknowledgement,
    removeFindingAcknowledgement,
    governanceTargets,
    governancePolicyLoading,
    governancePolicyError,
    governanceExceptions,
    governanceExceptionsLoading,
    governanceExceptionsError,
    governanceExceptionPendingIds,
    canSync,
    reloadGovernancePolicy,
    saveGovernanceTargets,
    resetGovernanceTargets,
    reloadGovernanceExceptions,
    saveGovernanceException,
    removeGovernanceException,
  } = useAtlas();
  const initialSection =
    focus?.governanceSection ??
    (typeof focus?.filters?.section === "string"
      ? (focus.filters.section as GovernanceSection)
      : "findings");
  const [section, setSection] = useState<GovernanceSection>(initialSection);
  const [findingSearch, setFindingSearch] = useState(
    typeof focus?.filters?.search === "string" ? focus.filters.search : "",
  );
  const [severity, setSeverity] = useState<GovernanceSeverity | "all">(
    typeof focus?.filters?.severity === "string"
      ? (focus.filters.severity as GovernanceSeverity)
      : "all",
  );
  const [category, setCategory] = useState<GovernanceCategory | "all">(
    typeof focus?.filters?.category === "string"
      ? (focus.filters.category as GovernanceCategory)
      : "all",
  );
  const [findingPillar, setFindingPillar] = useState(
    typeof focus?.filters?.pillar === "string" ? focus.filters.pillar : "",
  );
  const [changeSearch, setChangeSearch] = useState(
    typeof focus?.filters?.changeSearch === "string"
      ? focus.filters.changeSearch
      : "",
  );
  const [changeDomain, setChangeDomain] = useState<AtlasChangeDomain | "all">(
    typeof focus?.filters?.domain === "string"
      ? (focus.filters.domain as AtlasChangeDomain)
      : "all",
  );
  const [historyMetric, setHistoryMetric] = useState<HistoryMetric>(
    typeof focus?.filters?.metric === "string"
      ? (focus.filters.metric as HistoryMetric)
      : "items",
  );
  const [postureMetric, setPostureMetric] = useState<PosturePillar>(
    typeof focus?.filters?.pillar === "string"
      ? (focus.filters.pillar as PosturePillar)
      : "documentation",
  );
  const [currentSnapshotId, setCurrentSnapshotId] = useState<
    string | undefined
  >(
    typeof focus?.filters?.currentSnapshotId === "string"
      ? focus.filters.currentSnapshotId
      : undefined,
  );
  const [previousSnapshotId, setPreviousSnapshotId] = useState<
    string | undefined
  >(
    typeof focus?.filters?.previousSnapshotId === "string"
      ? focus.filters.previousSnapshotId
      : undefined,
  );

  const availableSnapshotIds = new Set(
    history.summaries.map((snapshot) => snapshot.snapshotId),
  );
  const effectiveCurrentSnapshotId =
    currentSnapshotId && availableSnapshotIds.has(currentSnapshotId)
      ? currentSnapshotId
      : history.summaries[0]?.snapshotId ?? "";
  const effectivePreviousSnapshotId =
    previousSnapshotId &&
    availableSnapshotIds.has(previousSnapshotId) &&
    previousSnapshotId !== effectiveCurrentSnapshotId
      ? previousSnapshotId
      : history.summaries.find(
          (snapshot) =>
            snapshot.snapshotId !== effectiveCurrentSnapshotId,
        )?.snapshotId ?? "";

  const findings = useMemo(() => buildGovernanceFindings(data), [data]);
  const coverage = useMemo(() => getCoverageDiagnostics(data), [data]);
  const filteredFindings = useMemo(() => {
    const query = findingSearch.trim().toLowerCase();
    return findings.filter(
      (finding) =>
        (severity === "all" || finding.severity === severity) &&
        (category === "all" || finding.category === category) &&
        (!findingPillar || finding.category === findingPillar) &&
        (!query ||
          finding.title.toLowerCase().includes(query) ||
          finding.detail.toLowerCase().includes(query) ||
          finding.recommendation.toLowerCase().includes(query)),
    );
  }, [category, findingPillar, findingSearch, findings, severity]);

  const historyIsCurrent =
    !data.workspace.snapshotId ||
    history.current?.snapshotId === data.workspace.snapshotId;
  const canonicalSnapshotIds = useMemo(
    () =>
      historyIsCurrent
        ? history.summaries
            .slice(0, 2)
            .map((summary) => summary.snapshotId)
        : [],
    [history.summaries, historyIsCurrent],
  );
  useEffect(() => {
    for (const snapshotId of canonicalSnapshotIds) {
      if (
        !history.snapshots.some(
          (snapshot) => snapshot.snapshotId === snapshotId,
        )
      ) {
        void loadHistorySnapshot(snapshotId);
      }
    }
  }, [canonicalSnapshotIds, history.snapshots, loadHistorySnapshot]);

  useEffect(() => {
    if (section !== "posture" || !historyIsCurrent) return;
    void (async () => {
      for (const summary of history.summaries) {
        if (
          !history.snapshots.some(
            (snapshot) => snapshot.snapshotId === summary.snapshotId,
          )
        ) {
          await loadHistorySnapshot(summary.snapshotId);
        }
      }
    })();
  }, [
    history.snapshots,
    history.summaries,
    historyIsCurrent,
    loadHistorySnapshot,
    section,
  ]);

  const radar = useMemo(
    () =>
      historyIsCurrent
        ? buildRadar(history, {
            minSeverity: "high",
            sensitivityRanks: ATLAS_CONFIG.sensitivityRanks,
          })
        : {
            state: "loading" as const,
            missingSnapshotIds: data.workspace.snapshotId
              ? [data.workspace.snapshotId]
              : [],
          },
    [data.workspace.snapshotId, history, historyIsCurrent],
  );
  const radarFailedSnapshotIds =
    radar.state === "loading"
      ? historyError && !historyLoading
        ? radar.missingSnapshotIds
        : radar.missingSnapshotIds.filter((snapshotId) =>
            historyFailedSnapshotIds.has(snapshotId),
          )
      : [];
  const acknowledgementByFinding = useMemo(
    () =>
      new Map(
        findingAcks.map((acknowledgement) => [
          acknowledgement.findingId,
          acknowledgement,
        ]),
      ),
    [findingAcks],
  );
  const allRadarEntries = useMemo<RadarEntry[]>(() => {
    if (radar.state !== "ready") return [];
    const findingsEntries = radar.deltas
      .filter((delta) => delta.status === "new")
      .map((delta) => ({
        id: delta.finding.id,
        severity: delta.finding.severity,
        title: delta.finding.title,
        detail: delta.finding.detail,
        occurrenceSnapshotId: delta.sinceSnapshotId,
        delta,
      }));
    const riskEntries = radar.riskyChanges.map((risk) => ({
      id: risk.id,
      severity: risk.severity,
      title: risk.change.label,
      detail: risk.detail,
      occurrenceSnapshotId: radar.currentSnapshotId,
      risk,
    }));
    return [...findingsEntries, ...riskEntries];
  }, [radar]);
  const radarEntries = useMemo(
    () =>
      allRadarEntries.filter((entry) => {
      const acknowledgement = acknowledgementByFinding.get(entry.id);
      return !(
        acknowledgement?.status === "muted" ||
        (acknowledgement?.status === "acked" &&
          acknowledgement.occurrenceSnapshotId ===
            entry.occurrenceSnapshotId)
      );
      }),
    [acknowledgementByFinding, allRadarEntries],
  );
  const suppressedRadarAcks = findingAcks.filter((acknowledgement) => {
    const entry = allRadarEntries.find(
      (candidate) => candidate.id === acknowledgement.findingId,
    );
    return (
      !!entry &&
      (acknowledgement.status === "muted" ||
        (acknowledgement.status === "acked" &&
          acknowledgement.occurrenceSnapshotId ===
            entry.occurrenceSnapshotId))
    );
  });

  const postureScores = useMemo(
    () =>
      new Map(
        history.snapshots.map((snapshot) => [
          snapshot.snapshotId,
          scorePosture(snapshot.catalog, governanceTargets),
        ]),
      ),
    [governanceTargets, history.snapshots],
  );
  const currentPosture = scorePosture(
    snapshotCatalogFromData(data),
    governanceTargets,
  );
  const previousPosture = historyIsCurrent
    ? postureScores.get(history.summaries[1]?.snapshotId ?? "")
    : undefined;

  const selectedCurrent = history.snapshots.find(
    (snapshot) => snapshot.snapshotId === effectiveCurrentSnapshotId,
  );
  const selectedPrevious = history.snapshots.find(
    (snapshot) => snapshot.snapshotId === effectivePreviousSnapshotId,
  );
  const comparisonLoading =
    section === "changes" &&
    !historyError &&
    Boolean(effectiveCurrentSnapshotId && effectivePreviousSnapshotId) &&
    (!selectedCurrent || !selectedPrevious);
  const comparisonNewer =
    selectedCurrent && selectedPrevious
      ? Date.parse(selectedCurrent.syncedAt) >=
        Date.parse(selectedPrevious.syncedAt)
        ? selectedCurrent
        : selectedPrevious
      : undefined;
  const comparisonOlder =
    selectedCurrent && selectedPrevious
      ? comparisonNewer === selectedCurrent
        ? selectedPrevious
        : selectedCurrent
      : undefined;

  useEffect(() => {
    if (section !== "changes") return;
    const missing = [
      effectiveCurrentSnapshotId,
      effectivePreviousSnapshotId,
    ].filter(
      (snapshotId) =>
        snapshotId &&
        !history.snapshots.some(
          (snapshot) => snapshot.snapshotId === snapshotId,
        ),
    );
    for (const snapshotId of missing) {
      void loadHistorySnapshot(snapshotId);
    }
  }, [
    effectiveCurrentSnapshotId,
    effectivePreviousSnapshotId,
    history.snapshots,
    loadHistorySnapshot,
    section,
  ]);
  const snapshotChanges = useMemo(() => {
    if (!comparisonNewer || !comparisonOlder) return [];
    return compareSnapshots(comparisonOlder, comparisonNewer);
  }, [comparisonNewer, comparisonOlder]);
  const filteredChanges = useMemo(() => {
    const query = changeSearch.trim().toLowerCase();
    return snapshotChanges.filter(
      (change) =>
        (changeDomain === "all" || change.domain === changeDomain) &&
        (!query ||
          change.label.toLowerCase().includes(query) ||
          change.type.toLowerCase().includes(query) ||
          (change.changedFields ?? []).some((field) =>
            field.toLowerCase().includes(query),
          )),
    );
  }, [changeDomain, changeSearch, snapshotChanges]);

  const coverageScore = Math.round(
    coverage.metrics
      .filter((metric) => metric.percentage != null)
      .reduce(
        (total, metric, _index, values) =>
          total + (metric.percentage ?? 0) / values.length,
        0,
      ),
  );
  const priorityFindings = findings.filter(
    (finding) =>
      finding.severity === "critical" || finding.severity === "high",
  ).length;
  const currentChanges =
    history.current == null
      ? 0
      : history.changes.filter(
          (change) => change.snapshotId === history.current?.snapshotId,
        ).length;
  const exceptionByFinding = useMemo(
    () =>
      new Map(
        governanceExceptions.map((exception) => [
          exception.findingId,
          exception,
        ]),
      ),
    [governanceExceptions],
  );
  const hasNewPriorityAlert =
    radar.state === "ready" && allRadarEntries.length > 0;
  const tabs: Array<{
    id: GovernanceSection;
    label: string;
    detail: string;
    count: number;
    icon: typeof ShieldCheck;
  }> = [
    {
      id: "findings",
      label: "Findings",
      detail: "Actionable governance checks",
      count: findings.length,
      icon: ShieldAlert,
    },
    {
      id: "changes",
      label: "Changes",
      detail: "Compare validated snapshots",
      count: currentChanges,
      icon: GitCompareArrows,
    },
    {
      id: "history",
      label: "History",
      detail: "Governance trends over time",
      count: history.summaries.length,
      icon: History,
    },
    {
      id: "coverage",
      label: "Coverage",
      detail: "Metadata and protection gaps",
      count: coverage.metrics.filter((metric) => metric.state !== "complete").length,
      icon: Layers3,
    },
    {
      id: "posture",
      label: "Posture",
      detail: "Targets by governance pillar",
      count: currentPosture.pillars.filter(
        (pillar) =>
          pillar.score != null && pillar.score < pillar.target,
      ).length,
      icon: Gauge,
    },
  ];

  const currentFilters = useMemo<SavedViewFilters>(
    () => {
      const filters: SavedViewFilters = { section };
      if (section === "findings") {
        filters.search = findingSearch;
        filters.severity = severity;
        filters.category = category;
        filters.pillar = findingPillar;
      } else if (section === "changes") {
        filters.changeSearch = changeSearch;
        filters.domain = changeDomain;
        filters.currentSnapshotId = effectiveCurrentSnapshotId;
        filters.previousSnapshotId = effectivePreviousSnapshotId;
      } else if (section === "history") {
        filters.metric = historyMetric;
      } else if (section === "posture") {
        filters.pillar = postureMetric;
      }
      return filters;
    },
    [
      category,
      changeDomain,
      changeSearch,
      findingSearch,
      findingPillar,
      historyMetric,
      postureMetric,
      effectiveCurrentSnapshotId,
      effectivePreviousSnapshotId,
      section,
      severity,
    ],
  );

  useEffect(() => {
    onStateChange?.({
      tab: "governance",
      focus: {
        requestId: "governance-view-state",
        governanceSection: section,
        filters: currentFilters,
      },
    });
  }, [currentFilters, onStateChange, section]);

  const applySavedView = (view: SavedView) => {
    const filters = view.filters;
    if (typeof filters.section === "string") {
      setSection(filters.section as GovernanceSection);
    }
    setFindingSearch(
      typeof filters.search === "string" ? filters.search : "",
    );
    setSeverity(
      typeof filters.severity === "string"
        ? (filters.severity as GovernanceSeverity)
        : "all",
    );
    setCategory(
      typeof filters.category === "string"
        ? (filters.category as GovernanceCategory)
        : "all",
    );
    setFindingPillar(
      typeof filters.pillar === "string" ? filters.pillar : "",
    );
    setChangeSearch(
      typeof filters.changeSearch === "string" ? filters.changeSearch : "",
    );
    setChangeDomain(
      typeof filters.domain === "string"
        ? (filters.domain as AtlasChangeDomain)
        : "all",
    );
    setCurrentSnapshotId(
      typeof filters.currentSnapshotId === "string"
        ? filters.currentSnapshotId
        : undefined,
    );
    setPreviousSnapshotId(
      typeof filters.previousSnapshotId === "string"
        ? filters.previousSnapshotId
        : undefined,
    );
    if (typeof filters.metric === "string") {
      setHistoryMetric(filters.metric as HistoryMetric);
    }
    if (typeof filters.pillar === "string") {
      setPostureMetric(filters.pillar as PosturePillar);
    }
  };

  return (
    <Tabs.Root
      value={section}
      onValueChange={(value) => setSection(value as GovernanceSection)}
      asChild
    >
    <div className="atlas-content-frame flex flex-col gap-l p-l sm:p-xxl">
      <RadarPanel
        radar={radar}
        entries={radarEntries}
        suppressed={suppressedRadarAcks}
        loading={findingAcksLoading}
        error={findingAcksError}
        historyLoading={historyLoading}
        failedSnapshotIds={radarFailedSnapshotIds}
        pendingIds={findingAckPendingIds}
        exceptions={exceptionByFinding}
        exceptionsLoading={governanceExceptionsLoading}
        exceptionsError={governanceExceptionsError}
        exceptionPendingIds={governanceExceptionPendingIds}
        canManageExceptions={canSync}
        onAcknowledge={(entry) =>
          saveFindingAcknowledgement({
            findingId: entry.id,
            occurrenceSnapshotId: entry.occurrenceSnapshotId,
            status: "acked",
          })
        }
        onMute={(entry) =>
          saveFindingAcknowledgement({
            findingId: entry.id,
            occurrenceSnapshotId: entry.occurrenceSnapshotId,
            status: "muted",
          })
        }
        onRestore={(id) => removeFindingAcknowledgement(id)}
        onSaveException={saveGovernanceException}
        onRemoveException={removeGovernanceException}
        onRetryExceptions={reloadGovernanceExceptions}
        onReviewChanges={() => {
          if (radar.state === "ready") {
            setCurrentSnapshotId(radar.currentSnapshotId);
            setPreviousSnapshotId(radar.previousSnapshotId);
          }
          setChangeSearch("");
          setChangeDomain("all");
          setSection("changes");
        }}
        onRetryHistory={() => {
          if (radar.state !== "loading") return;
          for (const snapshotId of radar.missingSnapshotIds) {
            void loadHistorySnapshot(snapshotId);
          }
        }}
        onOpen={(entry) => {
          if (entry.delta) {
            onNavigate(navigationForFinding(entry.delta.finding));
          } else if (entry.risk) {
            const change = entry.risk.change;
            const domain =
              entry.risk.kind === "lineage-broken"
                ? "lineage"
                : entry.risk.kind === "consumed-item-removed"
                  ? "item"
                  : entry.risk.kind === "sensitivity-downgraded"
                    ? "sensitivity"
                    : "access";
            onNavigate({
              tab: "governance",
              focus: focusRequest({
                governanceSection: "changes",
                filters: {
                  section: "changes",
                  domain,
                  changeSearch: change.label,
                },
              }),
            });
          }
        }}
        onDownload={() => {
          if (radar.state !== "ready") return;
          const currentSummary = history.summaries[0];
          const previousSummary = history.summaries[1];
          if (!currentSummary || !previousSummary) return;
          downloadMarkdown(
            radarToMarkdown({
              workspace: data.workspace.displayName,
              currentSummary,
              previousSummary,
              findings: radarEntries
                .map((entry) => entry.delta)
                .filter((delta): delta is FindingDelta => !!delta),
              riskyChanges: radarEntries
                .map((entry) => entry.risk)
                .filter((risk): risk is RiskyChange => !!risk),
            }),
            `fabric-atlas-radar-${currentSummary.syncedAt.slice(0, 10)}.md`,
          );
        }}
      />
      <Card className="overflow-hidden border-border shadow-fabric-4">
        <div className="atlas-page-header atlas-fabric-hero relative overflow-hidden">
          <div className="atlas-row relative flex flex-col gap-m lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-m">
              <span className="atlas-brand-mark flex icon-size-600 shrink-0 items-center justify-center rounded-xl text-primary-foreground">
                <ShieldCheck className="icon-size-300" aria-hidden="true" />
              </span>
              <div>
                <SectionLabel>Govern / workspace assurance</SectionLabel>
                <h1 className="mt-xxs font-heading text-500 font-bold leading-500">
                  Governance Center
                </h1>
                <p className="mt-xxs max-w-3xl text-200 text-muted-foreground">
                  {hasNewPriorityAlert
                    ? `${allRadarEntries.length} new priority alert${allRadarEntries.length === 1 ? "" : "s"} require review.`
                    : "No new priority alert. Governance details remain available below."}
                </p>
              </div>
            </div>
            <div className="atlas-toolbar flex flex-wrap items-center gap-s">
              <SavedViewsMenu
                views={savedViews.filter(
                  (view) => view.section === "governance",
                )}
                loading={savedViewsLoading}
                error={savedViewsError}
                activeSection="governance"
                currentFilters={currentFilters}
                onCreate={addSavedView}
                onApply={applySavedView}
                onDelete={removeSavedView}
              />
              <span
                className={cn(
                  "rounded-full border px-m py-s text-200 font-semibold",
                  hasNewPriorityAlert
                    ? "border-status-warning/30 bg-status-warning/10 text-status-warning"
                    : "border-status-healthy/30 bg-status-healthy/10 text-status-healthy",
                )}
              >
                {hasNewPriorityAlert
                  ? `${allRadarEntries.length} new priority alert${allRadarEntries.length === 1 ? "" : "s"}`
                  : "No new priority alert"}
              </span>
            </div>
          </div>

          <details className="relative mt-m rounded-lg border border-border bg-background/65">
            <summary className="cursor-pointer px-m py-s text-200 font-semibold text-primary">
              Workspace governance summary
            </summary>
            <div className="grid grid-cols-2 gap-s border-t border-border p-m lg:grid-cols-4">
              {[
                {
                  label: "Open findings",
                  value: findings.length,
                  detail: `${priorityFindings} high priority`,
                },
                {
                  label: "Latest changes",
                  value: currentChanges,
                  detail: history.summaries.length > 1 ? "Since previous sync" : "Needs two snapshots",
                },
                {
                  label: "Coverage",
                  value: `${coverageScore}%`,
                  detail: "Across available metadata",
                },
                {
                  label: "History",
                  value: history.summaries.length,
                  detail: "Validated snapshots",
                },
              ].map((metric) => (
                <div key={metric.label} className="rounded-lg bg-secondary/60 p-m">
                  <div className="font-numeric text-400 font-bold">
                    {metric.value}
                  </div>
                  <div className="text-200 font-semibold">{metric.label}</div>
                  <div className="mt-xxs text-100 text-muted-foreground">
                    {metric.detail}
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>

        <Tabs.List
          aria-label="Governance Center sections"
          className="grid gap-s border-t border-border bg-secondary/55 p-s sm:grid-cols-2 xl:grid-cols-5"
        >
          {tabs.map(({ id, label, detail, count, icon: Icon }) => (
            <Tabs.Trigger key={id} value={id} asChild>
              <button
                type="button"
                onClick={() => setSection(id)}
                className={cn(
                  "flex items-center gap-m rounded-xl border px-m py-s text-left transition-colors",
                  section === id
                    ? "border-primary/45 bg-primary/10 text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:bg-card hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex icon-size-600 shrink-0 items-center justify-center rounded-xl",
                    section === id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="icon-size-200" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-s">
                    <span className="text-300 font-semibold">{label}</span>
                    <span className="rounded-full bg-card px-s py-xxs font-numeric text-100">
                      {count}
                    </span>
                  </span>
                  <span className="mt-xxs block truncate text-200">{detail}</span>
                </span>
              </button>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Card>

      {historyError && radarFailedSnapshotIds.length === 0 && (
        <div
          role="alert"
          className="rounded-xl border border-status-warning/30 bg-status-warning/10 px-l py-m text-300 text-status-warning"
        >
          Snapshot history could not be loaded: {historyError}
        </div>
      )}

      <Tabs.Content value="findings" asChild>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
        >
          <FindingsSection
            findings={filteredFindings}
            total={findings.length}
            search={findingSearch}
            severity={severity}
            category={category}
            pillar={findingPillar}
            onSearch={setFindingSearch}
            onSeverity={setSeverity}
            onCategory={setCategory}
            onClearPillar={() => setFindingPillar("")}
            onNavigate={(finding) =>
              onNavigate(navigationForFinding(finding))
            }
            exceptions={exceptionByFinding}
            exceptionsLoading={governanceExceptionsLoading}
            exceptionPendingIds={governanceExceptionPendingIds}
            canManageExceptions={canSync}
            onSaveException={saveGovernanceException}
            onRemoveException={removeGovernanceException}
            onPreset={(preset) => {
              setFindingPillar("");
              if (preset === "external") {
                setFindingSearch("external access");
                setCategory("access");
                setSeverity("all");
              } else if (preset === "metadata") {
                setFindingSearch("");
                setCategory("metadata");
                setSeverity("all");
              } else if (preset === "failures") {
                setFindingSearch("failed");
                setCategory("operations");
                setSeverity("all");
              } else {
                setFindingSearch("");
                setCategory("all");
                setSeverity("all");
              }
            }}
          />
        </motion.div>
      </Tabs.Content>
      <Tabs.Content value="changes" asChild>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
        >
          <ChangesSection
            changes={filteredChanges}
            total={snapshotChanges.length}
            snapshots={history.summaries}
            currentSnapshotId={effectiveCurrentSnapshotId}
            previousSnapshotId={effectivePreviousSnapshotId}
            search={changeSearch}
            domain={changeDomain}
            loading={historyLoading || comparisonLoading}
            historyError={historyError}
            failedSnapshotIds={historyFailedSnapshotIds}
            loadedSnapshots={history.snapshots}
            loadHistorySnapshot={loadHistorySnapshot}
            comparisonCurrentSnapshotId={
              comparisonNewer?.snapshotId ?? effectiveCurrentSnapshotId
            }
            comparisonPreviousSnapshotId={
              comparisonOlder?.snapshotId ?? effectivePreviousSnapshotId
            }
            onCurrentSnapshot={setCurrentSnapshotId}
            onPreviousSnapshot={setPreviousSnapshotId}
            onSearch={setChangeSearch}
            onDomain={setChangeDomain}
          />
        </motion.div>
      </Tabs.Content>
      <Tabs.Content value="history" asChild>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
        >
          <HistorySection
            summaries={history.trend}
            metric={historyMetric}
            loading={historyLoading}
            onMetric={setHistoryMetric}
          />
        </motion.div>
      </Tabs.Content>
      <Tabs.Content value="coverage" asChild>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
        >
          <CoverageSection
            diagnostics={coverage}
            historyLoading={historyLoading}
            syncSections={data.workspace.syncSections}
          />
        </motion.div>
      </Tabs.Content>
      <Tabs.Content value="posture" asChild>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
        >
          <PostureSection
            current={currentPosture}
            previous={previousPosture}
            scores={postureScores}
            summaries={history.trend}
            selectedPillar={postureMetric}
            loading={historyLoading}
            policyLoading={governancePolicyLoading}
            policyError={governancePolicyError}
            canEditPolicy={canSync}
            onRetryPolicy={reloadGovernancePolicy}
            onSaveTargets={saveGovernanceTargets}
            onResetTargets={resetGovernanceTargets}
            onPillar={setPostureMetric}
            onNavigate={onNavigate}
          />
        </motion.div>
      </Tabs.Content>
    </div>
    </Tabs.Root>
  );
}

export function RadarPanel({
  radar,
  entries,
  suppressed,
  loading,
  error,
  historyLoading,
  failedSnapshotIds,
  pendingIds,
  exceptions = new Map<string, GovernanceException>(),
  exceptionsLoading = false,
  exceptionsError,
  exceptionPendingIds = new Set<string>(),
  canManageExceptions = false,
  onAcknowledge,
  onMute,
  onRestore,
  onSaveException = async () => undefined,
  onRemoveException = async () => undefined,
  onRetryExceptions = async () => undefined,
  onReviewChanges,
  onRetryHistory,
  onOpen,
  onDownload,
}: {
  radar: RadarResult;
  entries: RadarEntry[];
  suppressed: FindingAcknowledgement[];
  loading: boolean;
  error?: string;
  historyLoading: boolean;
  failedSnapshotIds: string[];
  pendingIds: Set<string>;
  exceptions?: ReadonlyMap<string, GovernanceException>;
  exceptionsLoading?: boolean;
  exceptionsError?: string;
  exceptionPendingIds?: Set<string>;
  canManageExceptions?: boolean;
  onAcknowledge: (entry: RadarEntry) => Promise<void>;
  onMute: (entry: RadarEntry) => Promise<void>;
  onRestore: (id: string) => Promise<void>;
  onSaveException?: (input: {
    findingId: string;
    reason: string;
    expiresAt: string;
  }) => Promise<void>;
  onRemoveException?: (id: string) => Promise<void>;
  onRetryExceptions?: () => Promise<void>;
  onReviewChanges: () => void;
  onRetryHistory: () => void;
  onOpen: (entry: RadarEntry) => void;
  onDownload: () => void;
}) {
  const ready = radar.state === "ready";
  const firstSnapshotBaseline =
    radar.state === "baseline" && radar.reason === "first-snapshot";
  return (
    <Card className="overflow-hidden border-primary/25 shadow-fabric-4">
      <div className="atlas-page-header atlas-fabric-hero flex flex-col gap-m lg:flex-row lg:items-center">
        <span className="flex icon-size-600 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <RadarIcon className="icon-size-300" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <SectionLabel>Governance radar</SectionLabel>
          <h2 className="mt-xxs text-400 font-semibold">
            {firstSnapshotBaseline
              ? "Your governance baseline is ready"
              : "What became risky since the last sync"}
          </h2>
          <p className="mt-xxs text-200 text-muted-foreground">
            {firstSnapshotBaseline
              ? "The first validated snapshot arms the Radar; the next sync will produce risk deltas."
              : "New high-priority findings and dangerous access, sensitivity, lineage or removal changes only."}
          </p>
        </div>
        {ready && entries.length > 0 && (
          <button
            type="button"
            onClick={onDownload}
            className="atlas-control inline-flex items-center justify-center gap-s rounded-lg border border-border bg-card px-m font-semibold hover:bg-accent"
          >
            <Download className="icon-size-100" />
            Export digest
          </button>
        )}
      </div>

      <div className="border-t border-border bg-card">
        {error && (
          <div
            role="alert"
            className="border-b border-status-warning/25 bg-status-warning/10 px-l py-s text-200 text-status-warning"
          >
            Personal acknowledgements are unavailable; Radar remains fully
            visible. {error}
          </div>
        )}
        {exceptionsError && (
          <div
            role="alert"
            className="flex flex-col gap-s border-b border-status-warning/25 bg-status-warning/10 px-l py-s text-200 text-status-warning sm:flex-row sm:items-center"
          >
            <span className="min-w-0 flex-1">
              Shared governance exceptions are unavailable; findings remain
              visible. {exceptionsError}
            </span>
            <button
              type="button"
              disabled={exceptionsLoading}
              onClick={() => void onRetryExceptions().catch(() => undefined)}
              className="atlas-control rounded-lg border border-border bg-card px-m font-semibold hover:bg-accent disabled:opacity-50"
            >
              Retry exceptions
            </button>
          </div>
        )}
        {exceptionsLoading && ready && !exceptionsError && (
          <div
            role="status"
            className="border-b border-border bg-secondary/50 px-l py-s text-100 text-muted-foreground"
          >
            Loading shared governance exceptions...
          </div>
        )}
        {loading && ready && (
          <div className="border-b border-border bg-secondary/50 px-l py-s text-100 text-muted-foreground">
            Loading personal acknowledgement state…
          </div>
        )}
        {radar.state === "insufficient-history" ? (
          <div className="p-l text-200 text-muted-foreground">
            A first validated snapshot is required to arm Radar.
          </div>
        ) : radar.state === "loading" && failedSnapshotIds.length > 0 ? (
          <div
            role="alert"
            className="flex flex-col gap-m p-l sm:flex-row sm:items-center"
          >
            <ShieldAlert className="icon-size-300 shrink-0 text-status-warning" />
            <div className="min-w-0 flex-1">
              <div className="text-300 font-semibold">
                The latest governance comparison is unavailable
              </div>
              <p className="mt-xs text-200 text-muted-foreground">
                Radar will not substitute a non-adjacent snapshot because that
                could hide or misdate a risky change.
              </p>
            </div>
            <button
              type="button"
              disabled={historyLoading}
              onClick={onRetryHistory}
              className="atlas-control inline-flex items-center justify-center gap-s rounded-lg border border-border bg-card px-m font-semibold hover:bg-accent disabled:opacity-50"
            >
              <RotateCcw className="icon-size-100" />
              {historyLoading ? "Retrying…" : "Retry comparison"}
            </button>
          </div>
        ) : radar.state === "loading" ? (
          <div role="status" className="p-l text-200 text-muted-foreground">
            Loading the latest governance comparison…
          </div>
        ) : radar.state === "baseline" ? (
          <RadarTargetState
            mode="baseline"
            title="Baseline established"
            description={
              radar.reason === "first-snapshot"
                ? "This first validated snapshot is now the reference. The next sync will measure new high-priority regressions."
                : "The deployment changed, so this snapshot is the new safe reference. The next sync will establish comparable deltas."
            }
          />
        ) : entries.length === 0 && suppressed.length === 0 ? (
          <RadarTargetState
            mode="clear"
            title="No new high-priority regression detected"
            description="The latest adjacent snapshots meet the Radar goal across the signals it evaluates."
            observedChangeCount={radar.observedChanges.length}
            onReviewChanges={onReviewChanges}
          />
        ) : entries.length === 0 ? (
          <div className="flex items-center gap-s p-l text-200 text-muted-foreground">
            <CheckCheck className="icon-size-200 text-primary" />
            All current high-priority regressions are acknowledged or muted.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="atlas-row grid gap-m px-l lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-s">
                    <span
                      className={cn(
                        "rounded-full px-s py-xxs text-100 font-semibold uppercase",
                        entry.severity === "critical"
                          ? "bg-status-failing/10 text-status-failing"
                          : "bg-status-warning/10 text-status-warning",
                      )}
                    >
                      {entry.severity}
                    </span>
                    <span className="truncate text-300 font-semibold">
                      {entry.title}
                    </span>
                  </div>
                  <p className="mt-xs text-200 text-muted-foreground">
                    {entry.detail}
                  </p>
                </div>
                <div className="flex flex-wrap gap-s">
                  <GovernanceExceptionControl
                    findingId={entry.id}
                    findingTitle={entry.title}
                    exception={exceptions.get(entry.id)}
                    canEdit={canManageExceptions}
                    loading={exceptionsLoading}
                    pending={exceptionPendingIds.has(entry.id)}
                    onSave={onSaveException}
                    onRemove={onRemoveException}
                  />
                  <button
                    type="button"
                    onClick={() => onOpen(entry)}
                    className="atlas-control rounded-lg border border-border px-m font-semibold hover:bg-accent"
                  >
                    Open evidence
                  </button>
                  <button
                    type="button"
                    disabled={loading || pendingIds.has(entry.id)}
                    onClick={() =>
                      void onAcknowledge(entry).catch(() => undefined)
                    }
                    className="atlas-control inline-flex items-center gap-s rounded-lg border border-status-healthy/30 bg-status-healthy/10 px-m font-semibold text-status-healthy disabled:opacity-50"
                  >
                    <CheckCheck className="icon-size-100" />
                    Acknowledge
                  </button>
                  <button
                    type="button"
                    disabled={loading || pendingIds.has(entry.id)}
                    onClick={() =>
                      void onMute(entry).catch(() => undefined)
                    }
                    className="atlas-control inline-flex items-center gap-s rounded-lg border border-border px-m font-semibold text-muted-foreground hover:bg-accent disabled:opacity-50"
                  >
                    <VolumeX className="icon-size-100" />
                    Mute
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {suppressed.length > 0 && (
          <div className="atlas-row flex flex-wrap items-center gap-s border-t border-border bg-secondary/50 px-l">
            <span className="text-200 text-muted-foreground">
              {suppressed.length} hidden radar item
              {suppressed.length === 1 ? "" : "s"}
            </span>
            {suppressed.map((acknowledgement) => (
              <button
                key={acknowledgement.id}
                type="button"
                disabled={
                  loading || pendingIds.has(acknowledgement.findingId)
                }
                onClick={() =>
                  void onRestore(acknowledgement.id).catch(
                    () => undefined,
                  )
                }
                className="atlas-control rounded-full border border-border bg-card px-s text-100 font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
              >
                Restore {acknowledgement.findingId.slice(0, 18)}
              </button>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function RadarTargetState({
  mode,
  title,
  description,
  observedChangeCount = 0,
  onReviewChanges,
}: {
  mode: "baseline" | "clear";
  title: string;
  description: string;
  observedChangeCount?: number;
  onReviewChanges?: () => void;
}) {
  const baseline = mode === "baseline";
  const StatusIcon = baseline ? Clock3 : CheckCircle2;
  const titleClass = baseline ? "text-primary" : "text-status-healthy";
  const signalClass = baseline
    ? "inline-flex items-center gap-xs rounded-full border border-primary/20 bg-primary/5 px-s py-xs text-100 font-semibold text-primary"
    : "inline-flex items-center gap-xs rounded-full border border-status-healthy/20 bg-status-healthy/5 px-s py-xs text-100 font-semibold text-status-healthy";

  return (
    <div className="p-m">
      <div className="max-w-3xl">
        <div className="flex items-center gap-s text-300 font-semibold">
          <StatusIcon className={`icon-size-200 ${titleClass}`} />
          <span className={titleClass}>{title}</span>
        </div>
        <p className="mt-xs text-200 text-muted-foreground">{description}</p>
        <details className="mt-s">
          <summary className="cursor-pointer text-200 font-semibold text-primary">
            Radar details
          </summary>
          <div
            aria-label="Radar monitored signals"
            className="mt-m flex flex-wrap gap-s"
          >
            {RADAR_SIGNALS.map((signal) => (
              <span key={signal} className={signalClass}>
                <StatusIcon className="icon-size-100" />
                {signal}
              </span>
            ))}
          </div>
        </details>
        {!baseline && observedChangeCount > 0 && onReviewChanges && (
          <div className="mt-m flex flex-col gap-s rounded-lg border border-border bg-secondary/70 p-m sm:flex-row sm:items-center">
            <FileClock className="icon-size-200 shrink-0 text-primary" />
            <p className="min-w-0 flex-1 text-200 text-muted-foreground">
              {observedChangeCount} workspace change
              {observedChangeCount === 1 ? "" : "s"} detected; none matched
              Radar&apos;s high-priority rules.
            </p>
            <button
              type="button"
              onClick={onReviewChanges}
              className="atlas-control shrink-0 rounded-lg border border-border bg-card px-m font-semibold text-primary hover:bg-primary/10"
            >
              Review changes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const POSTURE_LABELS: Record<PosturePillar, string> = {
  documentation: "Documentation",
  ownership: "Ownership",
  sensitivity: "Sensitivity",
  access: "Access",
  lineage: "Lineage",
  operations: "Operations",
};

function PostureSection({
  current,
  previous,
  scores,
  summaries,
  selectedPillar,
  loading,
  policyLoading,
  policyError,
  canEditPolicy,
  onRetryPolicy,
  onSaveTargets,
  onResetTargets,
  onPillar,
  onNavigate,
}: {
  current: PostureScore;
  previous?: PostureScore;
  scores: Map<string, PostureScore>;
  summaries: SnapshotSummary[];
  selectedPillar: PosturePillar;
  loading: boolean;
  policyLoading: boolean;
  policyError?: string;
  canEditPolicy: boolean;
  onRetryPolicy: () => Promise<void>;
  onSaveTargets: (
    targets: Record<PosturePillar, number>,
  ) => Promise<void>;
  onResetTargets: () => Promise<void>;
  onPillar: (pillar: PosturePillar) => void;
  onNavigate: (navigation: AtlasNavigation) => void;
}) {
  const atTarget = current.pillars.filter(
    (pillar) => pillar.score != null && pillar.score >= pillar.target,
  ).length;
  const selected = current.pillars.find(
    (pillar) => pillar.pillar === selectedPillar,
  )!;
  const trend = summaries.map((summary) => ({
    label: snapshotLabel(summary),
    value:
      scores
        .get(summary.snapshotId)
        ?.pillars.find((pillar) => pillar.pillar === selectedPillar)
        ?.score ?? null,
  }));

  return (
    <div className="flex flex-col gap-l">
      <Card className="overflow-hidden">
        <div className="atlas-fabric-hero flex flex-col gap-m border-b border-border p-l sm:flex-row sm:items-end sm:justify-between">
          <div>
            <SectionLabel>Posture targets</SectionLabel>
            <h2 className="mt-xs text-500 font-semibold">
              {atTarget} of {current.pillars.length} pillars at target
            </h2>
            <p className="mt-xs text-200 text-muted-foreground">
              Standard baseline: 70% for each pillar. Non-applicable evidence
              is never counted as zero.
            </p>
          </div>
          <label>
            <span className="sr-only">Posture trend pillar</span>
            <select
              value={selectedPillar}
              onChange={(event) =>
                onPillar(event.target.value as PosturePillar)
              }
              className="atlas-control rounded-lg border border-input bg-card px-m"
            >
              {current.pillars.map((pillar) => (
                <option key={pillar.pillar} value={pillar.pillar}>
                  {POSTURE_LABELS[pillar.pillar]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-s p-l sm:grid-cols-2 xl:grid-cols-3">
          {current.pillars.map((pillar) => {
            const before = previous?.pillars.find(
              (candidate) => candidate.pillar === pillar.pillar,
            )?.score;
            const delta =
              pillar.score != null && before != null
                ? pillar.score - before
                : null;
            return (
              <button
                key={pillar.pillar}
                type="button"
                onClick={() =>
                  onNavigate(
                    pillar.pillar === "documentation" ||
                      pillar.pillar === "ownership" ||
                      pillar.pillar === "sensitivity"
                      ? {
                          tab: "catalog",
                          focus: focusRequest({
                            filters: {
                              posturePillar: pillar.pillar,
                            },
                          }),
                        }
                      : {
                          tab: "governance",
                          focus: focusRequest({
                            governanceSection: "findings",
                            filters: {
                              section: "findings",
                              pillar: pillar.pillar,
                            },
                          }),
                        },
                  )
                }
                className="rounded-xl border border-border bg-card p-m text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="flex items-center justify-between gap-s">
                  <span className="text-300 font-semibold">
                    {POSTURE_LABELS[pillar.pillar]}
                  </span>
                  <span className="font-numeric text-400 font-bold">
                    {pillar.score == null ? "N/A" : `${pillar.score}%`}
                  </span>
                </div>
                <div className="mt-m h-s overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      pillar.score == null
                        ? "bg-lineage-neutral"
                        : pillar.score >= pillar.target
                          ? "bg-status-healthy"
                          : "bg-status-warning",
                    )}
                    style={{ width: `${pillar.score ?? 0}%` }}
                  />
                </div>
                <div className="mt-s flex items-center justify-between text-100 text-muted-foreground">
                  <span>Target {pillar.target}%</span>
                  <span>
                    {delta == null
                      ? "No delta"
                      : `${delta >= 0 ? "+" : ""}${delta} pts`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <GovernancePolicyEditor
        key={current.pillars
          .map((pillar) => `${pillar.pillar}:${pillar.target}`)
          .join("|")}
        targets={Object.fromEntries(
          current.pillars.map((pillar) => [pillar.pillar, pillar.target]),
        ) as Record<PosturePillar, number>}
        loading={policyLoading}
        error={policyError}
        canEdit={canEditPolicy}
        onRetry={onRetryPolicy}
        onSave={onSaveTargets}
        onReset={onResetTargets}
      />

      <Card className="overflow-hidden">
        <div className="border-b border-border bg-secondary/55 px-l py-m">
          <h3 className="text-300 font-semibold">
            {POSTURE_LABELS[selectedPillar]} trend
          </h3>
          <p className="text-200 text-muted-foreground">
            Fixed 0–100 scale · target {selected.target}%
          </p>
        </div>
        {loading ? (
          <div className="flex min-h-72 items-center justify-center text-200 text-muted-foreground">
            Evaluating historical catalogs…
          </div>
        ) : (
          <div className="p-m">
            <TrendChart
              title={`${POSTURE_LABELS[selectedPillar]} posture history`}
              data={trend}
              valueLabel={(value) => `${value}%`}
              maxValue={100}
              referenceValue={selected.target}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

function FindingsSection({
  findings,
  total,
  search,
  severity,
  category,
  pillar,
  onSearch,
  onSeverity,
  onCategory,
  onClearPillar,
  onNavigate,
  onPreset,
  exceptions,
  exceptionsLoading,
  exceptionPendingIds,
  canManageExceptions,
  onSaveException,
  onRemoveException,
}: {
  findings: GovernanceFinding[];
  total: number;
  search: string;
  severity: GovernanceSeverity | "all";
  category: GovernanceCategory | "all";
  pillar: string;
  onSearch: (value: string) => void;
  onSeverity: (value: GovernanceSeverity | "all") => void;
  onCategory: (value: GovernanceCategory | "all") => void;
  onClearPillar: () => void;
  onNavigate: (finding: GovernanceFinding) => void;
  onPreset: (value: "all" | "external" | "metadata" | "failures") => void;
  exceptions: ReadonlyMap<string, GovernanceException>;
  exceptionsLoading: boolean;
  exceptionPendingIds: Set<string>;
  canManageExceptions: boolean;
  onSaveException: (input: {
    findingId: string;
    reason: string;
    expiresAt: string;
  }) => Promise<void>;
  onRemoveException: (id: string) => Promise<void>;
}) {
  const activeFilters =
    search || severity !== "all" || category !== "all" || pillar;
  return (
    <div className="flex flex-col gap-l">
      <div className="grid gap-s sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["all", "All findings", ShieldCheck],
          ["external", "External access", KeyRound],
          ["metadata", "Metadata gaps", Layers3],
          ["failures", "Failed operations", Activity],
        ].map(([id, label, Icon]) => (
          <button
            key={id as string}
            type="button"
            onClick={() =>
              onPreset(id as "all" | "external" | "metadata" | "failures")
            }
            className="flex items-center gap-m rounded-xl border border-border bg-card p-m text-left hover:border-primary/40 hover:bg-primary/5"
          >
            <span className="flex icon-size-600 items-center justify-center rounded-xl bg-primary/10 text-brand-foreground">
              <Icon className="icon-size-200" aria-hidden="true" />
            </span>
            <span className="text-300 font-semibold">{label as string}</span>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {pillar && (
          <div className="flex items-center justify-between gap-m border-b border-border bg-primary/5 px-l py-s">
            <span className="text-200 font-semibold text-brand-foreground">
              Posture pillar:{" "}
              {POSTURE_LABELS[pillar as PosturePillar] ?? pillar}
            </span>
            <button
              type="button"
              onClick={onClearPillar}
              className="atlas-control rounded-lg px-s text-200 font-semibold text-primary hover:bg-primary/10"
            >
              Clear pillar
            </button>
          </div>
        )}
        <div className="atlas-toolbar flex flex-col gap-s border-b border-border bg-secondary/55 p-m lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search governance findings</span>
            <Search className="icon-size-200 pointer-events-none absolute left-m top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Search finding, evidence or recommendation"
              className="atlas-control w-full rounded-lg border border-input bg-card pl-xxxl pr-m"
            />
          </label>
          <select
            aria-label="Filter findings by severity"
            value={severity}
            onChange={(event) =>
              onSeverity(event.target.value as GovernanceSeverity | "all")
            }
            className="atlas-control rounded-lg border border-input bg-card px-m"
          >
            <option value="all">All severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select
            aria-label="Filter findings by category"
            value={category}
            onChange={(event) =>
              onCategory(event.target.value as GovernanceCategory | "all")
            }
            className="atlas-control rounded-lg border border-input bg-card px-m"
          >
            <option value="all">All categories</option>
            <option value="access">Access</option>
            <option value="metadata">Metadata</option>
            <option value="operations">Operations</option>
            <option value="lineage">Lineage</option>
          </select>
          {activeFilters && (
            <button
              type="button"
              onClick={() => onPreset("all")}
              className="atlas-control inline-flex items-center gap-s rounded-lg px-m font-semibold text-primary hover:bg-primary/10"
            >
              <FilterX className="icon-size-100" />
              Reset
            </button>
          )}
        </div>
        <div className="flex items-center justify-between border-b border-border px-l py-m">
          <div>
            <h2 className="text-400 font-semibold">Action queue</h2>
            <p className="text-200 text-muted-foreground">
              {findings.length} of {total} findings
            </p>
          </div>
        </div>
        {findings.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-xl py-xxxl text-center">
            <CheckCircle2
              className="icon-size-600 text-status-healthy"
              aria-hidden="true"
            />
            <h3 className="mt-m text-400 font-semibold">
              No matching finding
            </h3>
            <p className="mt-xs text-300 text-muted-foreground">
              The current filters do not contain an action to review.
            </p>
          </div>
        ) : (
          <div className="grid gap-s p-s xl:grid-cols-2">
            {findings.map((finding) => {
              const meta = SEVERITY_META[finding.severity];
              return (
                <article
                  key={finding.id}
                  className="flex flex-col rounded-xl border border-border bg-card p-m"
                >
                  <div className="flex items-start gap-m">
                    <span className={`mt-xs h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-s">
                        <span
                          className={cn(
                            "rounded-md border px-s py-xxs text-100 font-semibold uppercase tracking-wide",
                            meta.className,
                          )}
                        >
                          {meta.label}
                        </span>
                        <span className="text-100 font-semibold uppercase tracking-wide text-muted-foreground">
                          {CATEGORY_LABEL[finding.category]}
                        </span>
                      </div>
                      <h3 className="mt-s text-300 font-semibold">
                        {finding.title}
                      </h3>
                      <p className="mt-xs text-200 leading-300 text-muted-foreground">
                        {finding.detail}
                      </p>
                    </div>
                  </div>
                  <div className="mt-m rounded-lg bg-secondary px-m py-s text-200 text-muted-foreground">
                    {finding.recommendation}
                  </div>
                  <div className="atlas-row mt-m flex flex-wrap items-center gap-s">
                    <button
                      type="button"
                      onClick={() => onNavigate(finding)}
                      className="atlas-control inline-flex items-center gap-s px-s font-semibold text-primary hover:underline"
                    >
                      Open evidence
                      <ArrowRight className="icon-size-100" />
                    </button>
                    <GovernanceExceptionControl
                      findingId={finding.id}
                      findingTitle={finding.title}
                      exception={exceptions.get(finding.id)}
                      canEdit={canManageExceptions}
                      loading={exceptionsLoading}
                      pending={exceptionPendingIds.has(finding.id)}
                      onSave={onSaveException}
                      onRemove={onRemoveException}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function ChangesSection({
  changes,
  total,
  snapshots,
  currentSnapshotId,
  previousSnapshotId,
  search,
  domain,
  loading,
  historyError,
  failedSnapshotIds,
  loadedSnapshots,
  loadHistorySnapshot,
  comparisonCurrentSnapshotId,
  comparisonPreviousSnapshotId,
  onCurrentSnapshot,
  onPreviousSnapshot,
  onSearch,
  onDomain,
}: {
  changes: AtlasChange[];
  total: number;
  snapshots: SnapshotSummary[];
  currentSnapshotId: string;
  previousSnapshotId: string;
  search: string;
  domain: AtlasChangeDomain | "all";
  loading: boolean;
  historyError?: string;
  failedSnapshotIds: Set<string>;
  loadedSnapshots: HistoricalSnapshot[];
  loadHistorySnapshot: (snapshotId: string) => Promise<void>;
  comparisonCurrentSnapshotId: string;
  comparisonPreviousSnapshotId: string;
  onCurrentSnapshot: (value: string) => void;
  onPreviousSnapshot: (value: string) => void;
  onSearch: (value: string) => void;
  onDomain: (value: AtlasChangeDomain | "all") => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-m border-b border-border bg-secondary/55 p-m lg:grid-cols-[1fr_1fr_auto]">
        <label>
          <span className="mb-xs block text-200 font-semibold text-muted-foreground">
            Newer snapshot
          </span>
          <select
            value={currentSnapshotId}
            onChange={(event) => onCurrentSnapshot(event.target.value)}
            className="atlas-control w-full rounded-lg border border-input bg-card px-m"
          >
            {snapshots.map((snapshot) => (
              <option key={snapshot.snapshotId} value={snapshot.snapshotId}>
                {snapshotLabel(snapshot)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-xs block text-200 font-semibold text-muted-foreground">
            Baseline snapshot
          </span>
          <select
            value={previousSnapshotId}
            onChange={(event) => onPreviousSnapshot(event.target.value)}
            className="atlas-control w-full rounded-lg border border-input bg-card px-m"
          >
            {snapshots.map((snapshot) => (
              <option key={snapshot.snapshotId} value={snapshot.snapshotId}>
                {snapshotLabel(snapshot)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <div className="rounded-lg border border-primary/25 bg-primary/10 px-l py-s">
            <div className="font-numeric text-400 font-bold">{total}</div>
            <div className="text-100 uppercase tracking-wide text-muted-foreground">
              changes
            </div>
          </div>
        </div>
      </div>

      <div className="atlas-toolbar flex flex-col gap-s border-b border-border p-m sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search snapshot changes</span>
          <Search className="icon-size-200 pointer-events-none absolute left-m top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search item, schema object or changed field"
            className="atlas-control w-full rounded-lg border border-input bg-card pl-xxxl pr-m"
          />
        </label>
        <select
          aria-label="Filter changes by domain"
          value={domain}
          onChange={(event) =>
            onDomain(event.target.value as AtlasChangeDomain | "all")
          }
          className="atlas-control rounded-lg border border-input bg-card px-m"
        >
          <option value="all">All domains</option>
          {Object.entries(CHANGE_DOMAIN_LABEL).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex min-h-64 items-center justify-center gap-s text-300 text-muted-foreground">
          <Clock3 className="icon-size-200 animate-pulse" />
          Loading validated snapshot history
        </div>
      ) : snapshots.length < 2 ? (
        <div className="flex min-h-64 flex-col items-center justify-center px-xl py-xxxl text-center">
          <FileClock className="icon-size-600 text-muted-foreground" />
          <h3 className="mt-m text-400 font-semibold">
            A second snapshot is required
          </h3>
          <p className="mt-xs text-300 text-muted-foreground">
            Run another synchronization to compare workspace changes.
          </p>
        </div>
      ) : changes.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center px-xl py-xxxl text-center">
          <CheckCircle2 className="icon-size-600 text-status-healthy" />
          <h3 className="mt-m text-400 font-semibold">
            No matching change
          </h3>
          <p className="mt-xs text-300 text-muted-foreground">
            These snapshots are identical for the selected filter.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {changes.map((change) => (
            <article
              key={change.id}
              className="atlas-row grid gap-m px-l hover:bg-accent/40 lg:grid-cols-[150px_minmax(0,1fr)_auto]"
            >
              <div className="flex flex-wrap items-start gap-s">
                <span
                  className={cn(
                    "rounded-md border px-s py-xxs text-100 font-semibold uppercase tracking-wide",
                    changeTone(change),
                  )}
                >
                  {changeAction(change)}
                </span>
                <span className="text-100 font-semibold uppercase tracking-wide text-muted-foreground">
                  {CHANGE_DOMAIN_LABEL[change.domain]}
                </span>
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-300 font-semibold">
                  {change.label}
                </h3>
                <p className="mt-xs text-200 text-muted-foreground">
                  {change.changedFields?.length
                    ? `Changed: ${change.changedFields.join(", ")}`
                    : change.type.replaceAll("-", " ")}
                </p>
              </div>
              <HistoricalChangeDetails
                change={change}
                previousSnapshotId={comparisonPreviousSnapshotId}
                currentSnapshotId={comparisonCurrentSnapshotId}
                snapshots={loadedSnapshots}
                historyLoading={loading}
                historyError={historyError}
                failedSnapshotIds={failedSnapshotIds}
                loadHistorySnapshot={loadHistorySnapshot}
              />
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}

function HistorySection({
  summaries,
  metric,
  loading,
  onMetric,
}: {
  summaries: SnapshotSummary[];
  metric: HistoryMetric;
  loading: boolean;
  onMetric: (value: HistoryMetric) => void;
}) {
  const selectedMetric =
    HISTORY_METRICS.find((candidate) => candidate.id === metric) ??
    HISTORY_METRICS[0];
  const chartData = summaries.map((summary) => ({
    label: snapshotLabel(summary),
    value: Number(summary[metric] ?? 0),
  }));

  return (
    <div className="grid gap-l xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-m border-b border-border bg-secondary/55 px-l py-m sm:flex-row sm:items-end sm:justify-between">
          <div>
            <SectionLabel>Validated snapshot trend</SectionLabel>
            <h2 className="mt-xs text-400 font-semibold">
              {selectedMetric.label}
            </h2>
            <p className="mt-xs text-200 text-muted-foreground">
              {selectedMetric.description}
            </p>
          </div>
          <label>
            <span className="sr-only">History metric</span>
            <select
              value={metric}
              onChange={(event) =>
                onMetric(event.target.value as HistoryMetric)
              }
              className="atlas-control rounded-lg border border-input bg-card px-m"
            >
              {HISTORY_METRICS.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {loading ? (
          <div className="flex min-h-72 items-center justify-center gap-s text-300 text-muted-foreground">
            <Clock3 className="icon-size-200 animate-pulse" />
            Loading history
          </div>
        ) : summaries.length === 0 ? (
          <div className="flex min-h-72 items-center justify-center text-300 text-muted-foreground">
            No validated snapshot history is available.
          </div>
        ) : (
          <div className="p-m">
            <TrendChart
              title={`${selectedMetric.label} across validated snapshots`}
              data={chartData}
              valueLabel={(value) => String(value)}
            />
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border bg-secondary/55 px-l py-m">
          <h2 className="text-400 font-semibold">Snapshot ledger</h2>
          <p className="text-200 text-muted-foreground">
            Newest first · up to {ATLAS_CONFIG.snapshotRetentionCount} retained
          </p>
        </div>
        <div className="max-h-[520px] divide-y divide-border overflow-y-auto">
          {[...summaries].reverse().map((snapshot, index) => (
            <div key={snapshot.snapshotId} className="px-l py-m">
              <div className="flex items-center justify-between gap-m">
                <div>
                  <div className="text-300 font-semibold">
                    {snapshotLabel(snapshot)}
                  </div>
                  <div className="mt-xxs font-mono text-100 text-muted-foreground">
                    {snapshot.snapshotId.slice(0, 12)}
                  </div>
                </div>
                {index === 0 && (
                  <span className="rounded-full border border-status-healthy/30 bg-status-healthy/10 px-s py-xxs text-100 font-semibold text-status-healthy">
                    Current
                  </span>
                )}
              </div>
              <div className="mt-s grid grid-cols-3 gap-s text-center">
                {[
                  ["Items", snapshot.items],
                  ["Labels", snapshot.labels],
                  ["Failures", snapshot.failedJobs + snapshot.failing],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-secondary px-s py-xs">
                    <div className="font-numeric text-300 font-bold">{value}</div>
                    <div className="text-100 text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function CoverageSection({
  diagnostics,
  historyLoading,
  syncSections,
}: {
  diagnostics: ReturnType<typeof getCoverageDiagnostics>;
  historyLoading: boolean;
  syncSections?: NonNullable<
    ReturnType<typeof useAtlas>["data"]["workspace"]["syncSections"]
  >;
}) {
  const sectionEntries = Object.entries(syncSections ?? {}).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  return (
    <div className="flex flex-col gap-l">
      {sectionEntries.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-border bg-secondary/55 px-l py-m">
            <h2 className="text-400 font-semibold">Collection status</h2>
            <p className="text-200 text-muted-foreground">
              Authoritative status returned by the latest UDF contract.
            </p>
          </div>
          <div className="grid gap-s p-s sm:grid-cols-2 xl:grid-cols-4">
            {sectionEntries.map(([name, section]) => (
              <div
                key={name}
                className="flex items-center justify-between gap-m rounded-lg border border-border bg-card px-m py-s"
              >
                <span className="truncate text-200 font-semibold capitalize">
                  {name.replaceAll(/([a-z])([A-Z])/g, "$1 $2")}
                </span>
                <span
                  className={cn(
                    "rounded-full border px-s py-xxs text-100 font-semibold uppercase tracking-wide",
                    section.status === "complete"
                      ? "border-status-healthy/30 bg-status-healthy/10 text-status-healthy"
                      : section.status === "failed"
                        ? "border-status-failing/30 bg-status-failing/10 text-status-failing"
                        : "border-border bg-muted text-muted-foreground",
                  )}
                  title={section.code}
                >
                  {section.status}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-m sm:grid-cols-2 xl:grid-cols-3">
        {diagnostics.metrics.map((metric) => {
          const value =
            metric.percentage == null ? null : Math.round(metric.percentage);
          return (
            <Card key={metric.id} className="overflow-hidden p-l">
              <div className="flex items-start justify-between gap-m">
                <div>
                  <h2 className="text-300 font-semibold">{metric.label}</h2>
                  <p className="mt-xs text-200 text-muted-foreground">
                    {metric.denominator
                      ? `${metric.numerator} of ${metric.denominator}`
                      : "Not applicable to the current inventory"}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full border px-s py-xxs font-numeric text-200 font-semibold",
                    metric.state === "complete"
                      ? "border-status-healthy/30 bg-status-healthy/10 text-status-healthy"
                      : metric.state === "not-applicable"
                        ? "border-border bg-muted text-muted-foreground"
                        : "border-status-warning/30 bg-status-warning/10 text-status-warning",
                  )}
                >
                  {value == null ? "N/A" : `${value}%`}
                </span>
              </div>
              <div className="mt-m h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    metric.state === "complete"
                      ? "bg-status-healthy"
                      : "bg-primary",
                  )}
                  style={{ width: `${value ?? 0}%` }}
                />
              </div>
              {metric.state === "no-values" && (
                <p className="mt-s text-200 text-muted-foreground">
                  No value was returned. This may indicate unavailable metadata,
                  not a confirmed governance failure.
                </p>
              )}
            </Card>
          );
        })}
      </div>

      {historyLoading && (
        <div className="flex items-center gap-s rounded-xl border border-border bg-card px-l py-m text-200 text-muted-foreground">
          <Clock3 className="icon-size-100 animate-pulse" />
          Historical coverage is still loading.
        </div>
      )}

      <SensitivityView embedded />
    </div>
  );
}
