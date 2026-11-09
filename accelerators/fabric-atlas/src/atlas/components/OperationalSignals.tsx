import { useMemo, useState } from "react";
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  ChevronDown,
  ClipboardCopy,
  ExternalLink,
  History,
  Waypoints,
} from "lucide-react";
import { ATLAS_CONFIG } from "../config";
import { incidentBriefMarkdown, incidentBriefSection } from "../incident-feeds";
import { relativeTime } from "../model";
import {
  diffIncidents,
  fabricAppItemUrl,
  fabricPortalContext,
  incidentImpact,
  MONITORING_SOURCES,
  monitorHubUrl,
  type DownstreamImpact,
  type IncidentImpact,
  type MonitoringSource,
  type ObservedIncident,
  type OperationalEvidence,
} from "../observability";
import { useAtlas } from "../store";
import { Card, TypeGlyph, cn } from "../ui";
import {
  useOperationalIncidentRecords,
  type IncidentRecordsState,
} from "../use-operational-incidents";
import { NativeLink } from "./NativeLink";

const IMPACT_PREVIEW_COUNT = 4;

const BUTTON =
  "inline-flex min-h-[var(--atlas-touch-target)] items-center justify-center gap-s rounded-md border border-input bg-card px-m text-200 font-semibold text-foreground transition-colors hover:bg-accent sm:min-h-[var(--atlas-control-height)]";

const EXACT_TIME = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function exactTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : EXACT_TIME.format(date);
}

export function EvidenceChip({ evidence }: { evidence: OperationalEvidence }) {
  return evidence === "observed" ? (
    <span className="inline-flex shrink-0 items-center gap-xs rounded-md border border-status-failing/35 bg-status-failing/10 px-s py-xxs text-200 font-semibold text-foreground">
      <CircleAlert className="icon-size-100 text-status-failing" aria-hidden="true" />
      Observed failure
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-xs rounded-md border border-dashed border-lineage-upstream/50 bg-lineage-upstream/5 px-s py-xxs text-200 font-semibold text-foreground">
      <Waypoints className="icon-size-100 text-lineage-upstream" aria-hidden="true" />
      Inferred impact
    </span>
  );
}

function SourceStatus({ source }: { source: MonitoringSource }) {
  const chip =
    "inline-flex shrink-0 items-center gap-xs rounded-md border px-s py-xxs text-200 font-semibold";
  switch (source.status) {
    case "collected":
      return (
        <span className={cn(chip, "border-status-healthy/30 bg-status-healthy/10 text-foreground")}>
          <CircleCheck className="icon-size-100 text-status-healthy" aria-hidden="true" />
          Collected
        </span>
      );
    case "not-collected":
      return (
        <span className={cn(chip, "border-border bg-muted text-muted-foreground")}>
          <CircleDashed className="icon-size-100" aria-hidden="true" />
          Not collected
        </span>
      );
    default:
      return (
        <span className={cn(chip, "border-border bg-secondary text-foreground")}>
          <ExternalLink className="icon-size-100 text-muted-foreground" aria-hidden="true" />
          Fabric portal only
        </span>
      );
  }
}

function SourceLinks({
  source,
  lastSyncedAt,
}: {
  source: MonitoringSource;
  lastSyncedAt?: string;
}) {
  const context = fabricPortalContext();
  switch (source.id) {
    case "fabric-job-history":
      return (
        <>
          <p className="text-200 text-muted-foreground">
            {lastSyncedAt
              ? `Captured ${relativeTime(lastSyncedAt)} (${exactTime(lastSyncedAt)}).`
              : "No synchronization has been recorded for this workspace."}
          </p>
          <NativeLink href={monitorHubUrl("jobs", context)}>
            Job runs in Monitor hub
          </NativeLink>
        </>
      );
    case "workspace-monitoring":
      return (
        <NativeLink href={source.documentationUrl}>
          Workspace monitoring guide
        </NativeLink>
      );
    case "monitor-hub-alerts":
      return (
        <NativeLink href={monitorHubUrl("alerts", context)}>
          Alerts in Monitor hub
        </NativeLink>
      );
    default: {
      const appUrl = fabricAppItemUrl({
        ...context,
        workspaceId: ATLAS_CONFIG.workspaceId,
        itemId: import.meta.env.VITE_FABRIC_ITEM_ID as string | undefined,
      });
      return (
        <>
          <NativeLink href={monitorHubUrl("applications", context)}>
            Applications in Monitor hub
          </NativeLink>
          {appUrl ? (
            <p className="text-200 text-muted-foreground">
              <NativeLink href={appUrl}>Open the Atlas app item</NativeLink>{" "}
              then select Manage app &gt; Metrics.
            </p>
          ) : (
            <p className="text-200 text-muted-foreground">
              No deployed app item ID is configured in this build, so only the
              Monitor hub link is available.
            </p>
          )}
        </>
      );
    }
  }
}

function MonitoringSourcesCard({ lastSyncedAt }: { lastSyncedAt?: string }) {
  return (
    <Card className="flex min-w-0 flex-col">
      <header className="border-b border-border px-l py-m">
        <h2 id="monitoring-sources-title" className="text-400 font-semibold leading-400">
          Monitoring sources
        </h2>
        <p className="mt-xxs text-200 leading-200 text-muted-foreground">
          Collection boundary for this snapshot.
        </p>
      </header>
      <ul aria-labelledby="monitoring-sources-title" className="divide-y divide-border">
        {MONITORING_SOURCES.map((source) => (
          <li key={source.id}>
            <details className="group">
              <summary className="flex min-h-[var(--atlas-touch-target)] cursor-pointer list-none items-center gap-m px-l py-s focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <span className="min-w-0 flex-1">
                  <h3 className="block truncate text-300 font-semibold">
                    {source.label}
                  </h3>
                  <span className="block truncate text-200 text-muted-foreground">
                    {source.summary}
                  </span>
                </span>
                <SourceStatus source={source} />
                <ChevronDown
                  className="icon-size-200 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </summary>
              <div className="space-y-s border-t border-border/60 bg-secondary/40 px-l py-m text-200 leading-200">
                <SourceLinks source={source} lastSyncedAt={lastSyncedAt} />
                <div>
                  <p className="font-semibold text-foreground">Prerequisites</p>
                  <ul className="mt-xs list-disc space-y-xxs pl-l text-muted-foreground">
                    {source.prerequisites.map((prerequisite) => (
                      <li key={prerequisite}>{prerequisite}</li>
                    ))}
                  </ul>
                </div>
                <NativeLink href={source.documentationUrl}>
                  Microsoft documentation
                </NativeLink>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function impactSummaryText(impact: readonly DownstreamImpact[]): string {
  if (impact.length === 0) return "No downstream consumers in snapshot lineage.";
  const observed = impact.filter((item) => item.evidence === "observed").length;
  const inferred = impact.length - observed;
  const parts = [
    inferred > 0 && `${inferred} inferred, not confirmed by monitoring`,
    observed > 0 && `${observed} also failing in this snapshot (observed)`,
  ].filter(Boolean);
  return `${impact.length} downstream item${impact.length === 1 ? "" : "s"} in snapshot lineage: ${parts.join("; ")}.`;
}

function IncidentRow({
  entry,
  onShowRuns,
  onOpenImpact,
}: {
  entry: IncidentImpact;
  onShowRuns: (incident: ObservedIncident) => void;
  onOpenImpact?: (itemId: string) => void;
}) {
  const { incident, impact } = entry;
  const preview = impact.slice(0, IMPACT_PREVIEW_COUNT);
  const hidden = impact.length - preview.length;
  const titleId = `incident-${incident.id}`;
  return (
    <li>
      <details className="group">
        <summary className="flex min-h-[var(--atlas-touch-target)] cursor-pointer list-none items-center gap-m px-l py-m focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          {incident.itemType && <TypeGlyph type={incident.itemType} size={28} />}
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-s">
              <h3 id={titleId} className="min-w-0 truncate text-300 font-semibold">
                {incident.itemName}
              </h3>
              <EvidenceChip evidence="observed" />
            </span>
            <span className="mt-xxs block text-200 text-muted-foreground">
              {incident.jobType} ·{" "}
              <time dateTime={incident.occurredAt} title={exactTime(incident.occurredAt)}>
                {relativeTime(incident.occurredAt)}
              </time>
            </span>
          </span>
          <span className="hidden text-right sm:block">
            <span className="block font-numeric text-300 font-semibold">
              {impact.length}
            </span>
            <span className="text-100 text-muted-foreground">
              downstream
            </span>
          </span>
          <ChevronDown
            className="icon-size-200 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>

        <div className="space-y-m border-t border-border/60 bg-secondary/30 px-l py-m">
          <div className="text-200 text-muted-foreground">
            <p>
              {incident.recorded
                ? "Stored incident record"
                : "Derived from the snapshot job history"}
              {incident.runId && (
                <>
                  {" · Run "}
                  <span className="font-monospace" title={incident.runId}>
                    {incident.runId.slice(0, 8)}
                  </span>
                </>
              )}
              {incident.observedAt &&
                ` · captured ${relativeTime(incident.observedAt)}`}
              {incident.firstObservedAt &&
                incident.firstObservedAt !== incident.observedAt &&
                ` · failing since ${exactTime(incident.firstObservedAt)}`}
            </p>
            <p className="mt-xs text-foreground">
              {incident.message || "Error detail not collected by Atlas."}
            </p>
          </div>

          <div className="rounded-lg border border-dashed border-lineage-upstream/40 bg-card p-m">
            <div className="flex flex-wrap items-center gap-s">
              <EvidenceChip evidence="inferred" />
              <span className="text-200 text-muted-foreground">
                {impactSummaryText(impact)}
              </span>
            </div>
            {preview.length > 0 && (
              <ul
                aria-label={`Downstream impact of ${incident.itemName}`}
                className="mt-s grid gap-xs sm:grid-cols-2"
              >
                {preview.map((item) => (
                  <li key={item.itemId} className="flex min-w-0 items-center gap-s text-200">
                    {item.itemType && <TypeGlyph type={item.itemType} size={20} />}
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {item.itemName}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {item.evidence === "observed"
                        ? "also failing (observed)"
                        : item.distance === 1
                          ? "direct · inferred"
                          : `${item.distance} hops · inferred`}
                    </span>
                  </li>
                ))}
                {hidden > 0 && (
                  <li className="text-200 text-muted-foreground">
                    and {hidden} more
                  </li>
                )}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap gap-s">
            <button type="button" onClick={() => onShowRuns(incident)} className={BUTTON}>
              <History className="icon-size-200" aria-hidden="true" />
              Show this run
            </button>
            {onOpenImpact && impact.length > 0 && (
              <button
                type="button"
                onClick={() => onOpenImpact(incident.itemId)}
                className={BUTTON}
              >
                <Waypoints className="icon-size-200" aria-hidden="true" />
                Open impact in Map &amp; lineage
              </button>
            )}
          </div>
        </div>
      </details>
    </li>
  );
}

function recordsNote(state: IncidentRecordsState, derivedCount: number): string {
  switch (state.status) {
    case "ready":
      return state.records.length > 0
        ? `${state.records.length} stored incident record${state.records.length === 1 ? "" : "s"} for this snapshot.`
        : derivedCount > 0
          ? "No stored incident record for this snapshot; incidents are derived from its job history."
          : "No stored incident record for this snapshot.";
    case "loading":
      return "Loading stored incident records…";
    case "error":
      return "Stored incident records could not be read; incidents are derived from the snapshot job history.";
    default:
      return state.reason === "not-deployed"
        ? "Incident records are not deployed yet; incidents are derived from the snapshot job history."
        : "Incidents are derived from the snapshot job history.";
  }
}

function SincePreviousSnapshot() {
  const { history, historyLoading } = useAtlas();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const comparison = useMemo(() => {
    const [currentSummary, previousSummary] = history.summaries;
    if (!currentSummary || !previousSummary) return { state: "baseline" as const };
    const current = history.snapshots.find(
      (snapshot) => snapshot.snapshotId === currentSummary.snapshotId,
    );
    const previous = history.snapshots.find(
      (snapshot) => snapshot.snapshotId === previousSummary.snapshotId,
    );
    if (!current || !previous) return { state: "loading" as const };
    const context = {
      previousSnapshotId: previous.snapshotId,
      currentSnapshotId: current.snapshotId,
      previousObservedAt: previous.syncedAt,
      currentObservedAt: current.syncedAt,
    };
    return {
      state: "ready" as const,
      section: incidentBriefSection(
        diffIncidents(previous.catalog, current.catalog, context),
        context,
      ),
    };
  }, [history]);

  if (comparison.state === "baseline") {
    return (
      <p className="text-200 text-muted-foreground">
        No previous snapshot to compare incidents with yet.
      </p>
    );
  }
  if (comparison.state === "loading") {
    return (
      <p role="status" className="text-200 text-muted-foreground">
        {historyLoading
          ? "Loading the previous snapshot to compare incidents…"
          : "The previous snapshot is not loaded, so incident changes are not shown."}
      </p>
    );
  }
  const { section } = comparison;
  const counts: Array<[string, number]> = [
    ["opened", section.opened.length],
    ["recovered", section.recovered.length],
    ["still failing", section.persisting.length],
    ["no longer reported", section.unreported.length],
  ];
  return (
    <div className="flex flex-col gap-xs">
      <p className="text-200 text-foreground">
        <span className="font-semibold">Since the previous snapshot: </span>
        {counts.map(([label, count]) => `${count} ${label}`).join(" · ")}
      </p>
      <p className="text-200 text-muted-foreground">
        Compared {exactTime(section.provenance.previousObservedAt)} with{" "}
        {exactTime(section.provenance.currentObservedAt)} from Fabric job history.
      </p>
      <div className="flex flex-wrap items-center gap-s">
        <button
          type="button"
          onClick={() => {
            const markdown = incidentBriefMarkdown(section);
            void Promise.resolve()
              .then(() => navigator.clipboard.writeText(markdown))
              .then(
                () => setCopyState("copied"),
                () => setCopyState("failed"),
              );
          }}
          className={BUTTON}
        >
          <ClipboardCopy className="icon-size-200" aria-hidden="true" />
          Copy incident brief
        </button>
        <span role="status" className="text-200 text-muted-foreground">
          {copyState === "copied"
            ? "Markdown copied."
            : copyState === "failed"
              ? "Copy failed: the browser blocked clipboard access."
              : ""}
        </span>
      </div>
    </div>
  );
}

export function OperationalSignals({
  onShowRuns,
  onOpenImpact,
}: {
  onShowRuns: (incident: ObservedIncident) => void;
  onOpenImpact?: (itemId: string) => void;
}) {
  const { data, lastSyncedAt, isPreview } = useAtlas();
  const records = useOperationalIncidentRecords(
    isPreview,
    data.workspace.fabricId,
    data.workspace.snapshotId,
  );
  const entries = useMemo(
    () =>
      incidentImpact(
        data,
        lastSyncedAt,
        records.status === "ready" ? records.records : [],
      ),
    [data, lastSyncedAt, records],
  );

  return (
    <section
      aria-label="Operational signals"
      className="grid gap-l lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]"
    >
      <Card className="flex min-w-0 flex-col">
        <header className="flex flex-col gap-s border-b border-border px-l py-m">
          <h2 className="text-400 font-semibold leading-400">
            Operational evidence
          </h2>
          <p className="text-200 leading-200 text-muted-foreground">
            Latest failed runs, with downstream reach from the validated
            snapshot lineage.
          </p>
          <p className="text-200 text-muted-foreground">
            {recordsNote(records, entries.length)}
          </p>
          <details className="group rounded-md border border-border bg-secondary/50">
            <summary className="flex min-h-[var(--atlas-touch-target)] cursor-pointer list-none items-center justify-between gap-m px-m py-s text-200 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              Changes since the previous snapshot
              <ChevronDown
                className="icon-size-200 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                aria-hidden="true"
              />
            </summary>
            <div className="border-t border-border px-m py-s">
              <SincePreviousSnapshot />
            </div>
          </details>
        </header>
        {entries.length === 0 ? (
          <p className="p-l text-200 leading-200 text-muted-foreground">
            {data.jobs.length === 0
              ? "No job history is in this snapshot. Run a refresh, pipeline or notebook, then synchronize Atlas."
              : "No current failures. The latest recorded run of every item and job type did not fail; earlier failures stay in Run history."}
          </p>
        ) : (
          <ol aria-label="Observed failures" className="divide-y divide-border">
            {entries.map((entry) => (
              <IncidentRow
                key={entry.incident.id}
                entry={entry}
                onShowRuns={onShowRuns}
                onOpenImpact={onOpenImpact}
              />
            ))}
          </ol>
        )}
      </Card>
      <MonitoringSourcesCard lastSyncedAt={lastSyncedAt} />
    </section>
  );
}
