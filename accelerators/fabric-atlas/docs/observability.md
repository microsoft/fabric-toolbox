# Observability and operational incidents

Fabric Atlas does not collect live monitoring telemetry. The product adds to
**Jobs & health**, Governance Radar and the incident feeds:

- native links to the Fabric Monitor hub and to the Atlas app's own metrics
- one model that separates *observed* failures from *inferred* downstream impact
- allowlisted `OperationalIncident` records written during the existing browser
  synchronization from sanitized Fabric job history
- incident changes between two validated snapshots, fed into Governance Radar
  and into the Sync Brief and Watchlist inputs
- an explicit status for every monitoring source, including the ones Atlas
  cannot read

Nothing here adds a monitoring collector, a scheduled job or a background poll.
When a monitoring source or the incident entity is unavailable, the validated
catalog, lineage and job history stay usable.

## Evidence model

`src/atlas/observability.ts` defines two evidence classes. The UI labels each one
with its own chip.

| Evidence | Meaning | Source | Label |
| --- | --- | --- | --- |
| Observed | The latest recorded run of an item and job type failed | Fabric job history captured at synchronization (`List Item Job Instances`) | Solid **Observed failure** chip |
| Inferred | A consumer reachable downstream of the failed item | Normalized snapshot lineage (`LineageEdge`) | Dashed **Inferred impact** chip |

- An observed incident carries the source workspace ID, item ID, job type, the
  Fabric job instance ID when the collector returned one (`runId`), the run start
  (`occurredAt`), the snapshot capture time (`observedAt`) and a stable incident
  key `incident:v1:<workspace>:<item>:<job type>`. Its ID is the existing
  deterministic job search ID, so **Show this run** focuses the exact row in Run
  history.
- A failure followed by a later run of the same item and job type is history,
  not a current incident. A running latest run is not treated as a failure.
- Downstream impact walks only downstream edges of the authoritative snapshot
  lineage, never reports the failed item or upstream producers, and records the
  hop distance. A consumer is **observed** only when it has its own observed
  incident in the same snapshot ("also failing (observed)"); every other consumer
  is **inferred** and "not confirmed by monitoring". **Open impact in Map &
  lineage** opens the item in focused impact mode (`?item=<id>&impact=focused#map`).

## Stored incident records

`OperationalIncident` (`rayfin/data/OperationalIncident.ts`) stores one row per
observed incident of a published snapshot. `src/atlas/operational-incident-store.ts`
builds and writes the rows; `persistSync` calls it after the `Workspace` marker
is created and before snapshot retention.

- **Allowlist.** Workspace, snapshot, writer, incident key, item ID, item name,
  item type, job type, run ID, run start, duration, observation time, first
  observation and the `fabric-job-history` source. Failure reasons,
  `JobRun.message`, logs, query text, business rows and tokens are never stored.
  Item IDs and job types outside their expected character sets are skipped and
  counted; control characters are removed from item names.
- **Bounds and idempotency.** At most 500 rows per snapshot. Row IDs are
  deterministic UUIDs of the snapshot and incident key, so a retried write does
  not duplicate rows, and rows already present are not rewritten.
- **First observation.** When the same incident key was already failing in the
  immediately preceding published snapshot, `firstObservedAt` and
  `firstObservedSnapshotId` are carried over; Jobs & health shows them as
  "failing since".
- **Retention.** Rows of the newest `snapshotRetentionCount` snapshots are kept;
  older rows are deleted, at most 200 per synchronization.
- **Failure handling.** A missing entity, an invalid row or a failed write only
  logs a warning; the published snapshot stays valid. Jobs & health then states
  that incidents are derived from the snapshot job history.
- **Reads.** Only rows from configured synchronizer writers that pass contract
  validation are used, and only when they match the same failing run as the
  incident derived from the snapshot.

## Incident changes, Radar, Sync Brief and Watchlists

`diffIncidents` compares the incidents of two validated snapshots:

| Status | Meaning |
| --- | --- |
| Opened | Failing now, not failing in the previous snapshot |
| Persisting | Failing in both snapshots |
| Recovered | A newer run of the same item and job type was captured and did not fail |
| No longer reported | No newer run was captured; the failure may be outside the retained job history |

- **Governance Radar** lists opened incidents once, replacing the new
  failed-run finding of the same run. An incident is critical only when a
  downstream consumer has its own observed failure; otherwise it is high. Its
  detail states the inferred and observed downstream counts and that the failure
  reason is not collected. The exported digest adds an *Operational incidents
  opened* section followed by the provenance and limits. **Open evidence** opens
  the run in Jobs & health.
- **Sync Brief input.** `incidentBriefSection` groups the deltas and ranks the
  widest downstream impact; `incidentBriefMarkdown` renders it with the compared
  snapshot IDs and times, explicit empty groups, and the limits. Jobs & health
  shows the counts since the previous snapshot and copies this Markdown.
- **Watchlist input.** `incidentWatchEvents` returns, for watched item IDs, their
  own opened or recovered incidents (observed) and opened upstream incidents
  that reach them, labelled with the impact evidence.
- The Sync Brief (#40) and Watchlists (#38) pages do not exist yet. Both feeds
  are tested contracts ready for those pages; they are not rendered elsewhere.

Every feed carries these limits:

- Incidents come from Fabric job history captured at synchronization; nothing
  newer than the snapshot is known.
- Downstream impact is inferred from snapshot lineage unless the consumer has its
  own observed failure.
- Fabric failure reasons, logs, query text and business rows are not collected.
- Workspace monitoring telemetry and Monitor hub alerts are not collected.

## Monitoring sources

| Source | Atlas status | Why |
| --- | --- | --- |
| Fabric job history | Collected | Read through the Job Scheduler REST API at each synchronization and stored with the snapshot |
| Workspace monitoring | Not collected | No Atlas collector exists. Atlas cannot detect whether monitoring is enabled |
| Monitor hub job alerts | Fabric portal only | Alert rules and notifications have no public read API |
| Fabric App Metrics | Fabric portal only | No public read API is documented |

## Native navigation

The Monitor hub routes were verified in the Fabric portal on 2026-10-02. Each
link adds `experience=fabric-developer` and, when `VITE_FABRIC_TENANT_ID` or
`VITE_ATLAS_TENANT_ID` is a valid tenant ID, `ctid=<tenant>` so guest users
reach the right tenant. Only HTTPS values of `VITE_FABRIC_PORTAL_URL` are used;
anything else falls back to `https://app.fabric.microsoft.com`.

| Link | Route | Notes |
| --- | --- | --- |
| Job runs in Monitor hub | `/monitoringhub/jobs` | Preview. Shows only items the user can view |
| Alerts in Monitor hub | `/monitoringhub/alerts` | Preview. Alert configuration stays in Fabric |
| Applications in Monitor hub | `/monitoringhub/applications` | Preview. Always-on platform metrics for apps the user can view |
| Open the Atlas app item | `/groups/<workspace>/appbackends/<item>` | Shown only when `VITE_FABRIC_WORKSPACE_ID` and `VITE_FABRIC_ITEM_ID` are valid IDs. Then select **Manage app > Metrics** |

The Monitor hub does not document deep links that pre-filter a workspace or an
item, so Atlas links to each page and does not invent filter parameters.

## Workspace monitoring prerequisites

Source: [Workspace monitoring overview](https://learn.microsoft.com/en-us/fabric/fundamentals/workspace-monitoring-overview)
and [Configure workspace monitoring](https://learn.microsoft.com/en-us/fabric/fundamentals/enable-workspace-monitoring),
checked on 2026-10-02.

- **Capacity.** The workspace must be assigned to Power BI Premium or a Fabric
  capacity.
- **Tenant settings.** A Fabric administrator must enable *Workspace admins can
  turn on monitoring for their workspaces*, and *Users can create Fabric items*
  must be enabled for the person configuring it.
- **Who enables it.** A workspace admin creates the Monitoring Item and then
  turns on collection. Collection is off when the item is created, and earlier
  activity is never backfilled.
- **Who can read it.** Workspace users with at least the Contributor role can
  query the read-only monitoring KQL database. The Monitoring Item can also be
  shared with people who have no workspace role.
- **Retention.** Data is kept for 30 days by default. Retention and caching are
  changed on the monitoring KQL database (*Manage > Data policies*). The caching
  period must not exceed the retention period.
- **Cost.** Ingestion, storage and queries consume Fabric capacity through
  Eventhouse, KQL database and Eventstream usage. Power BI reports and Activator
  alerts on the monitoring database respect capacity throttling.
- **Topology.** One Monitoring Item collects telemetry per workspace. Sending
  data to another Monitoring Item requires both workspaces in the same Azure
  region, and the destination cannot be changed later. Each source workspace
  adds a KQL database to the destination workspace's item limit.
- **Coverage.** A table appears only after a supported item emits telemetry.
  Supported telemetry includes item job events, pipeline activity runs, copy jobs,
  semantic model operations, Eventhouse, Eventstream, mirrored databases, GraphQL
  and Activator.

## Monitor hub alerts and App Metrics

- [Monitor hub job alerts](https://learn.microsoft.com/en-us/fabric/admin/monitoring-hub-alerts)
  are in Preview and portal-only. Failure emails need the Contributor role in the
  workspace or Write permission on the item and cover scheduled runs only.
  Activator-based rules need workspace Owner or Contributor and are unavailable
  where workspace monitoring is unavailable.
- [App Metrics](https://learn.microsoft.com/en-us/fabric/apps/app-metrics) are in
  Preview. They show sign-ins, app loads, GraphQL query count, error count, error
  rate and average server-side duration over 24 hours, 7 days or 30 days in UTC.
  Opening **Manage app > Metrics** requires Write permission on the app. App
  Metrics is not a capacity consumption report, and it has no individual error
  drill-down.

## Job failure detail

The Python User Data Function and the Fabric Core collector keep job instance
identity, status and timestamps only. They deliberately drop Fabric's
`failureReason`, because failure messages can carry paths, query text or other
content outside the metadata allowlist; collector tests assert that the private
failure text is never stored. Jobs & health therefore shows **Error detail not
collected by Atlas** for a failed run without a stored message, with a link to
the Monitor hub Job runs page where Fabric shows the error. A stored
`JobRun.message` is shown with the label **Fabric job detail**. Atlas never
claims that Fabric returned no detail.

## Remaining collector blockers

These API-only portions stay deferred:

1. **No read API for alerts.** Monitor hub alerts and App Metrics expose no
   documented read API, so Atlas can only link to them.
2. **Workspace monitoring is opt-in and unknown to Atlas.** A workspace admin must
   enable it per workspace, it costs capacity, and Atlas has no supported way to
   detect whether it is on.
3. **No supported Kusto path.** Reading the monitoring KQL database needs a
   Kusto-audience token and at least Contributor access. The Rayfin Kusto
   connector is not documented, and Fabric Apps Functions use the AppBackend
   owner identity, which is not proven to have that access. Incidents therefore
   come only from job history, not from workspace-monitoring telemetry.
4. **No verified impact join.** Downstream impact stays inferred unless the
   consumer has its own observed failure; no telemetry signal yet proves that a
   consumer was affected by an upstream failure.
5. **No failure reasons.** Showing Fabric's job error requires a reviewed
   redaction and length policy for `failureReason`, matching changes in the Python
   User Data Function and the Fabric Core collector, and parity tests before any
   message is persisted.
6. **Synchronization-bound freshness.** Incidents update only when the
   synchronizer runs a browser synchronization; scheduled collection stays
   disabled until the scheduling gate passes.
