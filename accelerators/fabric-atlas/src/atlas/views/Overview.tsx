import { lazy, Suspense, useMemo } from "react";
import type {
  AtlasNavigation,
  Tab,
} from "@/atlas/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Clock3,
  LockKeyhole,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useAtlas } from "../store";
import {
  buildAccessReviewRows,
  getCoverageDiagnostics,
} from "../governance";
import { Card, TypeGlyph, cn } from "../ui";
import {
  typeMeta,
  relativeTime,
  schemaFor,
  type ItemType,
  type JobStatus,
} from "../model";
import { snapshotCatalogFromData } from "../history";
import { scorePosture, type PosturePillar } from "../posture";
import { workspaceDetailLabel } from "../workspace-display";
import { summarizeHealth } from "../health-summary";
import { ScoreMeter } from "../components/ScoreMeter";
import { scoreBand } from "../components/score-style";
import { PageHeader } from "../components/PageHeader";

const PostureRadar = lazy(() => import("../components/PostureRadar").then(
  (module) => ({ default: module.PostureRadar }),
));

const JOB_TONE: Record<JobStatus, string> = {
  completed: "bg-status-healthy",
  failed: "bg-status-failing",
  running: "bg-primary",
  cancelled: "bg-lineage-neutral",
};

export function OverviewView({
  onOpen,
}: {
  onOpen: (target: Tab | AtlasNavigation) => void;
}) {
  const {
    data,
    history,
    lastSyncedAt,
    governanceTargets,
    governancePolicyLoading,
    governancePolicyError,
  } = useAtlas();
  const targetsAvailable = !governancePolicyLoading && !governancePolicyError;
  const { items, principals, jobs, syncRuns, grants, edges } = data;

  const health = useMemo(() => summarizeHealth(items), [items]);

  const byType = useMemo(() => {
    const counts = new Map<ItemType, number>();
    items.forEach((item) => {
      counts.set(item.itemType, (counts.get(item.itemType) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const recentJobs = useMemo(
    () =>
      [...jobs]
        .sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt))
        .slice(0, 4),
    [jobs],
  );

  const latestSync = useMemo(
    () =>
      [...syncRuns].sort(
        (a, b) =>
          +new Date(b.finishedAt ?? b.startedAt) -
          +new Date(a.finishedAt ?? a.startedAt),
      )[0],
    [syncRuns],
  );
  const historyCurrent = history.current;
  const historyAligned =
    !data.workspace.snapshotId ||
    historyCurrent?.snapshotId === data.workspace.snapshotId;
  const currentCatalog =
    historyCurrent && historyAligned
      ? historyCurrent.catalog
      : undefined;
  const posture = useMemo(
    () =>
      scorePosture(
        currentCatalog ?? snapshotCatalogFromData(data),
        governanceTargets,
      ),
    [currentCatalog, data, governanceTargets],
  );
  const previousSnapshotId = historyAligned
    ? history.summaries[1]?.snapshotId
    : history.summaries[0]?.snapshotId;
  const previousCatalog = history.snapshots.find(
    (snapshot) => snapshot.snapshotId === previousSnapshotId,
  )?.catalog;
  const previousPosture = useMemo(() => {
    return previousCatalog ? scorePosture(previousCatalog, governanceTargets) : undefined;
  }, [previousCatalog, governanceTargets]);
  const postureAtTarget = posture.pillars.filter(
    (pillar) => pillar.score != null && pillar.score >= pillar.target,
  ).length;
  const largestGap = targetsAvailable
    ? posture.pillars
        .flatMap((pillar) => pillar.score == null || pillar.score >= pillar.target
          ? []
          : [{ pillar: pillar.pillar, gap: pillar.target - pillar.score }])
        .sort((a, b) => b.gap - a.gap)[0]
    : undefined;

  function openPosture(pillar?: PosturePillar) {
    onOpen({
      tab: "governance",
      focus: {
        requestId: crypto.randomUUID(),
        governanceSection: "posture",
        ...(pillar ? { filters: { pillar } } : {}),
      },
    });
  }

  const assetCount = useMemo(
    () =>
      items.reduce((total, item) => {
        const schema = schemaFor(data, item.fabricId);
        return (
          total +
          (schema?.reduce(
            (schemaTotal, table) =>
              schemaTotal + 1 + table.columns.length + table.measures.length,
            0,
          ) ?? 0)
        );
      }, 0),
    [data, items],
  );

  const maxType = Math.max(...byType.map(([, count]) => count), 1);
  const confidentialLabels = new Set(["confidential", "highly confidential"]);
  const confidential = items.filter((item) =>
    confidentialLabels.has((item.sensitivity ?? "").toLowerCase()),
  );
  const coverageDiagnostics = useMemo(
    () => getCoverageDiagnostics(data),
    [data],
  );
  const endorsementCoverage = coverageDiagnostics.byId.endorsement;
  const sensitivityCoverage = coverageDiagnostics.byId.sensitivity;
  const ownerCoverage = coverageDiagnostics.byId.owners;
  const external = principals.filter((principal) => principal.external);
  const accessRows = useMemo(() => buildAccessReviewRows(data), [data]);
  const itemOnly = new Set(
    accessRows
      .filter(
        (row) =>
          row.origin === "item" && row.effectiveAccess !== "none",
      )
      .map((row) => row.principalKey),
  );
  const attentionCount = health.stale + health.failing;
  const healthPercentage = health.healthPercentage;
  const syncFreshness = lastSyncedAt
    ? relativeTime(lastSyncedAt)
    : "Not synced yet";
  const workspaceDetails = [workspaceDetailLabel(data.workspace)].filter(
    Boolean,
  );

  const healthStatus = health.failing
    ? {
        label: "Action required",
        className:
          "border-signal-danger-foreground/30 bg-signal-danger-background text-signal-danger-foreground",
      }
    : health.stale
      ? {
          label: "Freshness review",
          className:
            "border-signal-warning-foreground/30 bg-signal-warning-background text-signal-warning-foreground",
        }
      : health.unknown
        ? {
            label: "Assessment incomplete",
            className:
              "border-border bg-muted text-muted-foreground",
          }
        : items.length
          ? {
              label: "Operational",
              className:
                "border-signal-success-foreground/30 bg-signal-success-background text-signal-success-foreground",
            }
          : {
              label: "Awaiting inventory",
              className:
                "border-lineage-neutral/30 bg-lineage-neutral/10 text-muted-foreground",
            };
  const healthSegments = [
    { label: "Healthy", value: health.healthy, tone: "bg-status-healthy" },
    { label: "Stale", value: health.stale, tone: "bg-status-warning" },
    { label: "Failing", value: health.failing, tone: "bg-status-failing" },
    { label: "Unknown", value: health.unknown, tone: "bg-muted-foreground" },
  ];

  const coverage = [
    {
      label: "Endorsement",
      detail: endorsementCoverage.denominator
        ? `${endorsementCoverage.numerator} of ${endorsementCoverage.denominator} eligible items`
        : "Metadata not collected",
      value:
        endorsementCoverage.percentage == null
          ? null
          : Math.round(endorsementCoverage.percentage),
    },
    {
      label: "Sensitivity labels",
      detail: sensitivityCoverage.denominator
        ? `${sensitivityCoverage.numerator} of ${sensitivityCoverage.denominator} eligible items`
        : "Metadata not collected",
      value:
        sensitivityCoverage.percentage == null
          ? null
          : Math.round(sensitivityCoverage.percentage),
    },
    {
      label: "Documented ownership",
      detail: ownerCoverage.denominator
        ? `${ownerCoverage.numerator} of ${ownerCoverage.denominator} eligible items`
        : "Metadata not collected",
      value:
        ownerCoverage.percentage == null
          ? null
          : Math.round(ownerCoverage.percentage),
    },
  ];

  const riskSignals = [
    {
      label: "Needs attention",
      value: attentionCount,
      detail: `${health.failing} failing · ${health.stale} stale`,
      target: {
        tab: "governance",
        focus: {
          requestId: crypto.randomUUID(),
          governanceSection: "findings",
          filters: { section: "findings", category: "operations" },
        },
      } as AtlasNavigation,
      icon: AlertTriangle,
      tone:
        attentionCount > 0
          ? "text-status-warning"
          : "text-status-healthy",
    },
    {
      label: "External access",
      value: external.length,
      detail: `${principals.length} people and groups`,
      target: {
        tab: "access",
        focus: {
          requestId: crypto.randomUUID(),
          filters: { risk: "external" },
        },
      } as AtlasNavigation,
      icon: Users,
      tone:
        external.length > 0
          ? "text-status-failing"
          : "text-status-healthy",
    },
    {
      label: "Confidential items",
      value: confidential.length,
      detail: sensitivityCoverage.denominator
        ? `${sensitivityCoverage.numerator} items labeled`
        : "Label metadata unavailable",
      target: {
        tab: "governance",
        focus: {
          requestId: crypto.randomUUID(),
          governanceSection: "coverage",
        },
      } as AtlasNavigation,
      icon: LockKeyhole,
      tone: "text-lineage-upstream",
    },
    {
      label: "Item-only access",
      value: itemOnly.size,
      detail: `${grants.length} grants indexed`,
      target: {
        tab: "access",
        focus: {
          requestId: crypto.randomUUID(),
          filters: { origin: "item" },
        },
      } as AtlasNavigation,
      icon: ShieldCheck,
      tone:
        itemOnly.size > 0
          ? "text-status-warning"
          : "text-status-healthy",
    },
  ];

  return (
    <section
      aria-labelledby="overview-title"
      className="atlas-content-frame flex min-w-0 flex-col gap-l"
    >
      <PageHeader
        title={data.workspace.displayName || "Fabric workspace"}
        titleId="overview-title"
        purpose="Inventory, governance gaps and recent activity."
      />
      <div className="flex flex-wrap items-center justify-between gap-l border-y border-border px-l py-m">
        <dl className="flex flex-wrap gap-x-xxl gap-y-s" aria-label="Workspace inventory">
          {[["Fabric items", items.length], ["Tables, columns & measures", assetCount], ["Lineage links", edges.length]].map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-s">
              <dt className="text-200 text-muted-foreground">{label}</dt>
              <dd className="font-numeric text-300 font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <span className="text-200 text-muted-foreground" title={[...workspaceDetails, latestSync?.triggeredBy].filter(Boolean).join(" · ")}>
          Last synchronized: {syncFreshness}
        </span>
      </div>

      <section aria-labelledby="overview-posture-title">
        {governancePolicyError && (
          <p role="alert" className="mb-m rounded-lg border border-signal-danger-foreground/30 bg-signal-danger-background p-m text-200 text-signal-danger-foreground">
            {governancePolicyError} Open Governance Center to retry. Raw scores remain visible below.
          </p>
        )}
        <Card className="grid min-w-0 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="min-w-0 p-l">
            <div className="flex flex-wrap items-baseline justify-between gap-x-l gap-y-xs">
              <h2 id="overview-posture-title" className="text-400 font-semibold">
                Governance posture
              </h2>
              {targetsAvailable && (
                <p className="text-200 text-muted-foreground">
                  <span className="font-numeric font-semibold text-foreground">{postureAtTarget} / {posture.pillars.length}</span>{" "}
                  pillars at target
                </p>
              )}
            </div>
            {governancePolicyLoading ? (
              <p role="status" className="mt-xs text-200 text-muted-foreground">
                Loading governance targets. Current scores remain visible.
              </p>
            ) : (
              <p className="mt-xs text-200 text-muted-foreground">
                {!items.length
                  ? "Sync the workspace to populate governance scores."
                  : largestGap
                    ? <>Largest target gap: <span className="capitalize text-foreground">{largestGap.pillar}</span>, {largestGap.gap} {largestGap.gap === 1 ? "point" : "points"} below target.</>
                    : targetsAvailable
                      ? "Select a pillar to review its evidence in Governance Center."
                      : "Targets unavailable. Select a pillar to review its current score."}
              </p>
            )}
            <Suspense fallback={
              <div role="status" className="atlas-posture-chart flex items-center justify-center text-200 text-muted-foreground">
                Loading governance radar...
              </div>
            }>
              <PostureRadar
                pillars={posture.pillars}
                selectedPillar={largestGap?.pillar ?? "documentation"}
                targetsAvailable={targetsAvailable}
                onSelect={openPosture}
              />
            </Suspense>
            <ul aria-label="Governance pillar scores" className="grid grid-cols-2 gap-x-m border-t border-border pt-s sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
              {posture.pillars.map((pillar) => {
                const previous = previousPosture?.pillars.find(
                  (candidate) => candidate.pillar === pillar.pillar,
                )?.score;
                const delta = pillar.score != null && previous != null
                  ? pillar.score - previous
                  : null;
                return (
                  <li key={pillar.pillar} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => openPosture(pillar.pillar)}
                      className="flex min-h-[var(--atlas-touch-target)] w-full min-w-0 flex-col gap-xxs rounded-md px-s py-s text-left hover:bg-accent active:bg-muted focus-visible:ring-inset focus-visible:ring-offset-0"
                      aria-label={`${pillar.pillar}: ${pillar.score == null ? "not available" : `${pillar.score}%`}. ${targetsAvailable ? `Target ${pillar.target}%` : "Target unavailable"}`}
                    >
                      <span className="flex w-full flex-wrap items-baseline justify-between gap-x-s text-200">
                        <span className="font-semibold capitalize">{pillar.pillar}</span>
                        <span className="atlas-score font-numeric font-semibold tabular-nums" data-score-band={scoreBand(pillar.score)}>
                          {pillar.score == null ? "N/A" : `${pillar.score}%`}
                        </span>
                      </span>
                      <span className="text-200 text-muted-foreground">
                        {targetsAvailable ? `Target ${pillar.target}%` : "Target unavailable"}
                        {delta != null && <span title="Change since the previous snapshot"> · {delta > 0 ? "+" : ""}{delta} pts</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-s border-t border-border pt-s">
              <button
                type="button"
                onClick={() => openPosture()}
                className="inline-flex min-h-[var(--atlas-touch-target)] items-center gap-s rounded-md px-s text-200 font-semibold text-brand-foreground hover:bg-accent active:bg-muted focus-visible:ring-inset focus-visible:ring-offset-0"
              >
                Open Governance Center
                <ArrowRight className="icon-size-200" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="min-w-0 border-t border-border p-l lg:border-l lg:border-t-0">
            <section aria-labelledby="overview-health-title">
              <div className="flex flex-wrap items-center justify-between gap-s">
                <h3 id="overview-health-title" className="text-300 font-semibold">Workspace health</h3>
                <span className={cn("inline-flex rounded-md border px-s py-xxs text-200 font-semibold", healthStatus.className)}>
                  {healthStatus.label}
                </span>
              </div>
              <div className="mt-l flex flex-wrap items-baseline gap-x-s gap-y-xs">
                <span className="font-numeric text-hero-800 font-semibold leading-hero-800 tabular-nums">
                  {healthPercentage == null ? "Not assessed" : `${healthPercentage}%`}
                </span>
                {healthPercentage != null && <span className="text-200 text-muted-foreground">of assessed items healthy</span>}
              </div>
              <p className="mt-xs text-200 text-muted-foreground">
                {health.total
                  ? `${health.assessed} of ${health.total} items assessed`
                  : "Sync the workspace to assess item health."}
              </p>
              {health.total > 0 && (
                <>
                  <div
                    role="img"
                    aria-label={`Item health distribution: ${healthSegments.map((segment) => `${segment.value} ${segment.label.toLowerCase()}`).join(", ")}`}
                    className="mt-l flex h-m w-full gap-xxs overflow-hidden rounded-sm bg-muted"
                  >
                    {healthSegments.filter((segment) => segment.value > 0).map((segment) => (
                      <span
                        key={segment.label}
                        aria-hidden="true"
                        className={segment.tone}
                        style={{ flexGrow: segment.value, flexBasis: 0 }}
                      />
                    ))}
                  </div>
                  <dl aria-label="Item health counts" className="mt-m grid grid-cols-2 gap-x-l gap-y-s">
                    {healthSegments.map((segment) => (
                      <div key={segment.label} className="flex items-center gap-s text-200">
                        <dt className="flex flex-1 items-center gap-s text-muted-foreground">
                          <span aria-hidden="true" className={`h-s w-s shrink-0 rounded-sm ${segment.tone}`} />
                          {segment.label}
                        </dt>
                        <dd className="font-numeric font-semibold tabular-nums">{segment.value}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
            </section>
            <section aria-labelledby="priority-signals-title" className="mt-xl border-t border-border pt-l">
              <h3 id="priority-signals-title" className="text-300 font-semibold">Priority signals</h3>
              <ul className="mt-s divide-y divide-border">
                {riskSignals.map((signal) => {
                  const Icon = signal.icon;
                  return (
                    <li key={signal.label}>
                      <button
                        type="button"
                        onClick={() => onOpen(signal.target)}
                        aria-label={`${signal.label}: ${signal.value}. ${signal.detail}`}
                        className="flex min-h-[var(--atlas-touch-target)] w-full items-center gap-m rounded-md px-s py-m text-left hover:bg-accent active:bg-muted focus-visible:ring-inset focus-visible:ring-offset-0"
                      >
                        <Icon className={`icon-size-200 shrink-0 ${signal.tone}`} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-300 font-semibold">{signal.label}</span>
                          <span className="mt-xxs block text-200 text-muted-foreground">{signal.detail}</span>
                        </span>
                        <span className="font-numeric text-500 font-semibold tabular-nums">{signal.value}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-m text-200 text-muted-foreground">
                Based on collected workspace metadata.
              </p>
            </section>
          </div>
        </Card>
      </section>

      <details className="rounded-lg border border-border">
        <summary className="min-h-[var(--atlas-touch-target)] cursor-pointer rounded-lg px-l py-m text-300 font-semibold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">Metadata coverage</summary>
        <section aria-labelledby="governance-coverage-title" className="p-m">
        <div className="mb-m flex items-end justify-between gap-l">
          <div>
            <h2
              id="governance-coverage-title"
              className="text-400 font-semibold"
            >
              Metadata coverage
            </h2>
          </div>
          <button
            type="button"
            onClick={() =>
              onOpen({
                tab: "governance",
                focus: {
                  requestId: crypto.randomUUID(),
                  governanceSection: "coverage",
                },
              })
            }
            className="atlas-control shrink-0 rounded-md px-s text-200 font-semibold text-brand-foreground hover:underline"
          >
            Review labels
          </button>
        </div>
        <Card className="p-l sm:p-xl">
          {items.length ? (
            <div className="grid gap-xxl lg:grid-cols-5">
              <div className="flex flex-col gap-xl lg:col-span-3">
                {coverage.map((metric) => (
                  <div key={metric.label}>
                    <div className="mb-s flex items-end justify-between gap-l">
                      <div>
                        <div className="text-300 font-semibold">
                          {metric.label}
                        </div>
                        <div className="mt-xs text-200 text-muted-foreground">
                          {metric.detail}
                        </div>
                      </div>
                      <div className="atlas-score font-numeric text-400 font-semibold tabular-nums" data-score-band={scoreBand(metric.value)}>
                        {metric.value == null ? "N/A" : `${metric.value}%`}
                      </div>
                    </div>
                    <ScoreMeter label={`${metric.label} coverage`} value={metric.value} />
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => onOpen("assets")}
                className="group flex flex-col justify-between gap-l rounded-lg bg-secondary p-l text-left transition-colors hover:bg-accent lg:col-span-2"
              >
                <span>
                  <span className="flex items-center justify-between gap-l">
                    <span className="text-300 font-semibold">Object inventory</span>
                    <ArrowRight
                      className="icon-size-200 text-muted-foreground transition-transform group-hover:translate-x-xs motion-reduce:transition-none"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="mt-m block font-numeric text-hero-800 font-bold leading-hero-800 text-primary">
                    {assetCount}
                  </span>
                  <span className="mt-xs block text-200 text-muted-foreground">
                    tables, columns, and measures indexed
                  </span>
                </span>
                <span className="grid grid-cols-2 gap-l border-t border-border pt-l">
                  <span>
                    <span className="block font-numeric text-500 font-bold tabular-nums text-lineage-downstream">
                      {edges.length}
                    </span>
                    <span className="block text-200 text-muted-foreground">
                      lineage links
                    </span>
                  </span>
                  <span>
                    <span className="block font-numeric text-500 font-bold tabular-nums">
                      {items.length}
                    </span>
                    <span className="block text-200 text-muted-foreground">
                      Fabric items
                    </span>
                  </span>
                </span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 p-xxl text-center">
              <ShieldCheck
                className="icon-size-600 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="mt-m text-300 font-semibold">
                No governance coverage yet
              </p>
              <p className="mt-xs text-200 text-muted-foreground">
                Coverage appears after the workspace is indexed.
              </p>
            </div>
          )}
        </Card>
        </section>
      </details>

      <section aria-labelledby="activity-mix-title">
        <div className="mb-m flex items-end justify-between gap-l">
          <div>
            <h2 id="activity-mix-title" className="text-400 font-semibold">
              Recent activity &amp; item mix
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onOpen("jobs")}
            className="atlas-control shrink-0 rounded-md px-s text-200 font-semibold text-brand-foreground hover:underline"
          >
            View all jobs
          </button>
        </div>
        <Card className="overflow-hidden">
          <div className="grid lg:grid-cols-2">
            <div className="p-l sm:p-xl lg:border-r lg:border-border">
              <h3 className="text-300 font-semibold">Latest jobs</h3>
              {recentJobs.length ? (
                <div className="mt-m flex flex-col">
                  {recentJobs.map((job) => (
                    <div
                      key={`${job.itemFabricId}-${job.startedAt}-${job.jobType}`}
                      className="flex items-center gap-m border-b border-border py-m last:border-b-0"
                    >
                      <span
                        className={`icon-size-100 shrink-0 rounded-full ${JOB_TONE[job.status]}`}
                        title={job.status}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-300 font-semibold">
                          {job.itemName}
                        </div>
                        <div className="mt-xs truncate text-200 text-muted-foreground">
                          {job.jobType} · {job.status}
                        </div>
                      </div>
                      <span className="shrink-0 text-200 text-muted-foreground">
                        {relativeTime(job.startedAt)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-m rounded-xl border border-dashed border-border bg-muted/20 p-xl text-center">
                  <Clock3
                    className="mx-auto icon-size-500 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <p className="mt-s text-300 font-semibold">
                    No jobs recorded
                  </p>
                  <p className="mt-xs text-200 text-muted-foreground">
                    Recent Fabric activity will appear here.
                  </p>
                </div>
              )}
            </div>

            <div className="border-t border-border p-l sm:p-xl lg:border-t-0">
              <div className="flex items-center justify-between gap-l">
                <h3 className="text-300 font-semibold">Item mix</h3>
                <button
                  type="button"
                  onClick={() => onOpen("catalog")}
                  className="text-200 font-semibold text-primary hover:underline"
                >
                  Open catalog
                </button>
              </div>
              {byType.length ? (
                <div className="mt-m flex flex-col gap-s">
                  {byType.slice(0, 5).map(([type, count]) => (
                    <button
                      type="button"
                      key={type}
                      onClick={() =>
                        onOpen({
                          tab: "catalog",
                          focus: {
                            requestId: crypto.randomUUID(),
                            filters: { type },
                          },
                        })
                      }
                      aria-label={`View ${count} ${typeMeta(type).label} items in catalog`}
                      className="group flex items-center gap-m rounded-xl p-s text-left transition-colors hover:bg-accent"
                    >
                      <TypeGlyph type={type} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-s">
                          <span className="truncate text-300 font-semibold">
                            {typeMeta(type).label}
                          </span>
                          <span className="font-numeric text-300 font-bold tabular-nums">
                            {count}
                          </span>
                        </span>
                        <span className="mt-s block h-xs overflow-hidden rounded-full bg-muted">
                          <span
                            className="block h-full rounded-full bg-primary transition-colors group-hover:bg-lineage-downstream"
                            style={{ width: `${(count / maxType) * 100}%` }}
                          />
                        </span>
                      </span>
                    </button>
                  ))}
                  {byType.length > 5 && (
                    <p className="px-s pt-s text-200 text-muted-foreground">
                      {byType.length - 5} more item{" "}
                      {byType.length - 5 === 1 ? "type" : "types"} in the
                      catalog
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-m rounded-xl border border-dashed border-border bg-muted/20 p-xl text-center">
                  <Boxes
                    className="mx-auto icon-size-500 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <p className="mt-s text-300 font-semibold">
                    No items indexed
                  </p>
                  <p className="mt-xs text-200 text-muted-foreground">
                    The item mix will populate after a successful sync.
                  </p>
                </div>
              )}
            </div>
          </div>
        </Card>
      </section>
    </section>
  );
}
