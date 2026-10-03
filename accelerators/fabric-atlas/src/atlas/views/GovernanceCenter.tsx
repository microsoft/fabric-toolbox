import {
  ArrowRight,
  CheckCircle2,
  CheckCheck,
  ChevronDown,
  Clock3,
  Download,
  FileClock,
  FilterX,
  Gauge,
  GitCompareArrows,
  History,
  Layers3,
  Radar as RadarIcon,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  VolumeX,
} from "lucide-react";
import * as Tabs from "@radix-ui/react-tabs";
import { lazy, Suspense, useEffect, useId, useMemo, useState } from "react";
import { SavedViewsMenu } from "../components/SavedViewsMenu";
import { TrendChart } from "../components/TrendChart";
import { GovernanceExceptionControl } from "../components/GovernanceExceptionControl";
import { GovernancePolicyEditor } from "../components/GovernancePolicyEditor";
import { HistoricalChangeDetails } from "../components/HistoricalChangeDetails";
import { ItemFamilyCoverageSection } from "../components/ItemFamilyCoverageSection";
import { RadarSignalTiles } from "../components/RadarSignalTiles";
import { ScoreMeter } from "../components/ScoreMeter";
import { scoreBand } from "../components/score-style";
import { POSTURE_LABELS } from "../components/posture-radar";
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
  groupRadarSignals,
  radarReviewHeadline,
  type RadarSignalId,
} from "../radar-signals";
import {
  buildRadar,
  radarEntries as buildRadarEntries,
  type FindingDelta,
  type RadarEntry,
  type RadarResult,
  type RiskyChange,
} from "../radar";
import type { IncidentDelta } from "../observability";
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
import { PoliciesAiSection } from "./PoliciesAi";
import { buildAiGovernanceInventory } from "../policies-ai";
import { groupFindingsByRule } from "../finding-groups";
import { PageHeader } from "../components/PageHeader";

const PostureRadar = lazy(() => import("../components/PostureRadar").then(
  (module) => ({ default: module.PostureRadar }),
));

const SEVERITY_META: Record<
  GovernanceSeverity,
  { label: string; className: string }
> = {
  critical: {
    label: "Critical",
    className:
      "border-signal-danger-foreground/20 bg-signal-danger-background text-signal-danger-foreground",
  },
  high: {
    label: "High",
    className:
      "border-signal-warning-foreground/20 bg-signal-warning-background text-signal-warning-foreground",
  },
  medium: {
    label: "Medium",
    className: "border-primary/30 bg-primary/10 text-brand-foreground",
  },
  low: {
    label: "Low",
    className: "border-border bg-muted text-muted-foreground",
  },
};

const RADAR_SIGNALS = [
  "Access",
  "Sensitivity",
  "Lineage",
  "Consumed removals",
  "Job failures",
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

function findingPillarFilter(value: unknown): string {
  return typeof value === "string" && ["access", "lineage", "operations"].includes(value) ? value : "";
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
    isPreview,
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
      : "posture");
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
    initialSection === "findings" ? findingPillarFilter(focus?.filters?.pillar) : "",
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
    initialSection === "posture" && typeof focus?.filters?.pillar === "string"
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
  const allRadarEntries = useMemo<RadarEntry[]>(
    () => buildRadarEntries(radar),
    [radar],
  );
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
      id: "posture",
      label: "Posture",
      detail: "Targets by governance pillar",
      count: currentPosture.pillars.filter(
        (pillar) => pillar.score != null && pillar.score < pillar.target,
      ).length,
      icon: Gauge,
    },
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
      id: "policies-ai",
      label: "Policies & AI",
      detail: "Observed metadata, not an exposure verdict",
      count: buildAiGovernanceInventory(data).length,
      icon: ShieldCheck,
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
      (filters.section ?? section) === "findings" ? findingPillarFilter(filters.pillar) : "",
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
    if ((filters.section ?? section) === "posture" && typeof filters.pillar === "string") {
      setPostureMetric(filters.pillar as PosturePillar);
    }
  };

  const priorityChanges = (
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
          if (entry.incident) {
            onNavigate({
              tab: "jobs",
              focus: focusRequest({
                itemId: entry.incident.incident.itemId,
                jobId: entry.incident.incident.id,
              }),
            });
          } else if (entry.delta) {
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
              incidents: radarEntries
                .map((entry) => entry.incident)
                .filter((incident): incident is IncidentDelta => !!incident),
            }),
            `fabric-atlas-radar-${currentSummary.syncedAt.slice(0, 10)}.md`,
          );
        }}
      />
  );
  return (
    <Tabs.Root value={section} onValueChange={(value) => setSection(value as GovernanceSection)} asChild>
    <div className="atlas-content-frame flex flex-col gap-l p-l sm:p-xxl">
      <Card className="min-w-0 overflow-hidden">
        <PageHeader title="Governance Center" purpose="Posture, findings and changes in this workspace."
          actions={<>
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
                  "rounded-md border px-s py-xs text-200 font-semibold",
                  hasNewPriorityAlert
                    ? "border-signal-warning-foreground/20 bg-signal-warning-background text-signal-warning-foreground"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                {hasNewPriorityAlert
                  ? `${allRadarEntries.length} new priority alert${allRadarEntries.length === 1 ? "" : "s"}`
                  : "No new priority alert"}
              </span>
          </>}
        />

        <Tabs.List
          aria-label="Governance Center sections"
          className="atlas-line-tabs border-t border-border bg-secondary/40"
        >
          {tabs.map(({ id, label, detail, count, icon: Icon }) => (
            <Tabs.Trigger key={id} value={id} asChild>
              <button
                type="button"
                onClick={() => setSection(id)}
                title={detail}
                className="atlas-line-tab grow focus-visible:ring-inset focus-visible:ring-offset-0"
              >
                <Icon className="icon-size-200" aria-hidden="true" />
                {label}
                <span className="sr-only"> ({count})</span>
              </button>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      <div className="p-m sm:p-l">
      {historyError && radarFailedSnapshotIds.length === 0 && (
        <div
          role="alert"
          className="rounded-xl border border-status-warning/30 bg-status-warning/10 px-l py-m text-300 text-status-warning"
        >
          Snapshot history could not be loaded: {historyError}
        </div>
      )}

      <Tabs.Content value="findings" asChild>
        <div>
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
        </div>
      </Tabs.Content>
      <Tabs.Content value="changes" asChild>
        <div>
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
        </div>
      </Tabs.Content>
      <Tabs.Content value="history" asChild>
        <div>
          <HistorySection
            summaries={history.trend}
            metric={historyMetric}
            loading={historyLoading}
            onMetric={setHistoryMetric}
          />
        </div>
      </Tabs.Content>
      <Tabs.Content value="coverage" asChild>
        <div>
          <CoverageSection
            diagnostics={coverage}
            historyLoading={historyLoading}
            syncSections={data.workspace.syncSections}
            snapshot={data}
          />
        </div>
      </Tabs.Content>
      <Tabs.Content value="posture" asChild>
        <div>
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
        </div>
      </Tabs.Content>
      <Tabs.Content value="policies-ai" asChild>
        <div>
          <PoliciesAiSection
            data={data}
            previous={historyIsCurrent ? history.snapshots.find((snapshot) => snapshot.snapshotId === canonicalSnapshotIds[1]) : undefined}
            current={historyIsCurrent ? history.snapshots.find((snapshot) => snapshot.snapshotId === canonicalSnapshotIds[0]) : undefined}
            historyLoading={historyLoading}
            historyError={historyError}
            isPreview={isPreview}
            onNavigate={onNavigate}
            onCompare={(previousId, currentId) => {
              setPreviousSnapshotId(previousId);
              setCurrentSnapshotId(currentId);
              setChangeSearch("");
              setChangeDomain("schema");
              setSection("changes");
            }}
          />
        </div>
      </Tabs.Content>
      </div>
      </Card>
      <details className="rounded-lg border border-border">
        <summary className="min-h-[var(--atlas-touch-target)] cursor-pointer px-l py-m text-300 font-semibold hover:bg-accent">
          Latest priority changes{allRadarEntries.length ? ` (${allRadarEntries.length})` : ""}
        </summary>
        {priorityChanges}
      </details>
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
  const signalGroups = useMemo(() => groupRadarSignals(entries), [entries]);
  const [openSignal, setOpenSignal] = useState<RadarSignalId>();
  const detailId = useId();
  const activeSignal = signalGroups.find((group) => group.id === openSignal);
  return (
    <Card className="overflow-hidden">
      <div className="atlas-page-header atlas-fabric-hero flex flex-col gap-m lg:flex-row lg:items-center">
        <span className="flex icon-size-600 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <RadarIcon className="icon-size-300" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <SectionLabel>Governance radar</SectionLabel>
          <h2 className="mt-xxs text-400 font-semibold">
            {firstSnapshotBaseline
              ? "Your governance baseline is ready"
              : ready
                ? radarReviewHeadline(entries.length)
                : "What became risky since the last sync"}
          </h2>
          {/* The first-snapshot baseline body already explains what happens next. */}
          {!firstSnapshotBaseline && (
            <p className="mt-xxs text-200 text-muted-foreground">
              {ready && entries.length > 0
                ? "Detected between the two latest validated snapshots. Review key signals below."
                : "New high-priority findings and dangerous access, sensitivity, lineage, removal or job failure changes only."}
            </p>
          )}
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
          <>
            <RadarSignalTiles
              groups={signalGroups}
              openId={activeSignal?.id}
              controlsId={detailId}
              onToggle={(id) =>
                setOpenSignal((current) => (current === id ? undefined : id))
              }
            />
            <div
              id={detailId}
              role={activeSignal ? "region" : undefined}
              aria-label={activeSignal ? `${activeSignal.title} to review` : undefined}
              hidden={!activeSignal}
              className="divide-y divide-border border-t border-border"
            >
              {activeSignal?.entries.map((entry) => (
                <div
                  key={entry.id}
                  className="atlas-row grid gap-m px-l lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-s">
                      <span
                        className={cn(
                          "rounded-full px-s py-xxs text-200 font-semibold capitalize",
                          entry.severity === "critical"
                            ? "bg-signal-danger-background text-signal-danger-foreground"
                            : "bg-signal-warning-background text-signal-warning-foreground",
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
          </>
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
  const targetsAvailable = !policyLoading && !policyError;

  return (
    <div className="flex flex-col gap-l">
      <Card className="overflow-hidden">
        <div className="atlas-fabric-hero flex flex-col gap-m border-b border-border p-l sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-500 font-semibold">
              {targetsAvailable ? `${atTarget} of ${current.pillars.length} pillars at target` : "Governance posture"}
            </h2>
            <p className="mt-xs text-200 text-muted-foreground">
              Select a pillar to inspect its score and trend. N/A is not zero or a compliant result.
            </p>
            {policyLoading && <p role="status" className="mt-s text-200 text-muted-foreground">Loading governance targets...</p>}
            {policyError && <p role="alert" className="mt-s text-200 text-signal-danger-foreground">{policyError} Targets are unavailable; raw scores remain visible.</p>}
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
        <div className="grid lg:grid-cols-2">
          <Suspense fallback={<div role="status" className="atlas-posture-chart flex items-center justify-center text-200 text-muted-foreground">Loading posture radar...</div>}>
            <PostureRadar pillars={current.pillars} selectedPillar={selectedPillar}
              targetsAvailable={targetsAvailable} onSelect={onPillar} />
          </Suspense>
          <div className="min-w-0 border-t border-border p-m lg:border-l lg:border-t-0">
          <div aria-label="Posture pillar selection" className="grid gap-xs sm:grid-cols-2">
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
                aria-pressed={selectedPillar === pillar.pillar}
                onClick={() => onPillar(pillar.pillar)}
                className={cn("min-h-[var(--atlas-touch-target)] rounded-md border p-m text-left hover:bg-accent",
                  selectedPillar === pillar.pillar ? "border-brand-foreground/40 bg-primary/5" : "border-transparent")}
              >
                <div className="flex items-center justify-between gap-s">
                  <span className="text-300 font-semibold">
                    {POSTURE_LABELS[pillar.pillar]}
                  </span>
                  <span className="atlas-score font-numeric text-400 font-semibold" data-score-band={scoreBand(pillar.score)}>
                    {pillar.score == null ? "N/A" : `${pillar.score}%`}
                  </span>
                </div>
                <div className="mt-s">
                  <ScoreMeter label={`${POSTURE_LABELS[pillar.pillar]} score`} value={pillar.score} />
                </div>
                <div className="mt-xs flex items-center justify-between text-200 text-muted-foreground">
                  <span>{targetsAvailable ? `Target ${pillar.target}%` : "Target unavailable"}</span>
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
          <section aria-label={`${POSTURE_LABELS[selectedPillar]} posture details`} className="mt-m border-t border-border p-m">
            <h3 className="text-300 font-semibold">{POSTURE_LABELS[selectedPillar]} evidence</h3>
            <p className="mt-xs text-200 leading-300 text-muted-foreground">
              {selected.score == null ? "No evaluable evidence for this pillar in the current snapshot."
                : selected.metrics.length ? "Score based on collected metadata coverage."
                  : `${selected.contributingFindings} findings contribute to this score.`}
            </p>
            <button type="button" className="atlas-control mt-s rounded-md px-s text-200 font-semibold text-brand-foreground hover:bg-accent"
              onClick={() => onNavigate(
                selectedPillar === "documentation" || selectedPillar === "ownership" || selectedPillar === "sensitivity"
                  ? { tab: "catalog", focus: focusRequest({ filters: { posturePillar: selectedPillar } }) }
                  : { tab: "governance", focus: focusRequest({ governanceSection: "findings", filters: { section: "findings", pillar: selectedPillar } }) },
              )}>
              Review {POSTURE_LABELS[selectedPillar].toLowerCase()} evidence
            </button>
          </section>
          </div>
        </div>
      </Card>

      <details className="rounded-lg border border-border bg-card">
        <summary className="cursor-pointer px-l py-m text-300 font-semibold">Configure governance targets</summary>
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
      </details>

      <Card className="overflow-hidden">
        <div className="border-b border-border bg-secondary/55 px-l py-m">
          <h3 className="text-300 font-semibold">
            {POSTURE_LABELS[selectedPillar]} trend
          </h3>
          <p className="text-200 text-muted-foreground">
            Fixed 0–100 scale · {targetsAvailable ? `target ${selected.target}%` : "target unavailable"}
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
              referenceValue={targetsAvailable ? selected.target : undefined}
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
  const activePreset = pillar || severity !== "all"
    ? undefined
    : !search && category === "all"
      ? "all"
      : search === "external access" && category === "access"
        ? "external"
        : !search && category === "metadata"
          ? "metadata"
          : search === "failed" && category === "operations"
            ? "failures"
            : undefined;
  const groups = useMemo(() => groupFindingsByRule(findings), [findings]);
  const [openRules, setOpenRules] = useState<Set<string>>(new Set());
  const listId = useId();
  const toggleRule = (rule: string) =>
    setOpenRules((current) => {
      const next = new Set(current);
      if (next.has(rule)) next.delete(rule);
      else next.add(rule);
      return next;
    });
  const findingActions = (finding: GovernanceFinding) => (
    <div className="flex flex-wrap items-center gap-s">
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
  );
  return (
    <div className="flex flex-col gap-l">
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
        <div className="atlas-toolbar flex flex-col gap-s border-b border-border bg-secondary/55 p-m">
          <div role="group" aria-label="Finding presets" className="flex flex-wrap gap-s">
            {([
              ["all", "All findings"],
              ["external", "External access"],
              ["metadata", "Metadata gaps"],
              ["failures", "Failed operations"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={activePreset === id}
                onClick={() => onPreset(id)}
                className={cn(
                  "atlas-control rounded-full border px-m text-200 font-semibold transition-colors",
                  activePreset === id
                    ? "border-primary/40 bg-primary/10 text-brand-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-s lg:flex-row lg:items-center">
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
        </div>
        <div className="flex items-center justify-between border-b border-border px-l py-m">
          <div>
            <h2 className="text-400 font-semibold">Action queue</h2>
            <p className="text-200 text-muted-foreground">
              {findings.length} of {total} findings · {groups.length}{" "}
              {groups.length === 1 ? "rule" : "rules"}
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
          <ul aria-label="Findings by rule" className="divide-y divide-border">
            {groups.map((group) => {
              const meta = SEVERITY_META[group.severity];
              const single = group.findings.length === 1 ? group.findings[0] : undefined;
              const open = !single && (Boolean(search) || openRules.has(group.rule));
              const regionId = `${listId}-${group.rule}`;
              return (
                <li key={group.rule} className="px-l py-m">
                  <div className="flex flex-col gap-s lg:flex-row lg:items-start lg:justify-between lg:gap-l">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-s">
                        <span
                          className={cn(
                            "rounded-md border px-s py-xxs text-200 font-semibold",
                            meta.className,
                          )}
                        >
                          {meta.label}
                        </span>
                        <span className="text-200 text-muted-foreground">
                          {CATEGORY_LABEL[group.category]}
                        </span>
                      </div>
                      <h3 className="mt-xs text-300 font-semibold">
                        {single ? single.title : `${group.label} · ${group.findings.length} findings`}
                      </h3>
                      {single && (
                        <p className="mt-xxs text-200 leading-300 text-muted-foreground">
                          {single.detail}
                        </p>
                      )}
                      <p className="mt-xxs text-200 leading-300 text-foreground">
                        {group.recommendation}
                      </p>
                    </div>
                    {single ? (
                      findingActions(single)
                    ) : (
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={regionId}
                        disabled={Boolean(search)}
                        onClick={() => toggleRule(group.rule)}
                        className="atlas-control inline-flex shrink-0 items-center gap-s self-start rounded-lg border border-border bg-card px-m text-200 font-semibold hover:bg-accent disabled:cursor-default"
                      >
                        <ChevronDown
                          className={cn("icon-size-100 transition-transform motion-reduce:transition-none", !open && "-rotate-90")}
                          aria-hidden="true"
                        />
                        {open ? "Hide findings" : `Show ${group.findings.length} findings`}
                      </button>
                    )}
                  </div>
                  {open && (
                    <ul
                      id={regionId}
                      aria-label={`${group.label} findings`}
                      className="mt-m divide-y divide-border rounded-lg border border-border"
                    >
                      {group.findings.map((finding) => (
                        <li
                          key={finding.id}
                          className="flex flex-col gap-s px-m py-s lg:flex-row lg:items-center lg:justify-between"
                        >
                          <div className="min-w-0">
                            <h4 className="text-300 font-semibold">{finding.title}</h4>
                            <p className="text-200 leading-300 text-muted-foreground">
                              {finding.detail}
                            </p>
                          </div>
                          {findingActions(finding)}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
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
                    "rounded-md border px-s py-xxs text-200 font-semibold",
                    changeTone(change),
                  )}
                >
                  {changeAction(change)}
                </span>
                <span className="text-200 font-semibold text-muted-foreground">
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
  snapshot,
}: {
  diagnostics: ReturnType<typeof getCoverageDiagnostics>;
  historyLoading: boolean;
  syncSections?: NonNullable<
    ReturnType<typeof useAtlas>["data"]["workspace"]["syncSections"]
  >;
  snapshot: Pick<ReturnType<typeof useAtlas>["data"], "items" | "jobs" | "workspace">;
}) {
  const sectionEntries = Object.entries(syncSections ?? {}).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  const [view, setView] = useState<"families" | "quality" | "sensitivity">("families");
  const missingValues = diagnostics.metrics.some((metric) => metric.state === "no-values");
  const viewTrigger =
    "atlas-control rounded-md px-m text-200 font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-inset focus-visible:ring-offset-0 data-[state=active]:bg-card data-[state=active]:text-brand-foreground data-[state=active]:shadow-fabric-2";
  return (
    <Tabs.Root
      value={view}
      onValueChange={(value) => setView(value as typeof view)}
      className="flex flex-col gap-l"
    >
      <Tabs.List
        aria-label="Coverage views"
        className="inline-flex max-w-full flex-wrap gap-xxs self-start rounded-lg border border-border bg-secondary p-xxs"
      >
        <Tabs.Trigger value="families" className={viewTrigger}>Item families</Tabs.Trigger>
        <Tabs.Trigger value="quality" className={viewTrigger}>Metadata quality</Tabs.Trigger>
        <Tabs.Trigger value="sensitivity" className={viewTrigger}>Sensitivity</Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="families" className="flex flex-col gap-l">
      <ItemFamilyCoverageSection data={snapshot} />
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
                    "rounded-full border px-s py-xxs text-200 font-semibold capitalize",
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
      </Tabs.Content>

      <Tabs.Content value="quality" className="flex flex-col gap-m">
      {missingValues && (
        <p role="note" className="text-200 leading-300 text-muted-foreground">
          &ldquo;No value returned&rdquo; may indicate unavailable metadata, not a
          confirmed governance failure.
        </p>
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
                    {metric.state === "no-values" && " · No value returned"}
                  </p>
                </div>
                <span
                  className="atlas-score rounded-md bg-secondary px-s py-xxs font-numeric text-200 font-semibold"
                  data-score-band={scoreBand(value)}
                >
                  {value == null ? "N/A" : `${value}%`}
                </span>
              </div>
              <div className="mt-m">
                <ScoreMeter label={`${metric.label} coverage`} value={value} />
              </div>
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
      </Tabs.Content>

      <Tabs.Content value="sensitivity">
        <SensitivityView embedded />
      </Tabs.Content>
    </Tabs.Root>
  );
}
