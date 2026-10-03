# Item family coverage registry

`src/atlas/item-families.ts` records what Atlas collects for each Fabric item
family. Every family states five coverage dimensions independently, so an
unsupported or deferred enrichment is shown as such instead of as zero, empty
or healthy. Entries reflect Microsoft documentation verified on 2026-10-02 and
a read-only observation of the reference tenant on the same date.

## Coverage states

| State | Meaning |
| --- | --- |
| Collected | Published snapshots collect this dimension through a verified path |
| Partial | Collected with documented gaps, for example grants without restrictions |
| Adapter only | A verified read-only adapter exists, but its evidence is not part of published snapshots |
| Deferred | A documented contract exists, but no metadata-only projection is approved |
| Unsupported | No verified public read contract |
| Excluded by design | Outside the metadata boundary, for example notebook code or query text |
| Not applicable | The dimension does not apply to the family |

The dimensions are **catalog**, **objects**, **lineage**, **access** and
**operations**. The Catalog item drawer shows them in an **Atlas coverage**
section for every item, including unknown and Workload Hub types.

Governance Center → **Coverage** opens with the item family inventory, laid
out like the #42 Governance Center concept: a partial-coverage banner, four
summary cards, a dense keyboard-navigable inventory table with one status chip
per dimension, an **Evidence details** pane for the selected family (sticky on
wide screens, a focus-managed dialog on narrow screens) and an **Inventory
gaps** card whose unobserved families stay collapsed until requested. Every
chip pairs an icon with text, and all colours come from the shared semantic
tokens, so light and dark themes stay consistent.

Concept elements that are deliberately not reproduced because no supported
data exists:

| Concept element | Reason |
| --- | --- |
| Row overflow menu (`⋯`) and pane `⋯` menu | No per-family action is backed by an API |
| "Next review" date | Atlas has no review schedule for coverage; the pane shows the registry follow-up instead |
| Owner column | Item families have no owner; owners stay on items |
| Shortcut and mirroring provenance in Map & lineage evidence | The provenance adapter is not published to snapshots yet, so no persisted evidence exists to show |
| "Design concept · demo data" badge | Marks fictional mockup data and is never shown |

## Families

- **Documented item types.** All 51 values of the Fabric `ItemType`
  enumeration are registered. A test keeps the list identical to the Catalog
  Search filter allowlist. Families with a definition in Microsoft's
  [item-definition overview](https://learn.microsoft.com/en-us/rest/api/fabric/articles/item-management/definitions/item-definition-overview)
  link to that definition; a documented definition alone does not make an
  adapter, so those families stay **Deferred** until a metadata-only
  projection is reviewed.
- **Derived families** are not top-level Fabric items:
  - `MaterializedLakeView` (GA) lives inside a Lakehouse. Atlas never
    fabricates a top-level MLV item. Awareness comes from
    `RefreshMaterializedLakeViews` job instances on the parent Lakehouse and
    from the documented MLV execution definitions read by the source
    provenance adapter. No documented API lists every view.
  - `KQLMaterializedView` is a KQL database object already collected from the
    KQL structural schema. It is kept distinct from MLVs.
  - `OneLakeShortcut` is a reference inside a Lakehouse, Warehouse or KQL
    database, read by the source provenance adapter.
- **Workload Hub items** such as `Microsoft.WaaS.BusinessProcessSolutions`
  use dotted `Publisher.Workload.ItemType` names. They keep top-level
  identity, a readable label and explicit **Unsupported** structure.
- **Unknown types** keep top-level identity with a neutral fallback.
- **Fabric Apps.** `AppBackend` and `OrgApp` stay at top-level identity until
  a documented contract exposes dependent items or services.

## Reference tenant observation (2026-10-02)

A read-only delegated listing of the four workspaces visible to the operator
account returned 88 items: Notebook 26, SQL endpoint 14, Lakehouse 10,
KQL database 5, Warehouse 4, AppBackend 3, Eventhouse 3, Report 3, Semantic
model 3, SQL database 3, User data function 3, Eventstream 2, and one each of
Data agent, Data pipeline, Graph model, KQL dashboard, KQL queryset, Mirrored
database, Ontology, `Microsoft.WaaS.BusinessProcessSolutions` and
`Org.AsmdbAnalytical.SyncHub`. Shortcuts were present on Lakehouse, Warehouse
and KQL database items, all with OneLake targets. No MLV execution definitions
existed. One workspace returned `CapacityNotActive`, which the adapter reports
as `endpoint-unsupported`.

## Inventory gap list

`inventoryGapList(observedItemFamilies(data))` returns every family with an
Unsupported, Deferred or Adapter-only dimension, observed families first. Each
row below is one bounded follow-up, not a collector rewrite.

| Follow-up | Families | Blocker or next step |
| --- | --- | --- |
| Publish source provenance | Lakehouse, Warehouse, KQL database, Mirrored database, MLV, OneLake shortcut | Adapter exists; publication waits for the durable snapshot cutover and a reviewed persistence shape |
| Eventstream topology | Eventstream (observed) | Project source and destination item IDs from the documented definition without event payloads |
| Event Schema Set adapter | Event schema set | Documented definition supports **user identity only**; Atlas collectors use the application identity |
| Fabric Apps dependent items | AppBackend (observed), Org app | Wait for a documented contract that exposes dependent items or services |
| Definition reviews | Copy job, Variable library, Environment, Spark job definition, Activator, API for GraphQL, Mounted Data Factory, Mirrored Azure Databricks catalog, Snowflake database, Mirrored catalog, dbt job, Azure Databricks storage, Paginated report, Org app audience | Review each documented definition for a metadata-only projection; Variable library could expose names and types only |
| No documented structural contract | ML experiment, ML model, Mirrored warehouse, Apache Airflow job, Warehouse snapshot, Digital twin builder and flow, Map, Anomaly detector, Graph queryset, Operations agent, Cosmos DB database, Plan, Workload Hub items | Keep top-level identity only |

## Deferred and gated

- **Event Schema Set** structure: user-only identity (see above).
- **Full MLV inventory and refresh schedules**: no documented list API for
  views; schedules are operational configuration, not provenance.
- **Schema-version comparison** for new families: no adapter publishes
  versioned structure yet.
- **IQ Sharing**: remains gated as `unconfirmed` with its flag off; no family
  or adapter exists for it.

## Validation

```powershell
npm test -- src\atlas\item-families.spec.ts src\atlas\components\ItemCoveragePanel.spec.tsx src\atlas\components\ItemFamilyCoverageSection.spec.tsx src\atlas\views\Catalog.spec.tsx src\atlas\views\GovernanceCenter.spec.tsx
```
