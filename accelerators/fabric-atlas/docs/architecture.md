# Architecture

Fabric Atlas is one place to see everything in a Fabric workspace, plus a team comment layer. It is a
Rayfin Data App, so the backend is described in TypeScript and provisioned by Rayfin on Fabric.

## The pieces

```
Fabric portal (iframe)
        │  brokered auth (Entra ID)
        ▼
React + Vite SPA  ── Rayfin static hosting (dist/)
        ├──────────► Published User Data Function ──► Fabric + Power BI APIs
        │
        │  RayfinClient
        ▼
Rayfin Data API (Data API Builder)  ──  Fabric SQL database (mssql)
        ▲
        │  Sync writes here
   synchronized metadata  (items · lineage · jobs · permissions · definitions)
```

- The front end lives in `src/`. Atlas feature code is in `src/atlas/` (model, store, UI helpers,
  lineage logic and product views).
- The data model lives in `rayfin/data/` as decorator classes and is registered in
  `rayfin/data/schema.ts`. `rayfin.yml` enables `auth`, `data` (mssql), `storage` and `staticHosting`.
- `RayfinClient` (`src/lib/rayfin-client.ts`) talks to the Rayfin Data API, which serves the Fabric
  SQL database. Auth is Fabric brokered (`src/services/rayfin-auth.service.ts`).

## Data model

Fifteen entities capture the workspace, team context and personal review state.
See [data-model.md](data-model.md) for fields.

| Entity | Holds |
| --- | --- |
| `Workspace` | The indexed workspace |
| `FabricItem` | Every item (Lakehouse, Notebook, Pipeline, Semantic model, Report, …) |
| `LineageEdge` | Directed dependency between two items |
| `Principal` | Users, groups, service principals, guests |
| `AccessGrant` | Effective access (workspace or item level) + where it comes from |
| `JobRun` | Refresh / pipeline / notebook run history |
| `ConfigEntry` | Flat key/value config facts per item (drives the expandable tree) |
| `Comment` | Team notes on the workspace or an item |
| `SyncRun` | Audit of each Sync |
| `SavedView` | User-scoped filter and navigation presets |
| `AccessReview` | Legacy user-scoped access-review decisions and notes |
| `AccessReviewEvent` | Personal append-only review history bound to permission evidence |
| `FindingAck` | User-scoped Governance Radar acknowledgements and mutes |
| `GovernancePolicy` | Shared workspace targets for the six posture pillars |
| `GovernanceException` | Shared, justified exceptions with an expiry |

## Authorization and collaboration scope

The synchronized catalog entities use `@authenticated('read')` without a
row-level reader policy. In the single-workspace v1.x architecture, every
authenticated user who can open the deployed app can therefore read the whole
governance graph: items, object inventory, lineage, principals, grants, jobs,
configuration, history and shared comments. Deployment owners must treat the
Fabric app audience as the catalog read boundary.

Writes remain narrower. Snapshot creation, updates and retention are restricted
to the configured immutable Rayfin subject (`claims.sub`); the synchronizer
email remains contact and historical writer metadata. `SavedView`, `AccessReview` and `FindingAck` bind all
operations to `claims.sub == user_id`. Comment creation requires both the
authenticated email and subject to match `authorEmail` and `authorId`.
Team notes persist the authenticated email as both the author label and policy-
bound email, while `authorId` remains bound to `claims.sub`. Client-selected
catalog labels cannot impersonate another note author.

`AccessReviewEvent` uses the same personal subject boundary but exposes only
create and read. Shared `GovernancePolicy` and `GovernanceException` records are
readable by the app audience and writable only by the configured synchronizer.

Comments are append-only in v1.x: authenticated app users can read them and
their authenticated author can create them, but the entity exposes no update
or delete action.

## Sync

The Sync button calls `runFabricSync` (`src/atlas/backend.ts`). When deployed,
the browser invokes the published `sync_all` Fabric User Data Function. The
required read-only Fabric/Power BI token is accompanied by separate optional
definition (`Item.ReadWrite.All`), Kusto and Azure SQL tokens acquired for the
same signed-in identity. Each token is used only by its matching metadata
collector. The `storageToken` function parameter is reserved
for future OneLake discovery and is not currently acquired by the browser. The
app maps the response, writes it through the Rayfin Data API, and records a
`SyncRun`.

Initial synchronization and later refreshes use the same five-phase progress
tracker. The discovery phase reports the actual number of enriched items and
the active Fabric item type, together with elapsed time, rather than advancing
a simulated percentage.

Each browser request has its own 195-second abort deadline. Users can cancel an
active synchronization, and expiring audience tokens are renewed silently
between slices.

Contract version 2 separates required sections from optional enrichment and
records metadata capabilities for ownership, sensitivity, endorsement, tags,
KQL schema, SQL schema and item definitions. Required-section failure rejects
the refresh. Optional token, permission, encrypted-label or endpoint failures
remain visible as evidence but do not invalidate otherwise authoritative
metadata. Valid empty workspaces are accepted.

Microsoft Fabric currently enforces a
[200-second User Data Function execution limit](https://learn.microsoft.com/en-us/python/api/fabric-user-data-functions/fabric.functions.userdatafunctiontimeouterror?view=fabric-user-data-functions-python-latest).
Atlas uses one 180-second monotonic budget across API calls, SQL/KQL
metadata queries, incremental response reads, retries and sleeps, leaving 20
seconds for final projection, serialization and platform response handling. It
retries bounded `429` and transient `5xx` responses, caps upstream and final
payloads at 25 MiB, and returns structured safe errors. The browser independently
streams and caps the response at 26 MiB before parsing.

Object-lineage relations are not truncated by count. Synchronization starts
with a deferred-enrichment base call that returns the authoritative workspace,
scanner, access and base-lineage envelope. The client then groups workspace
items by Fabric type and invokes `sync_items` in bounded operational batches.
Each batch returns `completedItemIds` and `remainingItemIds`. When its remaining
budget is too short to start another item, the UDF returns a continuation before
the platform timeout.

The client requeues continuations, splits a timed-out or oversized multi-item
batch, and retries a single slow item in a fresh function slice. Repeated
no-progress attempts are bounded, and a deterministic single-item response-size
failure is surfaced explicitly instead of looping forever. Other item types
continue independently in the same queue. A platform
`UserDataFunctionTimeoutError` is therefore a retry signal for the affected
slice, not a reason to discard completed slices. Non-retryable validation or
permission failures still preserve the previous validated snapshot. The
browser warns before refresh or navigation closes the tab while the queue is
active.

Each refresh creates one correlated `SyncRun` attempt before Fabric discovery,
then records the real terminal time, duration and outcome. Content rows are
written first and re-read through the same fully paginated hydration path. The
`Workspace` manifest is written only after the persisted snapshot reconstructs
successfully. A failed or incomplete refresh never becomes active.

Team notes are loaded independently from snapshot hydration. A note transport,
pagination or parsing failure appears only in the notes surface and cannot hide
an otherwise valid catalog.

Content rows are created in bounded batches of eight requests. Entity groups
remain sequential and each in-flight batch settles before an error is
propagated. The audit attempt is updated in place rather than deleted and
recreated.

After the new manifest is visible, Atlas applies trusted snapshot retention.
Every candidate is filtered by workspace, snapshot and writer, child rows are
deleted in bounded batches, and the Workspace manifest is deleted last. Only
the configured synchronizer has delete permission. Cleanup failures are logged
and retried by a later sync without invalidating the published snapshot.
Unpublished failed, stale-running or legacy-completed attempts are eligible for
scoped child-row cleanup only after a one-hour grace period; their `SyncRun`
audit evidence is retained.
When the synchronizer changes, explicitly configured former writers remain
trusted for reads and cleanup while only the current writer can create or
delete rows.

Snapshot creation is bound to the configured synchronization administrator.
Rayfin create policies compare the authenticated email with each row's
`writerEmail` and with the deployment's configured synchronizer. Database reads
also filter that writer before pagination, and hydration ignores any manifest
that fails the same trust boundary.

The workspace manifest stores the deployed build ID and explicit snapshot
contract marker. The first deployment, a new major/minor contract or an
intentional marker revision shows the guided sync screen until the authorized
synchronizer publishes its snapshot. Compatible patch releases reuse the
validated snapshot history. A blocked user sees the configured synchronizer
account to contact. After synchronization, current data and history switch to
the new snapshot together before background reconciliation.

The MSAL account used for Sync must match the current Rayfin user and tenant.
Tokens use session storage so switching Fabric users cannot silently reuse the
first account from a persistent browser cache. Optional audience acquisition
fails closed and never substitutes data from another identity.

## Governance history

`loadHistoryFromDb` reads older trusted manifests with snapshot-scoped queries.
Each candidate passes the same writer, row-count, schema and item validation as
the active catalog. Invalid historical snapshots are skipped.

`src/atlas/history.ts` compares validated snapshots without depending on row
order. It detects changes to items, schema objects, access grants, sensitivity,
lineage and jobs, then derives the trend series used by Governance Center.
Fabric principal IDs are authoritative. Unique normalized email correlation
keeps legacy snapshots comparable when older access rows used a name or email.

Workspace manifests from summary version 1 also carry the complete trend
metrics. Startup loads those compact summaries for the ledger and trend, plus
the current and previous detailed catalogs. Selecting another Change Center
snapshot lazily loads and validates that catalog through a snapshot-scoped
query; in-flight loads are discarded when a newer sync starts.

Change details retain full values and DAX rather than only ledger previews.
Historical impact uses the explicitly selected before or after catalog. A
removed object is inspected in its earlier snapshot; unavailable historical
evidence never falls back to the current graph.

## Personal governance state

Saved views and access-review decisions are separate from synchronized
snapshots. Rayfin policies bind their `user_id` field to the authenticated
subject claim, so each user reads and changes only their own records.

Governance Center groups findings, snapshot changes, trends and metadata
coverage. Access Review uses the same additive effective-access engine as the
Asset Catalog and lineage inspector.

## Navigation state

Display preferences are separate from shareable navigation. Density, Catalog
layout and lineage inspector width are stored in browser local storage, keyed
by the authenticated user and configured workspace. They are not cloud-synced
and are not included in copied URLs. A storage failure leaves a visible warning.
Compact mode adjusts spacing and control height rather than reducing font size.

`src/atlas/routing.ts` parses and serializes Atlas-owned URL parameters while
preserving unrelated Fabric host parameters. Catalog, Asset Catalog,
Governance Center, Access Review, Jobs and Workspace Hub use namespaced keys;
Map retains its established lineage query keys. Browser back/forward therefore
restores the active section, filters, selected evidence and Change Center
snapshot pair.

Live filter changes use `replaceState`, while destination changes use
`pushState`. Re-selecting the exact current route is a no-op so browser history
does not accumulate duplicate entries.

## Governance intelligence

`src/atlas/radar.ts` compares the exact latest adjacent snapshot pair. Stable
finding IDs identify new, persisting and resolved findings; risky Change Center
events add access, sensitivity, lineage and removal signals. A deployment-ID
boundary creates a clean baseline instead of reporting every existing finding
as new.

`FindingAck` stores personal acknowledgement or mute state under a
`claims.sub == user_id` policy. Mutations are serialized per finding, and a
personalization failure never hides the underlying Radar alerts.

`src/atlas/posture.ts` evaluates documentation, ownership, sensitivity, access,
lineage and operations. Non-applicable evidence is excluded rather than scored
as zero. Current and previous loaded catalogs provide Overview deltas; opening
Posture lazily hydrates older catalogs for a consistent trend.

`GovernancePolicy` supplies workspace targets, all defaulting to 70%. Current
targets apply consistently to current and historical scores; earlier policy
versions are not retained. `GovernanceException` attaches an administrator's
reason and expiry to a finding without suppressing the finding or changing
its score.

Access-review events include a canonical permission fingerprint. A changed
grant or principal resolution requires revalidation even when the strongest
access level is unchanged. Legacy decisions remain visible as history, and
clear actions append events instead of deleting earlier decisions.

`src/atlas/offboarding.ts` composes existing metadata, effective access and
indexed lineage into departure/removal packs. It blocks ownership claims for
ambiguous principals and recommends only resolved internal user successors.

## Object lineage

Verified object edges are stored beside schema chunks as hidden `ConfigEntry`
rows. The generic contract identifies item and object, uses stable IDs and
accepts only `confidence: verified`. It covers physical object-to-ontology
bindings, entity relationships, Graph Model mappings and selected source
objects feeding Data Agents. Historical impact loads the edges from the
selected snapshot.

Atlas does not read Ontology or Graph Model instances. Those are business data,
not workspace metadata.

### DAX object lineage

`src/atlas/dax-refs.ts` strips strings and comments before extracting qualified
columns and measures. `src/atlas/schema-lineage.ts` emits dependencies only
when a reference resolves uniquely to a real synchronized schema object.

Verified DAX edges remain inside the semantic model. A cross-item source hop is
marked inferred and requires both real item lineage and one unique matching
upstream table/column. Asset Catalog and impact reports display confidence
explicitly; item-level fallback remains unchanged when no object evidence
resolves.

## Object inventory

- Lakehouse tables come from the paginated Fabric Tables API when available.
- Schema-enabled lakehouse columns can be derived through the real Lakehouse to
  SQL endpoint to Semantic Model lineage.
- Warehouse and SQL Database objects use scanner metadata, with a clearly
  labelled downstream model subset when complete SQL catalog access is not
  available.
- KQL Database tables and columns come from one database-wide read-only schema
  command. Function and materialized-view bodies are not retained.
- SQL Database tables, views and columns come from one constant `sys.*`
  metadata query. Atlas does not select table rows or retain module definitions.
- Ontology definitions are reduced to entities, properties, source bindings,
  relationships and contextualizations.
- Graph Model definitions are reduced to node/edge types and source/property
  mappings; filter values and instances are discarded.
- Data Agent definitions retain publication state, source references and
  selected element trees. Instructions, few-shots and answers are discarded.
- Semantic Models include tables, columns, measures, descriptions, hidden
  flags and measure expressions. Dataset expressions are requested only because
  the scanner requires that option for measure DAX.
- Dataflows, Datamarts and Semantic Models include documented upstream
  Dataflow, Datamart and Semantic Model relationships by immutable ID. Scanner
  workspace IDs prevent cross-workspace edges from entering the single-workspace
  graph.
- Reports include pages. Fabric APIs do not expose complete visual field
  bindings through this flow.

Scanner payloads cross an explicit metadata allowlist. Atlas never serializes
table rows, datasource or connection details, dataset/table Mashup expressions,
Power Query definitions, notebook source or pipeline definitions. Ownership is
reported only where Microsoft documents a type-specific field:
`configuredBy` for Semantic Models, Dataflows and Datamarts, and `createdBy` for
Reports. Unknown collection state remains `N/A` instead of becoming a false
missing-owner or unlabeled finding.

In preview / standalone mode there is no token, so Sync just refreshes the sample dataset. The data
layer is one abstraction (`src/atlas/store.tsx`) so the UI code is identical in both modes.

## Workspace Hub

Posting a comment calls `addComment`, which optimistically updates the UI and persists a `Comment`
row through `client.data.Comment.create`. Because comments are stored in the Fabric SQL database,
they persist and are shared across the whole team. Configuration and comments are presented together
in Workspace Hub so technical facts and human context stay adjacent. The
display name resolved for a new note is preserved on reload; notes remain
append-only in v1.x.

## Theming

Light is the default so the embedded app follows the surrounding Fabric portal.
`src/hooks/use-theme.ts` stores an explicit light or dark preference and toggles
the `.dark` class for Tailwind.

Design tokens in `src/global.css` map the Atlas semantic palette to Fabric UX
and Fluent 2 neutrals, brand actions, status colors, spacing, radii and
elevation. Atlas keeps a restrained purple-to-teal spectrum for product
identity and lineage while standard interactions use the Fabric brand color.

Radix dialog and tab primitives provide modal focus containment, restoration
and keyboard navigation without changing the Fabric-aligned visual layer.
Global search builds one metadata index per loaded snapshot and applies a short
debounce before ranking results. Item and object lineage retain their visual
graph while also exposing selected relationships as assistive text.

The lineage engine builds incoming, outgoing, incident and neighbor indexes
once per edge set. Traversal is proportional to the reachable subgraph, layout
scores do not filter all edges inside sort comparators, and Map reuses active
impact when focus and selection match.

Dense Access, Asset Catalog and Jobs blocks use Chromium
`content-visibility:auto` containment. Access has one responsive selectable
list, and Jobs has one semantic definition-list timeline that changes layout
without duplicating content.

## Build transparency

The v1.9 production build emits one main application chunk of about 0.9 MB
minified, or about 0.25 MB gzip. Vite reports the `backend.ts` Rayfin client
dynamic import as ineffective because saved views, access reviews,
acknowledgements and auth also import that client statically. This does not
change runtime correctness; it means that import is not a code-splitting
boundary. The tradeoff is accepted for the current accelerator size.

Type checking is a blocking build step. `npm run typecheck` executes
`tsc -b --force` with `strict` and `noEmit`; `noCheck` is not enabled.

## Preview vs deployed

| | Preview / standalone | Deployed in Fabric |
| --- | --- | --- |
| Auth | none | Fabric brokered (Entra ID) |
| Data | in-memory sample set | Fabric SQL via RayfinClient |
| Sync | refreshes the sample | validates UDF result, writes a new snapshot |
| Comments | in-memory | persisted to `Comment` |
| Saved views and reviews | current preview session | user-scoped Rayfin entities |

This lets the app be fully explorable (and screenshot-able) offline, while the same code runs for
real once deployed.
