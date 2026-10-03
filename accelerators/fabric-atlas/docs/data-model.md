# Data model

Rayfin entity classes live in `rayfin/data/` and are registered in
`rayfin/data/schema.ts`.

Fabric Atlas stores synchronized metadata as immutable snapshots. Every catalog
row carries a `snapshotId`. A `Workspace` manifest is written last and makes the
snapshot visible only after every row succeeds. Hydration ignores incomplete
snapshots and falls back to the previous valid one.

Synchronized entities allow reads to every authenticated user admitted to the
deployed app. There is no per-user read policy on the shared catalog, so that
audience can read the complete workspace metadata graph. Creates require the
authenticated email to match the row's `writerEmail`, and hydration only trusts
the writer configured for the deployment. They do not expose update or delete
actions to ordinary users. The configured synchronizer alone can delete stale
snapshot rows for retention; update remains disabled.

Comments also allow shared authenticated reads. Creates require both
`authorEmail == claims.email` and `authorId == claims.sub`.

`SavedView` and `AccessReview` records are user-scoped. Their read, create,
update and delete policies require the authenticated subject claim to match
`user_id`.

`FindingAck` uses the same user scope. Its composite record key is a SHA-256 of
workspace, user and stable finding ID so different users can acknowledge the
same governance signal independently.

`AccessReviewEvent` allows only personal create and read operations under the
same subject policy. `GovernancePolicy` and `GovernanceException` allow shared
authenticated reads; only the configured synchronization administrator can
write them. `WorkspaceScope` follows the same shared-read, administrator-write
boundary and stores selected workspaces only.

## AccessPolicyEvidence

Optional immutable workspace-policy context, separate from grant truth and from
the required snapshot manifest. Shared authenticated reads; create requires the
configured synchronizer subject and caller email matching `writerEmail`; delete
is synchronizer-only; update is disabled.

`id`, `workspace_id`, `snapshotId`, `collectionId`, `writerEmail`, `schemaVersion`,
`kind`, `source`, `collectorIdentity`, `coverage`, `reason`, `attemptedAt`,
`observedAt?`, `inboundPublicAction?`, `outboundPublicAction?`,
`externalSharesBypassAction?`

Only explicit `Allow`/`Deny` network setting values are stored, not principal
decisions, policy rules, tokens or business rows. A blocked central evaluation
entry has no observed timestamp or decision. See
[access-policy-evidence.md](access-policy-evidence.md) for verified contracts,
omitted fields and the default-off live gate.

## Workspace

The manifest for a complete synchronized snapshot.

`snapshotId`, `writerEmail?`, `deploymentId?`, `fabricId`, `displayName`, `capacity?`, `region?`, `itemCount?`,
`edgeCount?`, `principalCount?`, `grantCount?`, `jobCount?`, `configCount?`,
`schemaEntryCount?`, `syncSectionsJson?`, `summaryVersion?`, `healthyCount?`,
`staleCount?`, `failingCount?`, `labelCount?`, `externalPrincipalCount?`,
`failedJobCount?`, `brokenEdgeCount?`, `tableCount?`, `columnCount?`,
`measureCount?`, `syncedAt?`

`syncSectionsJson` persists the versioned UDF section and metadata-capability
status used by Governance Center. It contains collection state, not business
data.

Summary version 1 reproduces the Governance history metrics without loading
child rows. Older manifests remain compatible and fall back to full validated
catalog loading.

## WorkspaceScope

One row per administrator-selected Fabric workspace.

`id`, `displayName`, `workspaceType?`, `capacityId?`, `writerEmail?`, `selectedAt`

The row ID is the Fabric workspace UUID. Authenticated app users can read the
selected scope. Create requires the configured synchronizer subject and
`writerEmail == claims.email`; update and delete require the same subject.
Discovery results that are not selected are not stored, so the entity does not
expose every workspace available to the AppBackend owner.

Before the first explicit scope change, the configured deployment workspace is
used as an in-memory fallback. Selecting another workspace persists that
fallback first, which makes later add and remove operations explicit. The scope
manager refuses to remove the final selected row. It also refuses removal while
shared Atlas rows still reference the workspace, because dropping only the
scope row would not revoke app-audience access to catalog data or append-only
team notes.

## SynchronizerAuthority

A single global sentinel used by Rayfin Functions before they read an
application-identity Fabric token.

`id`, `createdAt`

Every action requires the configured synchronizer subject. An authorized first
invocation creates the deterministic sentinel. Later invocations must read it
through the same policy. A caller whose row-level policy hides the sentinel
cannot pass merely because an empty query succeeded.

## FabricItem

One row per Fabric item.

`workspace_id`, `snapshotId`, `writerEmail?`, `fabricId`, `displayName`, `itemType`,
`description?`, `ownerName?`, `ownerEmail?`, `configuredBy?`, `modifiedBy?`,
`health`, `endorsement`, `endorsementRaw?`, `endorsementBy?`, `sensitivity?`,
`sensitivityLabelId?`, `tags?`, `tagIds?`, `ownerMetadataAvailable?`,
`sensitivityMetadataAvailable?`, `endorsementMetadataAvailable?`,
`tagMetadataAvailable?`, `lastRefresh?`, `itemCreatedAt?`, `itemUpdatedAt?`

The availability flags distinguish an observed empty value from metadata that
was not collected. Label and tag IDs remain IDs unless a separate trusted
directory resolves their display names.

## LineageEdge

A directed dependency from source to consumer.

`workspace_id`, `snapshotId`, `writerEmail?`, `sourceFabricId`, `targetFabricId`, `relation`,
`broken`

## Principal

A user, group, service principal or guest.

`workspace_id`, `snapshotId`, `writerEmail?`, `principalId`, `displayName`, `kind`, `email?`,
`external`

## AccessGrant

Effective workspace-level or item-level access.

`workspace_id`, `snapshotId`, `writerEmail?`, `itemFabricId?`, `principalRef`, `accessLevel`,
`source`, `roleName?`, `flag?`

## JobRun

A refresh, pipeline or notebook run.

`workspace_id`, `snapshotId`, `writerEmail?`, `itemFabricId`, `itemName`, `jobType`, `status`,
`startedAt?`, `durationSec?`, `message?`

## ConfigEntry

A configuration fact or a chunk of serialized object metadata.

`workspace_id`, `snapshotId`, `writerEmail?`, `itemFabricId`, `section`, `label`, `value?`

Schema chunks use the private `__schema__` section. Chunking preserves complete
object lists within the bounded SQL text field. A hidden metadata envelope
retains safe KQL, Ontology, Graph Model and Data Agent structures after reload.

Verified object-lineage edges use the private `__object_edges__` section. Each
edge stores source and target item, object kind, stable ID, readable name,
optional parent/table context, relation and `confidence: verified`. The parser
rejects inferred, malformed or self-referential edges without imposing a
relation-count cap on the verified set.

No extra Rayfin entity is required, so this metadata follows the same immutable
snapshot publication and retention boundary as the catalog.

## Comment

A team note on the workspace or an item.

`workspace_id`, `itemFabricId?`, `authorId`, `authorName`, `authorEmail?`,
`body`, `createdAt`

Comments are not tied to a catalog snapshot, so they survive every refresh.
They are append-only because `Comment` exposes create and read but no
update or delete action. `authorName` and `authorEmail` store the authenticated
email supplied by the Rayfin session. `authorId` is bound to the authenticated
subject. Client-selected catalog labels cannot impersonate another note author.

## SyncRun

The durable audit record for a running, completed or failed synchronization
attempt.

`workspace_id`, `snapshotId`, `correlationId?`, `writerEmail?`, `startedAt`,
`finishedAt?`, `status`, `itemsSynced?`, `durationMs?`, `failureCode?`,
`failureMessage?`, `triggeredBy?`, `summary?`

## ItemRelationsEvidenceSnapshot

Non-authoritative Fabric Item Relations API (Beta) evidence, stored per
workspace and associated with the Atlas snapshot published by the same
synchronization. It is never read into `LineageEdge`.

`workspace_id`, `snapshotId`, `evidenceId`, `correlationId?`, `writerEmail`,
`rowType` (`manifest` or `chunk`), `chunkIndex`, `chunkCount`, `payload`
(3,500), `collectedAt`, and manifest-only `storageVersion?`, `payloadLength?`,
`payloadHash?` (64), `queryCount?`, `completeQueryCount?`,
`preservedQueryCount?`, `failedQueryCount?`, `relationCount?`,
`unresolvedCount?`, `crossWorkspaceCount?`, `conflictCount?`,
`sampledItemCount?`, `workspaceItemCount?`, `stopReasons?` (200)

Each envelope is the schema-version 1 evidence contract serialized as JSON and
split into ordered `chunk` rows; the `manifest` row is written last and carries
the SHA-256 and derived counts. Readers trust only configured synchronizer
writers, verify every chunk and the checksum, and ignore envelopes without a
valid manifest. Reads are shared with the authenticated app audience; creates
require the configured synchronizer subject and matching `writerEmail`, deletes
require the synchronizer subject, and there is no update. The three newest
envelopes per workspace are kept. Old rows are never rewritten; the entity is
additive and needs no data migration. See
[item-relations-evidence.md](item-relations-evidence.md#persisted-evidence).

## OperationalIncident

Observed operational incidents derived from the sanitized Fabric job history of
a published snapshot: the latest captured run of one item and job type failed.
Rows are written by the browser synchronization after the `Workspace` marker,
never before it, and a failed or missing write does not fail the sync.

`workspace_id`, `snapshotId`, `writerEmail`, `incidentKey` (240,
`incident:v1:<workspace>:<item>:<job type>`), `itemFabricId` (100), `itemName`
(200), `itemType?` (60), `jobType` (60), `runId?` (Fabric job instance UUID),
`occurredAt` (run start), `durationSec?`, `observedAt` (snapshot sync time),
`firstObservedAt`, `firstObservedSnapshotId?`, `source` (`fabric-job-history`),
`contractVersion` (1)

The field list is an allowlist. Fabric failure reasons, `JobRun.message`, logs,
query text, business rows and tokens are never stored. Job types and item IDs
outside their expected character sets are skipped and counted, at most 500 rows
are written per snapshot, and row IDs are deterministic per snapshot and
incident key so retries do not duplicate rows. `firstObservedAt` is carried from
the immediately preceding published snapshot when the same incident key was
already failing there. Downstream impact is not stored; it is joined at read
time from the same snapshot's lineage. Readers trust only configured
synchronizer writers and validate every row. Reads are shared with the
authenticated app audience; creates require the configured synchronizer
subject and matching `writerEmail`, deletes require the synchronizer subject,
and there is no update. Rows for the newest `snapshotRetentionCount` snapshots
are kept. The entity is additive and needs no data migration; until it is
deployed, Atlas derives incidents from the snapshot job history and says so.
See [observability.md](observability.md#stored-incident-records).

## Durable synchronization probe

These three additive entities are separate from immutable snapshots and the
existing `SyncRun` audit. They remain a fail-closed durability probe; the
active browser flow uses Rayfin-first collectors plus exact Python
compatibility and does not use the probe to publish a snapshot. The probe
allocates a candidate `snapshotId` but never publishes its manifest or writes
snapshot children. Its UUID references are scalar fields, with no navigation
to a `Workspace` manifest.

### SyncJob

`id`, `workspace_id`, `snapshotId`, `protocolVersion`, `state`, `phase`, `revision`,
`totalTasks`, `completedTasks`, `createdAt`, `updatedAt`, `finishedAt?`, `failureCode?`,
`failureMessage?`, `activeKey?`, `initiatedBySubject?`, `initiatedByEmail?`

Protocol version is 1, phase is `probe`, and state is `queued`, `running`, `waiting`, `completed`,
`failed` or `cancelled`. The spike plans one task; `totalTasks` is the planned count even if task
creation was interrupted. A unique 80-character `activeKey` reserves one
active job per workspace. Terminal jobs retain a unique released key rather than NULL, so multiple
terminal jobs work with MSSQL unique constraints. Revision advances on job state transitions.
Failure code/message bounds are 64/240 characters; optional initiator fields are bounded at 160
and remain unset until a trusted runtime claim accessor is available.

Authenticated app users can read jobs. Create, update and delete require
`claims.sub == SYNC_WRITER_SUBJECT`.

### SyncTask

`id`, `workspace_id`, `jobId`, `taskKey`, `kind`, `state`, `attemptCount`,
`claimRequestId?`, `createdAt`, `updatedAt`, `finishedAt?`, `failureCode?`, `failureMessage?`

The unique 80-character `taskKey` and UUID derive from job and `probe` kind. States are `pending`,
`running`, `completed`, `failed` or `cancelled`. A claim records the original request UUID and
increments the probe's attempt count once. Only that request may resume a running checkpoint;
there is no lease expiry or takeover. Failure fields use the same 64/240-character bounds.
Every action, including read, requires the synchronizer subject.

### SyncCommand

`id`, `workspace_id`, `recordKey`, `requestId`, `command`, `jobId?`, `inputHash`,
`state`, `createdAt`, `completedAt?`, `outcomeCode?`

Commands are `start`, `continue` or `cancel`; state is `accepted`, `completed` or `failed`.
The globally unique 80-character record key binds a request UUID. The 64-character input hash
includes operation, protocol, workspace and optional job. A different input cannot reuse the same
request UUID, even across workspaces or command kinds. The 64-character outcome field checkpoints
the intended slice before work and the final allowlisted outcome afterward. Transient unconfirmed
writes leave commands accepted for recovery with the original input. Every action requires the
synchronizer subject.

These rows store no browser token, arbitrary endpoint, request body or business data. There is no
separate workspace-state row. Uniqueness and persisted read-back support retries under serialized
invocations; they do not establish distributed atomic task claims. See
[architecture.md](architecture.md#phase-2-persistence-probe-no-cutover) for the concurrency boundary.

### Version 2 additive graph fields

Existing v1 rows remain valid: their new optional fields are null/absent, their
phase/kind stays `probe`, and the v1 latest-job query filters `protocolVersion: 1`.
There is no reinterpretation or backfill of probe rows.

**SyncRootRun** is the only new graph entity. Its fields are `id`, `requestId`,
`protocolVersion`, `planHash` (64 characters), `workspaceCount`, `state`,
`executionMode`, `createdAt`, `updatedAt`, `cancelRequestedAt?` and `finishedAt?`.
IDs are strict UUIDs; version is 2; workspace count is 1 through 16. States are
`planning`, `ready`, `running`, `completed`, `cancelled`; execution mode is
`external-serialized`. Authenticated users can read roots, while mutations require
the configured synchronizer subject.

**SyncJob** is also the per-workspace v2 run. Additions are `rootRunId?`,
`publicationState?` (`unpublished`, `staged`, `published`), `manifestId?` and
`snapshotHash?` (64 characters). V2 phases are `collect`, `persist`, `publish`.
`initiatedByEmail` records the configured publication writer, not a decoded caller
claim; the subject field remains unset. `activeKey` uses a version-separated
workspace digest and becomes a per-job released key at completion/cancellation.
That uniqueness does not serialize v1/v2 writers or provide an atomic task claim.

**SyncTask** adds optional `protocolVersion`, `rootRunId`, `ordinal`,
`dependsOnTaskId`, `payloadRef`, `payloadHash`, `checkpointRef`, `checkpointHash`
and `checkpointOffset`. Reference fields are UUIDs, hashes are 64-character
SHA-256 values, and offset is a bounded integer. V2 kinds are `core`, `definitions`,
`relations`, `kql`, `sql`, `scanner`, `persist`, `publish`. The fixed dependency
chain is checked on every continuation. Payloads live behind a reviewed external
immutable-store interface, never as JSON in task rows. Optional `leaseExpiresAt`
and `claimEpoch` reserve a future lease shape; the current engine rejects either
when populated. They confer no ownership, renewal or takeover rights.

**SyncCommand** adds optional `protocolVersion`, `rootRunId`, `taskId` and
`taskAttempt`. V2 continue commands bind a request to a single task slice before work. Partial
collector/persist checkpoints plus the original claim request distinguish a
committed slice from an interrupted attempt. Root start is idempotent by request
UUID and plan hash; root cancellation is a monotonic, idempotent barrier.

**Workspace** adds optional `publicationHash` (64 characters). Existing markers
need no value. A v2 marker binds the frozen row set and manifest metadata to the
workspace job's `snapshotHash`. `SyncRun` and all catalog entity policies remain
unchanged. Data rows precede audit completion and the final manifest; the
publisher performs no deletion or retention sweep.

No additive orchestration field stores tokens, request bodies, arbitrary URLs,
raw definitions, business rows or large collector payloads. These schemas and
local tests do not prove distributed durability. Public v2 mutations are blocked
until the serialization, immutable store and adapter deployment seams described
in [architecture.md](architecture.md#phase-2-v2-server-cutover-framework-disabled)
are resolved.

### Immutable SQL payload storage

Two additional entities back `SqlMetadataPayloadStore`:

| Entity | Fields |
| --- | --- |
| `SyncPayloadManifest` | UUID `id`, `taskId`, optional `checkpointId`; `schemaId` (80), `checksumVersion` (32), `contentHash` (64); integer `byteCount`, `chunkCount` |
| `SyncPayloadChunk` | UUID `id`, `payloadId`; integer `ordinal`; `content` (1,800 UTF-16 code units), `contentHash` (64) |

Both declare synchronizer-only `read` and `create`, with no update/delete policy
in the Rayfin API. The SQL store likewise has only fixed SELECT/INSERT commands.
The manifest ID derives from codec schema, task and checkpoint; each chunk ID
derives from manifest and ordinal. Content is canonical JSON from a mandatory
reviewed projection codec, not an arbitrary upstream response. The envelope
rejects credential keys, credential-shaped text and URLs, and enforces nesting,
node, string and aggregate limits. It does not replace domain-specific checks
that distinguish metadata from business data.

Payloads are limited to 1 MiB of UTF-16LE bytes and 292 chunks. Surrogate pairs
are not split across rows. Checksum version `sha256-utf16le-v1` matches Node
`createHash('sha256').update(content, 'utf16le')` and SQL
`HASHBYTES('SHA2_256', CONVERT(varbinary(max), @content))`. These checksums detect
drift/corruption; they are not signatures against a privileged database writer.

The SQL store inserts all chunks, inserts the manifest last, reads everything
back, then commits the same application-locked transaction. A failed transaction
rolls back rather than publishing partial storage. An uncertain commit is
retried with the same deterministic key; different content produces
`SQL_PAYLOAD_CONFLICT`. No payload is overwritten, pruned or deleted.

Direct SQL does not inherit Rayfin GraphQL policies. The Functions entry helper
must pass the synchronizer authority gate, and its SQL identity needs reviewed
table permissions. Do not grant a general SQL endpoint to app-audience users.
The additive entities and payload transactions have local tests only; deployment
and application-identity execution remain required. The graph runtime is still
disabled because a payload SQL lock cannot fence its independent GraphQL writes.

## SavedView

A personal named view over Atlas navigation and filters.

`workspace_id`, `user_id`, `name`, `section`, `filtersJson`, `createdAt`,
`updatedAt`

## AccessReview

A legacy personal decision for one effective principal and item pair.

`workspace_id`, `user_id`, `recordKey`, `rowKey`, `itemFabricId`,
`principalRef`, `status`, `note?`, `reviewedAt`, `updatedAt`

The status is `reviewed`, `accepted` or `needsAction`.

Legacy rows remain available as history. They require revalidation because they
do not carry the permission evidence needed to confirm a current decision.

## AccessReviewEvent

An append-only personal decision or clear event.

`workspace_id`, `user_id`, `rowKey`, `itemFabricId`, `principalRef`, `status`,
`evidenceKey`, `eventOrder`, `note?`, `occurredAt`

The status is `reviewed`, `accepted`, `needsAction` or `cleared`. The evidence
fingerprint includes the resolved principal and underlying grants, independently
of grant order or display names. The newest event determines the current
decision. Clearing appends an event and retains all earlier records.

## GovernancePolicy

Shared targets scoped to one selected workspace.

`workspace_id`, `recordKey`, `writerEmail`, `documentationTarget`,
`ownershipTarget`, `sensitivityTarget`, `accessTarget`, `lineageTarget`,
`operationsTarget`, `updatedById`, `updatedByName`, `updatedByEmail`, `updatedAt`

Targets are whole percentages from 0 to 100. When no policy row exists, all six
default to 70. An unavailable or invalid persisted policy is reported as an
error rather than treated as an absent policy.

## GovernanceException

A shared, expiring annotation for one stable finding.

`workspace_id`, `recordKey`, `writerEmail`, `findingId`, `reason`, `expiresAt`,
`authorId`, `authorName`, `authorEmail`, `createdAt`, `updatedAt`

The administrator supplies a justification and future expiry. The UI retains
the raw finding and score and distinguishes active, expired and invalid
exceptions. This entity is separate from personal `FindingAck` records.

## FindingAck

A personal Governance Radar decision for one stable finding or risky change.

`workspace_id`, `user_id`, `recordKey`, `findingId`, `status`,
`occurrenceSnapshotId?`, `note?`, `updatedAt`

The status is `acked` for one occurrence or `muted` until the record is
removed.

## Snapshot history

History does not require another table. Atlas uses trusted `Workspace`
manifests as the index and loads older child rows by `workspace_id` and
`snapshotId`. Schema metadata and verified object edges come from the selected
historical snapshot. Comments, saved views and access-review decisions are not
part of snapshot comparisons.

The configured retention window keeps 12 snapshots by default. Retention runs
after publication, removes child entities before their manifest, and leaves a
temporarily over-retained history when cleanup fails.

Writer rotation is explicit: former synchronizer emails can be allowlisted for
historical reads and cleanup. They cannot create or delete rows after the
current deployment policies are generated.

## Adding a field

Add the bounded Rayfin decorator, update the snapshot writer and reader, add a
test, then deploy:

```ts
@set("low", "medium", "high", "critical")
criticality!: string;
```

```powershell
npm test
npx rayfin up
```
