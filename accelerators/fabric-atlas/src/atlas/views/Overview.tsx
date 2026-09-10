import { useMemo } from "react";
import type {
  AtlasNavigation,
  Tab,
} from "@/atlas/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  Clock3,
  Compass,
  FolderTree,
  LockKeyhole,
  ShieldCheck,
  Users,
  Waypoints,
} from "lucide-react";
import { useAtlas } from "../store";
import {
  buildAccessReviewRows,
  getCoverageDiagnostics,
} from "../governance";
import { Card, SectionLabel, TypeGlyph } from "../ui";
import {
  typeMeta,
  relativeTime,
  schemaFor,
  type ItemType,
  type JobStatus,
} from "../model";
import { snapshotCatalogFromData } from "../history";
import { scorePosture } from "../posture";
import { workspaceDetailLabel } from "../workspace-display";
import { summarizeHealth } from "../health-summary";

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

  const pulse = health.failing
    ? {
        label: "Action required",
        className:
          "border-status-failing/30 bg-status-failing/10 text-status-failing",
      }
    : health.stale
      ? {
          label: "Freshness review",
          className:
            "border-status-warning/30 bg-status-warning/10 text-status-warning",
        }
      : health.unknown
        ? {
            label: `${health.unknown} health status unknown`,
            className:
              "border-status-warning/30 bg-status-warning/10 text-status-warning",
          }
        : items.length
          ? {
              label: "Operational",
              className:
                "border-status-healthy/30 bg-status-healthy/10 text-status-healthy",
            }
          : {
              label: "Awaiting inventory",
              className:
                "border-lineage-neutral/30 bg-lineage-neutral/10 text-muted-foreground",
            };

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
      tone: "bg-lineage-downstream",
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
      tone: "bg-lineage-upstream",
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
      tone: "bg-primary",
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
      className="atlas-content-frame flex flex-col gap-xl"
    >
      <Card className="atlas-overview-hero relative isolate overflow-hidden border-border shadow-fabric-4">
        <div className="grid lg:grid-cols-5">
          <div className="atlas-page-header flex flex-col justify-between lg:col-span-3">
            <div>
              <div className="flex items-center gap-m">
                <span className="atlas-brand-mark flex icon-size-700 shrink-0 items-center justify-center rounded-xl text-primary-foreground">
                  <Compass className="icon-size-400" aria-hidden="true" />
                </span>
                <div>
                  <SectionLabel>Fabric Atlas</SectionLabel>
                  <div className="mt-xs text-200 font-semibold text-muted-foreground">
                    Governance overview
                  </div>
                </div>
              </div>

              <h1
                id="overview-title"
                className="atlas-overview-title mt-m text-balance font-heading text-600 font-bold leading-600"
              >
                {data.workspace.displayName || "Fabric workspace"}
              </h1>
              <p className="atlas-overview-copy mt-s text-300 leading-300 text-muted-foreground">
                See what is governed, what needs attention, and where to act
                across this workspace.
              </p>
              {workspaceDetails.length > 0 && (
                <p className="mt-s text-200 text-muted-foreground">
                  {workspaceDetails.join(" · ")}
                </p>
              )}
            </div>

            <nav
              aria-label="Overview destinations"
              className="atlas-toolbar grid sm:grid-cols-3"
            >
              <button
                type="button"
                onClick={() => onOpen("map")}
                className="group inline-flex items-center justify-between gap-s rounded-md bg-primary px-l py-m text-300 font-semibold text-primary-foreground shadow-fabric-2 transition-colors hover:bg-primary-hover"
              >
                <span className="inline-flex items-center gap-s">
                  <Waypoints className="icon-size-200" aria-hidden="true" />
                  Map
                </span>
                <ArrowRight
                  className="icon-size-200 transition-transform group-hover:translate-x-xs motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                onClick={() => onOpen("catalog")}
                className="group inline-flex items-center justify-between gap-s rounded-md border border-border bg-card px-l py-m text-300 font-semibold transition-colors hover:border-primary/40 hover:bg-accent"
              >
                <span className="inline-flex items-center gap-s">
                  <FolderTree className="icon-size-200" aria-hidden="true" />
                  Catalog
                </span>
                <ArrowRight
                  className="icon-size-200 text-muted-foreground transition-transform group-hover:translate-x-xs motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                onClick={() => onOpen("access")}
                className="group inline-flex items-center justify-between gap-s rounded-md border border-border bg-card px-l py-m text-300 font-semibold transition-colors hover:border-primary/40 hover:bg-accent"
              >
                <span className="inline-flex items-center gap-s">
                  <ShieldCheck className="icon-size-200" aria-hidden="true" />
                  Access
                </span>
                <ArrowRight
                  className="icon-size-200 text-muted-foreground transition-transform group-hover:translate-x-xs motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </button>
            </nav>
          </div>

          <aside className="atlas-page-header flex flex-col justify-center border-t border-border bg-secondary/70 lg:col-span-2 lg:border-l lg:border-t-0">
            <div className="flex items-center gap-l">
              <span
                className={`relative flex icon-size-600 shrink-0 items-center justify-center rounded-full border ${pulse.className}`}
                aria-hidden="true"
              >
                <Activity className="icon-size-300" />
              </span>
              <div>
                <SectionLabel>Assessed item health</SectionLabel>
                <div className="mt-xs flex flex-wrap items-baseline gap-s">
                  <span className="font-numeric text-600 font-bold leading-600">
                    {healthPercentage == null ? "Not assessed" : `${healthPercentage}%`}
                  </span>
                  <span className="text-300 font-semibold">{pulse.label}</span>
                </div>
                <p className="mt-xs text-200 text-muted-foreground">
                  {health.assessed
                    ? `${health.healthy} of ${health.assessed} assessed items healthy`
                    : "No collected health status is available yet."}
                </p>
                <p className="mt-s text-200 text-muted-foreground">
                  Health coverage: {health.coveragePercentage == null ? "Not applicable" : `${health.coveragePercentage}%`}
                  {" "}({health.assessed} of {health.total} items assessed).
                  {health.unknown > 0 && ` ${health.unknown} unknown statuses are excluded from the health score.`}
                </p>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="flex items-center gap-l">
              <span className="flex icon-size-600 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Clock3 className="icon-size-300" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <SectionLabel>Sync freshness</SectionLabel>
                <div className="mt-xs text-400 font-semibold">
                  {syncFreshness}
                </div>
                <p className="mt-xs truncate text-200 text-muted-foreground">
                  {latestSync?.triggeredBy
                    ? `Triggered by ${latestSync.triggeredBy}`
                    : latestSync
                      ? `Latest run ${latestSync.status}`
                      : "No sync runs recorded"}
                </p>
              </div>
            </div>
          </aside>
        </div>
      </Card>

      <section aria-labelledby="posture-targets-title">
        <div className="mb-m flex items-end justify-between gap-l">
          <div>
            <SectionLabel>Posture targets</SectionLabel>
            <h2
              id="posture-targets-title"
              className="mt-xs text-500 font-semibold"
            >
              {targetsAvailable
                ? `${postureAtTarget} of ${posture.pillars.length} pillars at target`
                : governancePolicyLoading
                  ? "Loading governance targets"
                  : "Governance targets unavailable"}
            </h2>
            <p className="mt-xs text-200 text-muted-foreground">
              Standard baseline: 70% for each governance pillar.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onOpen({
                tab: "governance",
                focus: {
                  requestId: crypto.randomUUID(),
                  governanceSection: "posture",
                },
              })
            }
            className="text-200 font-semibold text-primary hover:underline"
          >
            Open posture
          </button>
        </div>
        {governancePolicyError && (
          <p role="alert" className="mb-m rounded-lg border border-destructive/30 bg-destructive/10 p-m text-200">
            {governancePolicyError} Open posture to retry. Raw scores remain visible below.
          </p>
        )}
        <Card className="grid gap-s p-m sm:grid-cols-2 xl:grid-cols-6">
          {posture.pillars.map((pillar) => {
            const previous = previousPosture?.pillars.find(
              (candidate) => candidate.pillar === pillar.pillar,
            )?.score;
            const delta =
              pillar.score != null && previous != null
                ? pillar.score - previous
                : null;
            return (
              <button
                key={pillar.pillar}
                type="button"
                onClick={() =>
                  onOpen({
                    tab: "governance",
                    focus: {
                      requestId: crypto.randomUUID(),
                      governanceSection: "posture",
                      filters: { pillar: pillar.pillar },
                    },
                  })
                }
                className="rounded-xl border border-border bg-secondary/55 p-m text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="text-200 font-semibold capitalize">
                  {pillar.pillar}
                </div>
                <div className="mt-xs font-numeric text-400 font-bold">
                  {pillar.score == null ? "N/A" : `${pillar.score}%`}
                </div>
                <div className="mt-xs text-200 text-muted-foreground">
                  {targetsAvailable ? `Target ${pillar.target}%` : "Target unavailable"}
                  {delta == null
                    ? ""
                    : ` · ${delta >= 0 ? "+" : ""}${delta} pts`}
                </div>
              </button>
            );
          })}
        </Card>
      </section>

      <section aria-labelledby="priority-signals-title">
        <div className="mb-m flex items-end justify-between gap-l">
          <div>
            <SectionLabel>Priority signals</SectionLabel>
            <h2 id="priority-signals-title" className="mt-xs text-500 font-semibold">
              What deserves a closer look
            </h2>
          </div>
          <span className="hidden text-200 text-muted-foreground sm:block">
            Live workspace index
          </span>
        </div>
        <Card className="overflow-hidden">
          <div className="grid sm:grid-cols-2 xl:grid-cols-4">
            {riskSignals.map((signal) => {
              const Icon = signal.icon;
              return (
                <button
                  type="button"
                  key={signal.label}
                  onClick={() => onOpen(signal.target)}
                  aria-label={`${signal.label}: ${signal.value}. ${signal.detail}`}
                  className="group flex items-center gap-m border-b border-border p-l text-left transition-colors hover:bg-accent sm:odd:border-r xl:border-b-0 xl:border-r xl:last:border-r-0"
                >
                  <span
                    className={`flex icon-size-600 shrink-0 items-center justify-center rounded-xl bg-muted ${signal.tone}`}
                  >
                    <Icon className="icon-size-200" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-s">
                      <span className="truncate text-300 font-semibold">
                        {signal.label}
                      </span>
                      <span
                        className={`font-numeric text-500 font-bold tabular-nums ${signal.tone}`}
                      >
                        {signal.value}
                      </span>
                    </span>
                    <span className="mt-xs block truncate text-200 text-muted-foreground">
                      {signal.detail}
                    </span>
                  </span>
                  <ArrowRight
                    className="icon-size-200 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-xs motion-reduce:transition-none"
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        </Card>
      </section>

      <section aria-labelledby="governance-coverage-title">
        <div className="mb-m flex items-end justify-between gap-l">
          <div>
            <SectionLabel>Governance coverage</SectionLabel>
            <h2
              id="governance-coverage-title"
              className="mt-xs text-500 font-semibold"
            >
              Essential controls across the inventory
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
            className="shrink-0 text-200 font-semibold text-primary hover:underline"
          >
            Review labels
          </button>
        </div>
        <Card className="p-xl sm:p-xxl">
          {items.length ? (
            <div className="grid gap-xxxl lg:grid-cols-5">
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
                      <div className="font-numeric text-500 font-bold tabular-nums">
                        {metric.value == null ? "N/A" : `${metric.value}%`}
                      </div>
                    </div>
                    <div
                      className="h-s overflow-hidden rounded-full bg-muted"
                      role={metric.value == null ? undefined : "progressbar"}
                      aria-label={`${metric.label} coverage`}
                      aria-valuemin={metric.value == null ? undefined : 0}
                      aria-valuemax={metric.value == null ? undefined : 100}
                      aria-valuenow={metric.value ?? undefined}
                    >
                      <div
                        className={`h-full rounded-full ${metric.tone}`}
                        style={{ width: `${metric.value ?? 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => onOpen("assets")}
                className="group flex flex-col justify-between gap-xl rounded-xl border border-border bg-muted/30 p-l text-left transition-colors hover:border-primary/40 hover:bg-accent lg:col-span-2"
              >
                <span>
                  <span className="flex items-center justify-between gap-l">
                    <SectionLabel>Inventory reach</SectionLabel>
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

      <section aria-labelledby="activity-mix-title">
        <div className="mb-m flex items-end justify-between gap-l">
          <div>
            <SectionLabel>Recent activity &amp; item mix</SectionLabel>
            <h2 id="activity-mix-title" className="mt-xs text-500 font-semibold">
              What is changing in the workspace
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onOpen("jobs")}
            className="shrink-0 text-200 font-semibold text-primary hover:underline"
          >
            View all jobs
          </button>
        </div>
        <Card className="overflow-hidden">
          <div className="grid lg:grid-cols-2">
            <div className="p-xl sm:p-xxl lg:border-r lg:border-border">
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

            <div className="border-t border-border p-xl sm:p-xxl lg:border-t-0">
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
