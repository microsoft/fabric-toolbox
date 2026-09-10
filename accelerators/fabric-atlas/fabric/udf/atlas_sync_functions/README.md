# atlas_sync_functions — Fabric User Data Function

This is the server-side function Fabric Atlas calls when you click **Sync**. It
runs inside Fabric, receives the signed-in user's token, and returns the whole
workspace picture: items, **per-item access** (who can see each item, not just the
workspace), the real **lineage** between items, per-item **config**, and recent
jobs. Contract version 2 also reports collection status for each section and
metadata capability. See [How it works](../../../README.md#how-it-works) for
the reasoning.

Per-item access and lineage come from the Fabric **admin scanner** (`getInfo`),
which needs the `Tenant.Read.All` delegated permission, a **Fabric Administrator**
synchronizer, and the tenant's enhanced read-only admin API metadata and user
information settings. The browser rejects any failed required section and keeps the previous
database snapshot active. Unsupported endpoints and unavailable optional tokens
remain visible without invalidating complete required metadata. Deadline
exhaustion in any discovery section rejects the refresh so a partial deep scan
cannot become authoritative. Scanner access is therefore required for a
synchronized result to become authoritative.

Lineage uses documented immutable identifiers for Report bindings, Dashboard
tiles and upstream Dataflow, Datamart and Semantic Model dependencies. A
dependency is accepted only when its scanner `groupId` is absent or matches the
current workspace. Display names are never used to invent an edge.

Fabric enforces a 200-second function timeout. Each Atlas invocation uses one
180-second monotonic budget, including metadata queries, response reads,
bounded retries and `Retry-After` sleeps. The remaining 20 seconds are reserved
for final projection, serialization and platform response handling. Upstream
and final payloads are capped at 25 MiB. Verified object-lineage relations are
deduplicated but never truncated by count.

The browser calls `sync_all` with deferred enrichment to obtain the
authoritative workspace, scanner, access and base-lineage envelope. It then
invokes `sync_items` with item IDs grouped by Fabric type. A slice stops before
starting another item when less than 30 seconds remain and returns both
`completedItemIds` and `remainingItemIds`. The client continues those IDs in a
fresh slice, splits a timed-out multi-item request, and isolates a slow single
item. Repeated no-progress attempts are bounded so a deterministic oversized or
stalled item cannot leave the browser in an infinite loop. No partial slice
publishes a Rayfin workspace manifest.

For schema-enabled lakehouses, the lakehouse `/tables` endpoint may return a
schema wrapper or no usable result. The UDF flattens schema/table responses when
available and otherwise follows real Fabric metadata IDs through **Lakehouse →
SQL analytics endpoint → Semantic model**. Tables and columns come from the
admin scanner's semantic-model schema; names are deduplicated without inventing
objects or columns.

## Object inventory coverage

| Fabric item | Inventory returned |
| --- | --- |
| Lakehouse | All objects returned by the paginated Lakehouse Tables REST API (managed/external type). Columns are merged from scanner metadata and downstream semantic models reached through the real SQL endpoint ID. |
| Warehouse | Tables/views/columns when the admin scanner supplies them. Otherwise downstream semantic-model objects are returned as a clearly labelled subset. Fabric REST item properties are captured, but complete inventory requires SQL catalog access. |
| SQL Database | Schemas, tables, views, columns, primary keys and foreign keys from constant read-only `sys.*` catalog queries against every workspace-resolved Fabric SQL endpoint. |
| Semantic Model | Scanner tables, columns, measures, descriptions, hidden flags and measure expressions. |
| Report | Pages from the supported Power BI `Get Pages In Group` API. The admin scanner and Reports REST do not expose visuals or field bindings, so those are explicitly reported as unavailable rather than fabricated. |

The required Fabric token uses `UserDataFunction.Execute.All`,
`Workspace.Read.All`, `Item.Read.All`, `Report.Read.All`, `Dataset.Read.All`
and `Tenant.Read.All`. Optional definition discovery uses a separate
`Item.ReadWrite.All` token. Kusto and Azure SQL use separate optional
`user_impersonation` tokens. A privilege or service failure on a required metadata call is added to `errors`; the browser
then retains the last known-good snapshot. Optional enrichment failures and
expected unsupported cases, such as table enumeration requiring a SQL
connection, are returned as section evidence or config facts.

API references: [Lakehouse List Tables](https://learn.microsoft.com/rest/api/fabric/lakehouse/tables/list-tables),
[Get Warehouse](https://learn.microsoft.com/rest/api/fabric/warehouse/items/get-warehouse),
[Get SQL Database](https://learn.microsoft.com/rest/api/fabric/sqldatabase/items/get-sql-database),
[Power BI scanner result](https://learn.microsoft.com/rest/api/power-bi/admin/workspace-info-get-scan-result),
and [Get Pages In Group](https://learn.microsoft.com/rest/api/power-bi/reports/get-pages-in-group).

> Fabric now exposes
> [`getDefinition`](https://learn.microsoft.com/rest/api/fabric/userdatafunction/items/get-user-data-function-definition)
> and
> [`updateDefinition`](https://learn.microsoft.com/rest/api/fabric/userdatafunction/items/update-user-data-function-definition)
> REST APIs for User
> Data Functions. They require a delegated **user** token with
> `Item.ReadWrite.All`; service principals and managed identities are not
> supported. Always round-trip the deployed definition and preserve every
> returned part, replacing `function_app.py` and the library version in
> `definition.json` only when those changes are intentional.

## Functions

| Function | Params | Returns |
| --- | --- | --- |
| `ping` | `name` | smoke test |
| `sync_all` | `fabricToken, workspaceId, correlationId?, definitionToken?, kustoToken?, sqlToken?, storageToken?, deferEnrichment?` | Schema v2 payload with workspace data, required/optional section status, metadata capabilities and safe errors |
| `sync_items` | `fabricToken, workspaceId, itemIds, correlationId?, definitionToken?, kustoToken?, sqlToken?, storageToken?` | Resumable deep metadata slice with completed and remaining item IDs |

Required sections are `workspace`, `items`, `roleAssignments`, `scanner`,
`schema`, `lineage`, `access` and `config`. Optional sections are `jobs`,
`itemDetails`, `lakehouseTables` and `reportPages`. Valid empty workspaces are
authoritative when every required section completes.

## Publish or update

1. Open your workspace in the Fabric portal.
2. Open the item **`atlas_sync_functions`** (User Data Function).
3. In the editor, make sure the code matches [`function_app.py`](./function_app.py)
   (paste it if the editor is empty) and that `requirements.txt` keeps the
   pinned `fabric-user-data-functions` version from this directory.
4. Click **Publish**. When it finishes, copy the **invoke URL** of `sync_all`.

For repeatable automation, first call the UDF `getDefinition` endpoint, poll its
long-running operation, preserve the returned `definition.json` and `.platform`
parts, replace the Base64 payloads of `function_app.py` and
`requirements.txt`, and submit the complete part set to `updateDefinition`.
Poll the update operation, read the definition back, compare both content
hashes, and invoke `ping` before testing `sync_all`. Do not send a hand-built
partial definition: deployed UDF generations can return different metadata
part sets.

## Wire the app

1. Add the invoke URL to the git-ignored `rayfin/.env` file:
   `RAYFIN_PUBLIC_ATLAS_UDF_URL=https://<...>/functions/sync_all/invoke`.
2. Run `npx rayfin up` so the public URL is included in the deployed bundle.
3. Open Fabric Atlas and click **Start first sync** (or **Sync** after the workspace has already
   been indexed). Approve the sign-in popup once
   (`UserDataFunction.Execute.All` + Power BI read). The catalog loads and is
   written to the Atlas database.

The app authenticates with the Entra app registration you created (see
[docs/installation.md](../../../docs/installation.md)), whose client id is provided
through `VITE_ATLAS_SPA_CLIENT_ID`, with the delegated permissions consented and the
app's hosting origin registered as a SPA redirect URI.

## Security boundary

- `workspaceId` must be a UUID, pagination is fail-closed, and continuation URLs
  are restricted to `https://api.fabric.microsoft.com`.
- The caller's delegated token still determines which Fabric workspaces can be
  read.
- After metadata is persisted, Rayfin controls application access. Fabric Atlas
  v1.x gives the complete authenticated app audience shared read access to the
  synchronized governance graph and team notes; personal review state remains
  user-scoped.
- Scanner output is allowlisted. Table rows, datasource and connection details,
  dataset/table Mashup expressions, Power Query definitions and source code are
  never emitted. `datasetExpressions=True` is used only to retain measure DAX.
- Ownership is emitted only from documented type-specific fields. Sensitivity
  labels and tags remain stable IDs when no trusted display-name lookup exists.
- The current portable Fabric UDF Python API does not expose the containing
  workspace/item identity to this function. Consequently, the UDF cannot
  independently enforce “only its deployed workspace” without a deployment-time
  workspace setting. No workspace ID is hardcoded in tracked source; this remains
  a deployment/runtime limitation.
