import { ATLAS_CONFIG } from "./config";
import {
  createLineageIndex,
  getLineageImpact,
  normalizeLineageEdges,
} from "./lineage";
import type { AtlasData, ItemType } from "./model";
import { searchJobId } from "./search";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Evidence class shown beside every operational signal. Observed signals were
 * recorded by a source; inferred signals are derived from snapshot lineage and
 * have not been confirmed by any operational source.
 */
export type OperationalEvidence = "observed" | "inferred";

export interface ObservedIncident {
  evidence: "observed";
  id: string;
  /** Stable across snapshots while the same item and job type keep failing. */
  key: string;
  source: "fabric-job-history";
  workspaceId: string;
  itemId: string;
  itemName: string;
  itemType?: ItemType;
  jobType: string;
  /** Fabric job instance ID, when the collector returned one. */
  runId?: string;
  /** When the failed run started, as reported by Fabric. */
  occurredAt: string;
  /** When Atlas captured the run: the snapshot synchronization time. */
  observedAt?: string;
  /** First synchronization that captured this failure, from persisted records. */
  firstObservedAt?: string;
  /** Whether a persisted `OperationalIncident` record backs this incident. */
  recorded: boolean;
  durationSec: number;
  message?: string;
}

/**
 * A consumer reachable downstream of an incident in snapshot lineage. It is
 * `observed` only when that consumer has its own observed failure in the same
 * snapshot; otherwise the impact is inferred and unconfirmed.
 */
export interface DownstreamImpact {
  evidence: OperationalEvidence;
  incidentId: string;
  itemId: string;
  itemName: string;
  itemType?: ItemType;
  /** Lineage hops from the failed item. */
  distance: number;
  basis: "snapshot-lineage";
  /** The consumer's own observed incident, when `evidence` is `observed`. */
  observedIncidentId?: string;
}

/** @deprecated Use `DownstreamImpact`; kept for existing imports. */
export type InferredImpact = DownstreamImpact;

export interface IncidentImpact {
  incident: ObservedIncident;
  impact: DownstreamImpact[];
}

export type MonitoringSourceId =
  | "fabric-job-history"
  | "workspace-monitoring"
  | "monitor-hub-alerts"
  | "app-metrics";

export type MonitoringSourceStatus =
  | "collected"
  | "not-collected"
  | "fabric-only";

export interface MonitoringSource {
  id: MonitoringSourceId;
  label: string;
  status: MonitoringSourceStatus;
  maturity: "generally-available" | "preview";
  summary: string;
  prerequisites: string[];
  documentationUrl: string;
}

export const MONITORING_SOURCES: readonly MonitoringSource[] = [
  {
    id: "fabric-job-history",
    label: "Fabric job history",
    status: "collected",
    maturity: "generally-available",
    summary:
      "Recent job instances are captured at each synchronization and stored with the snapshot.",
    prerequisites: [
      "Read access to the items whose jobs are listed.",
      "A completed Atlas synchronization; nothing newer than the snapshot is shown.",
    ],
    documentationUrl:
      "https://learn.microsoft.com/en-us/rest/api/fabric/core/job-scheduler/list-item-job-instances",
  },
  {
    id: "workspace-monitoring",
    label: "Workspace monitoring",
    status: "not-collected",
    maturity: "preview",
    summary:
      "Atlas has no workspace-monitoring collector and cannot tell whether monitoring is enabled for this workspace.",
    prerequisites: [
      "A workspace admin configures a Monitoring Item and turns on collection; earlier activity is not backfilled.",
      "The workspace runs on Power BI Premium or Fabric capacity, and the tenant allows workspace admins to turn on monitoring.",
      "Querying the read-only monitoring KQL database needs at least the Contributor role or a shared Monitoring Item.",
      "Data is kept for 30 days by default; retention and caching are set on the monitoring KQL database.",
      "Ingestion, storage and queries consume Fabric capacity (Eventhouse and Eventstream).",
    ],
    documentationUrl:
      "https://learn.microsoft.com/en-us/fabric/fundamentals/workspace-monitoring-overview",
  },
  {
    id: "monitor-hub-alerts",
    label: "Monitor hub job alerts",
    status: "fabric-only",
    maturity: "preview",
    summary:
      "Alert rules and notifications are configured in the Fabric portal. No public API reads them.",
    prerequisites: [
      "Failure emails need the Contributor role in the workspace or Write permission on the item, and cover scheduled runs only.",
      "Activator-based rules need workspace Owner or Contributor and are unavailable where workspace monitoring is unavailable.",
    ],
    documentationUrl:
      "https://learn.microsoft.com/en-us/fabric/admin/monitoring-hub-alerts",
  },
  {
    id: "app-metrics",
    label: "Fabric App Metrics",
    status: "fabric-only",
    maturity: "preview",
    summary:
      "Sign-ins, app loads and GraphQL query volume, errors and duration for this app. No public read API is documented.",
    prerequisites: [
      "Write permission on the app to open Manage app > Metrics.",
      "The Monitor hub Applications page shows the same always-on platform metrics to users who can view the app.",
    ],
    documentationUrl: "https://learn.microsoft.com/en-us/fabric/apps/app-metrics",
  },
];

/** Stable incident identity: one failing item and job type in one workspace. */
export function incidentKey(
  workspaceId: string,
  itemId: string,
  jobType: string,
): string {
  return [
    "incident",
    "v1",
    workspaceId.trim().toLowerCase(),
    itemId.trim().toLowerCase(),
    jobType.trim().toLowerCase(),
  ].join(":");
}

type LatestRuns = Map<string, AtlasData["jobs"][number]>;

function latestRunByItemAndType(jobs: AtlasData["jobs"]): LatestRuns {
  const latest: LatestRuns = new Map();
  for (const job of jobs) {
    const started = new Date(job.startedAt).getTime();
    if (Number.isNaN(started)) continue;
    const key = `${job.itemFabricId.toLowerCase()}\u0000${job.jobType.toLowerCase()}`;
    const current = latest.get(key);
    if (!current || new Date(current.startedAt).getTime() < started) {
      latest.set(key, job);
    }
  }
  return latest;
}

/**
 * Failed runs whose item and job type have no newer recorded run. A failure
 * followed by a later run is history, not a current incident.
 */
export function observedIncidents(
  data: Pick<AtlasData, "workspace" | "items" | "jobs">,
  observedAt?: string,
): ObservedIncident[] {
  const itemById = new Map(data.items.map((item) => [item.fabricId, item]));
  return [...latestRunByItemAndType(data.jobs).values()]
    .filter((job) => job.status === "failed")
    .map((job) => {
      const item = itemById.get(job.itemFabricId);
      return {
        evidence: "observed" as const,
        id: searchJobId(job.itemFabricId, job.jobType, job.startedAt),
        key: incidentKey(data.workspace.fabricId, job.itemFabricId, job.jobType),
        source: "fabric-job-history" as const,
        workspaceId: data.workspace.fabricId,
        itemId: job.itemFabricId,
        itemName: item?.displayName ?? job.itemName,
        itemType: item?.itemType,
        jobType: job.jobType,
        ...(job.runId ? { runId: job.runId } : {}),
        occurredAt: job.startedAt,
        observedAt,
        recorded: false,
        durationSec: job.durationSec,
        message: job.message?.trim() || undefined,
      };
    })
    .sort(
      (left, right) =>
        new Date(right.occurredAt).getTime() -
          new Date(left.occurredAt).getTime() ||
        left.itemName.localeCompare(right.itemName),
    );
}

/** Persisted fields that enrich a derived incident for the same snapshot. */
export interface IncidentRecordFields {
  key: string;
  occurredAt: string;
  runId?: string;
  observedAt: string;
  firstObservedAt: string;
}

/**
 * Overlays persisted `OperationalIncident` records on incidents derived from
 * the same snapshot. Only a record for the same failing run is trusted.
 */
export function applyIncidentRecords(
  incidents: readonly ObservedIncident[],
  records: readonly IncidentRecordFields[],
): ObservedIncident[] {
  const byKey = new Map(records.map((record) => [record.key, record]));
  return incidents.map((incident) => {
    const record = byKey.get(incident.key);
    if (
      !record ||
      Date.parse(record.occurredAt) !== Date.parse(incident.occurredAt)
    ) {
      return incident;
    }
    return {
      ...incident,
      runId: incident.runId ?? record.runId,
      observedAt: record.observedAt,
      firstObservedAt: record.firstObservedAt,
      recorded: true,
    };
  });
}

/**
 * Joins each observed incident to the consumers reachable in authoritative
 * snapshot lineage. A consumer is labelled observed only when it has its own
 * observed incident; every other consumer stays inferred.
 */
export function joinIncidentImpact(
  data: Pick<AtlasData, "items" | "edges">,
  incidents: readonly ObservedIncident[],
): IncidentImpact[] {
  if (incidents.length === 0) return [];
  const itemById = new Map(data.items.map((item) => [item.fabricId, item]));
  const failingByItem = new Map<string, ObservedIncident>();
  for (const incident of incidents) {
    if (!failingByItem.has(incident.itemId)) {
      failingByItem.set(incident.itemId, incident);
    }
  }
  const index = createLineageIndex(
    normalizeLineageEdges(data.items, data.edges),
  );
  return incidents.map((incident) => {
    const downstream = getLineageImpact(index, incident.itemId).downstream;
    const impact = [...downstream.ids]
      .filter((id) => id !== incident.itemId)
      .map((id): DownstreamImpact => {
        const item = itemById.get(id);
        const ownIncident = failingByItem.get(id);
        return {
          evidence: ownIncident ? "observed" : "inferred",
          incidentId: incident.id,
          itemId: id,
          itemName: item?.displayName ?? id,
          itemType: item?.itemType,
          distance: downstream.distance.get(id) ?? Number.POSITIVE_INFINITY,
          basis: "snapshot-lineage",
          ...(ownIncident ? { observedIncidentId: ownIncident.id } : {}),
        };
      })
      .sort(
        (left, right) =>
          left.distance - right.distance ||
          left.itemName.localeCompare(right.itemName),
      );
    return { incident, impact };
  });
}

/** Derives incidents for one snapshot and joins them to its lineage. */
export function incidentImpact(
  data: Pick<AtlasData, "workspace" | "items" | "edges" | "jobs">,
  observedAt?: string,
  records: readonly IncidentRecordFields[] = [],
): IncidentImpact[] {
  return joinIncidentImpact(
    data,
    applyIncidentRecords(observedIncidents(data, observedAt), records),
  );
}

export type IncidentDeltaStatus =
  | "opened"
  | "persisting"
  | "recovered"
  | "unreported";

export interface IncidentDelta {
  status: IncidentDeltaStatus;
  key: string;
  /** The current incident, or the previous one when it is no longer failing. */
  incident: ObservedIncident;
  impact: DownstreamImpact[];
  /** The newer run that ended the incident, when one was captured. */
  recoveredBy?: { status: AtlasData["jobs"][number]["status"]; startedAt: string };
}

export interface IncidentComparison {
  previousSnapshotId: string;
  currentSnapshotId: string;
  previousObservedAt: string;
  currentObservedAt: string;
}

const DELTA_ORDER: Record<IncidentDeltaStatus, number> = {
  opened: 0,
  persisting: 1,
  recovered: 2,
  unreported: 3,
};

/**
 * Compares the incidents of two validated snapshots. An incident is recovered
 * only when a newer run of the same item and job type was captured; when the
 * job is simply absent from the newer history it is reported as unreported.
 */
export function diffIncidents(
  previous: Pick<AtlasData, "workspace" | "items" | "edges" | "jobs">,
  current: Pick<AtlasData, "workspace" | "items" | "edges" | "jobs">,
  comparison: IncidentComparison,
): IncidentDelta[] {
  const before = incidentImpact(previous, comparison.previousObservedAt);
  const after = incidentImpact(current, comparison.currentObservedAt);
  const beforeByKey = new Map(before.map((entry) => [entry.incident.key, entry]));
  const afterByKey = new Map(after.map((entry) => [entry.incident.key, entry]));
  const latestCurrent = latestRunByItemAndType(current.jobs);
  const deltas: IncidentDelta[] = [];
  for (const entry of after) {
    deltas.push({
      status: beforeByKey.has(entry.incident.key) ? "persisting" : "opened",
      key: entry.incident.key,
      incident: entry.incident,
      impact: entry.impact,
    });
  }
  for (const entry of before) {
    if (afterByKey.has(entry.incident.key)) continue;
    const newer = latestCurrent.get(
      `${entry.incident.itemId.toLowerCase()}\u0000${entry.incident.jobType.toLowerCase()}`,
    );
    const recovered =
      !!newer &&
      Date.parse(newer.startedAt) > Date.parse(entry.incident.occurredAt);
    deltas.push({
      status: recovered ? "recovered" : "unreported",
      key: entry.incident.key,
      incident: entry.incident,
      impact: entry.impact,
      ...(recovered
        ? { recoveredBy: { status: newer.status, startedAt: newer.startedAt } }
        : {}),
    });
  }
  return deltas.sort(
    (left, right) =>
      DELTA_ORDER[left.status] - DELTA_ORDER[right.status] ||
      left.incident.itemName.localeCompare(right.incident.itemName) ||
      left.key.localeCompare(right.key),
  );
}

/** Provenance and limits that travel with every incident feed. */
export const INCIDENT_LIMITATIONS = [
  "Incidents come from Fabric job history captured at synchronization; nothing newer than the snapshot is known.",
  "Downstream impact is inferred from snapshot lineage unless the consumer has its own observed failure.",
  "Fabric failure reasons, logs, query text and business rows are not collected.",
  "Workspace monitoring telemetry and Monitor hub alerts are not collected.",
] as const;

export type MonitorHubPage = "jobs" | "alerts" | "applications";

/** Monitor hub routes verified in the Fabric portal on 2026-10-02. */
export const MONITOR_HUB_PAGES: Record<MonitorHubPage, string> = {
  jobs: "monitoringhub/jobs",
  alerts: "monitoringhub/alerts",
  applications: "monitoringhub/applications",
};

export interface FabricPortalContext {
  portalBase?: string;
  tenantId?: string;
}

/** Portal origin and tenant for native links, from the deployment configuration. */
export function fabricPortalContext(): FabricPortalContext {
  return {
    portalBase: import.meta.env.VITE_FABRIC_PORTAL_URL as string | undefined,
    tenantId: ATLAS_CONFIG.tenantId,
  };
}

const DEFAULT_PORTAL = "https://app.fabric.microsoft.com";

function portalOrigin(portalBase: string | undefined): string {
  try {
    const url = new URL(portalBase?.trim() || DEFAULT_PORTAL);
    return url.protocol === "https:" ? url.origin : DEFAULT_PORTAL;
  } catch {
    return DEFAULT_PORTAL;
  }
}

function portalQuery(tenantId: string | undefined): string {
  const params = new URLSearchParams({ experience: "fabric-developer" });
  if (tenantId && UUID.test(tenantId.trim())) {
    params.set("ctid", tenantId.trim().toLowerCase());
  }
  return params.toString();
}

export function monitorHubUrl(
  page: MonitorHubPage,
  { portalBase, tenantId }: FabricPortalContext = {},
): string {
  return `${portalOrigin(portalBase)}/${MONITOR_HUB_PAGES[page]}?${portalQuery(tenantId)}`;
}

/**
 * Opens the deployed Atlas app item, where Manage app > Metrics lives. Returns
 * undefined unless both the deployment workspace and app item IDs are valid.
 */
export function fabricAppItemUrl({
  portalBase,
  tenantId,
  workspaceId,
  itemId,
}: FabricPortalContext & {
  workspaceId?: string;
  itemId?: string;
}): string | undefined {
  const workspace = workspaceId?.trim() ?? "";
  const item = itemId?.trim() ?? "";
  if (!UUID.test(workspace) || !UUID.test(item)) return undefined;
  return `${portalOrigin(portalBase)}/groups/${workspace.toLowerCase()}/appbackends/${item.toLowerCase()}?${portalQuery(tenantId)}`;
}
