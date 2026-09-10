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
write them.

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
They are append-only in v1.x because `Comment` exposes create and read but no
update or delete action. `authorName` stores the uniquely resolved synchronized
principal display name when available, with the authenticated session label as
a fallback. `authorEmail` is the authoritative authenticated identity and the
UI shows it whenever it differs from `authorName`.

## SyncRun

The audit record for a completed snapshot.

`workspace_id`, `snapshotId`, `writerEmail?`, `startedAt`, `finishedAt?`, `status`,
`itemsSynced?`, `triggeredBy?`, `summary?`

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

Shared targets for one configured workspace.

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
