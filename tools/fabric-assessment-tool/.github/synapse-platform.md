# Synapse Platform Knowledge

Platform-specific conventions and API quirks for the Synapse scanner in
`clients/synapse_client.py`, `clients/odbc_client.py`, and
`assessment/synapse.py`. Read this before changing anything
Synapse-related — several decisions depend on subtle behavior of the
ARM + dev data-plane APIs and `mssql-python`.

> Companion docs: [`databricks-platform.md`](./databricks-platform.md)
> for the Databricks counterpart, [`json-export-service.md`](./json-export-service.md)
> for the on-disk layout produced from `SynapseAssessment`, and
> [`html-generator.md`](./html-generator.md) for the templates that
> read it back.

## Two Control Planes

Synapse exposes two distinct control planes, and the scanner talks to
both. Most resources are fetched from the **dev data plane** scoped to
a single workspace. A handful of things (dedicated-pool schemas/tables,
workspace listing for interactive selection) come from the **Azure
Management / ARM plane**.

| Plane   | Base URL                                              | Scope                                  | API version used |
|---------|-------------------------------------------------------|----------------------------------------|------------------|
| Dev     | `https://<workspace>.dev.azuresynapse.net`            | `https://dev.azuresynapse.net/.default`| `2020-12-01`     |
| ARM     | `https://management.azure.com`                        | `https://management.azure.com/.default`| varies per call (`2021-04-01` for dedicated-pool schemas/tables; none for workspace list) |

`_get_synapse_clients()` builds one `ApiClient` per connectivity
endpoint returned by ARM (keyed `"dev"`, `"sql"`, `"sqlOnDemand"`,
etc.). Today only the `dev` client is actively used for data-plane
calls; the ARM client is added lazily by `_ensure_azure_client()` the
first time it's needed.

### Fabric notebook auth and ARM

`FabricNotebookTokenProvider.get_token("https://management.azure.com/.default")`
**hangs indefinitely**. `_ensure_azure_client()` short-circuits to
`False` when running under Fabric, which causes dedicated-pool schema
listing to fall back to ODBC (see below). The dev-plane token
(`https://dev.azuresynapse.net/.default`) works fine in Fabric.

## Workspace Discovery and Caching

`get_workspaces()` lists all Synapse workspaces in the subscription via
`GET /subscriptions/{sub}/providers/Microsoft.Synapse/workspaces` and
populates `_workspace_cache` keyed by **lowercased workspace name**.
`_get_workspace_info(name)` always reads the cache first, so every
assess run benefits from a single LIST call.

- The cache key is lowercase; lookups must also lowercase.
- `get_workspaces()` requires `subscription_id`. Fabric-notebook users
  who don't pass `--subscription-id` hit an explicit error rather than
  silent empty results.

## Partial-Success Status Tracking

`SynapseClient` maintains three instance fields that are **reset at the
start of every `assess_workspace()` call** and consulted when building
the final `AssessmentStatus`:

| Field                             | Meaning                                                                 |
|-----------------------------------|-------------------------------------------------------------------------|
| `dev_endpoint_permission_issues`  | True if any dev-plane call returned `Forbidden`                         |
| `unreached_components`            | List of resource names that were skipped due to permission issues       |
| `paused_databases`                | Dedicated SQL pool databases that returned `UpdateNotAllowedOnPausedDatabase` |

Individual `_get_*` helpers catch `FATError(status_code="Forbidden")`,
append the resource name to `unreached_components`, flip
`dev_endpoint_permission_issues`, and return an empty collection rather
than raising. This lets a single missing role (e.g., no *Synapse
Artifact User*) degrade the assessment to `incomplete` without aborting.

If you add a new dev-plane resource fetcher, follow the same pattern
and add its name to `unreached_components` so partial-success reporting
stays accurate.

## Notebook Inspection

Synapse notebooks carry their cells inline on `GET /notebooks`, so no
secondary fetch is required. Two derived fields are computed at ingest:

- `language` = `properties.metadata.language_info.name`
  (`python`/`scala`/`sql`/etc.).
- `uses_mssparkutils` = substring scan of `"mssparkutils"` across all
  cell `source` payloads (each cell's `source` can be a **string or a
  list of strings**, both must be joined before searching).
- `spark_configuration` = `properties.targetSparkConfiguration.referenceName`
  when present; same helper is reused for Spark Job Definitions.

## Dedicated SQL Pool Schemas & Tables

This is the trickiest part of the Synapse scanner. Schemas and tables
live **inside the SQL database**, not on the dev plane, so the scanner
has two paths:

1. **ARM path (preferred)** — `_get_dedicated_schemas_arm` /
   `_get_dedicated_schema_tables_arm` hit
   `GET /.../sqlPools/{db}/schemas[?...]/tables?api-version=2021-04-01`
   on `management.azure.com`. Requires `_has_azure_client` **and**
   `subscription_id`. No SQL credentials needed.
2. **ODBC fallback** — When ARM is unavailable (e.g., under Fabric
   notebook auth, or no subscription), the scanner connects via
   `OdbcClient` and queries `INFORMATION_SCHEMA`. Requires SQL
   credentials (one of the four auth modes below).

Both paths swallow `FATError(status_code="UpdateNotAllowedOnPausedDatabase")`
by appending the database name to `paused_databases` and returning an
empty schema/table list.

> **Don't reorder these branches.** ARM is cheaper, faster, doesn't
> prompt for credentials, and works on paused pools (returns a clean
> error we can detect). ODBC should always be the fallback.

## SQL Authentication Modes (`OdbcClient`)

`OdbcClient.auth_mode` accepts:

| Mode                 | Required inputs                                              | Notes                                                                 |
|----------------------|--------------------------------------------------------------|-----------------------------------------------------------------------|
| `sql` *(default)*    | `username` + `password`                                      | Traditional SQL auth. Username = SQL admin login from ARM properties. |
| `entra-interactive`  | *(none — browser popup)*                                     | Uses MFA-capable interactive login.                                   |
| `entra-spn`          | `client_id` + `client_secret` (+ optional `tenant_id`)       | Service Principal. `tenant_id` defaults to `"common"`.                |
| `entra-default`      | *(none — uses `DefaultAzureCredential`)*                     | Honors Azure CLI, managed identity, env vars, VS Code auth, etc.      |

The connection string is built in `_build_connection_string()` based on
`auth_mode`. **Entra modes return `"__entra_auth__"` as a placeholder
"password"** from `_get_sql_admin_credentials` — treat this as an
opaque sentinel meaning "the mssql-python driver will handle auth
itself"; never send it over the wire.

### Interactive auth selection

When the user runs `fat assess --source synapse` without
`--sql-admin-password` and without an explicit `--sql-auth-mode`,
`_get_sql_admin_credentials` prompts with four choices:

1. **Skip** — no dedicated-pool statistics collected.
2. **SQL Authentication** — prompts for password (login comes from ARM).
3. **Entra ID Interactive** — sets `sql_auth_mode = "entra-interactive"`.
4. **Entra ID Default** — sets `sql_auth_mode = "entra-default"`.

Entra SPN is **not offered interactively** because it needs
`--sql-client-id`/`--sql-client-secret` up front; it must be selected
non-interactively via CLI flags.

### `_has_sql_credentials` truth table

Used to decide whether to attempt dedicated-pool DMV-based statistics:

- `entra-interactive` / `entra-default` → `True` (driver handles it).
- `entra-spn` → `True` **only** if both `sql_client_id` and
  `sql_client_secret` are set.
- `sql` → `True` only if both login and password were resolved.

## Dedicated-Pool Statistics (`vTableSizes` DMV)

`_get_dedicated_database_statistics` collects table size, object count,
and code-line statistics through a custom DMV named `vTableSizes` that
must exist in the target database. The flow:

1. `odbc_client.check_table_statistics_dmv_exists()` — look up the view.
2. If missing and `create_dmv=True` (from `--create-dmv` CLI flag),
   create it silently.
3. If missing and interactive, `prompt_confirm` the user.
4. If the user declines, return empty lists (not an error).

Three queries follow DMV creation:

- `get_table_statistics(database_name)` — per-table rows/size.
- `get_object_count(database_name)` — per-schema stored-proc/function counts.
- `get_code_lines_statistics(database_name)` — line counts for code objects.

Results are stitched back into the assessment tree in `assess_workspace`:
each `SynapseTable.statistics` is populated by matching on
`(database_name, schema_name, table_name)`, and `pool.code_lines` /
`pool.code_objects` are assigned from the per-database totals.

## Spark Configurations

`_extract_spark_configurations` builds a unique set of spark configs
**referenced by** spark pools, notebooks, and SJDs — it does **not**
fetch a list endpoint. The `spark_configuration` field on each
resource (`_get_target_spark_configuration`) points into this set.

If you add a new resource type that can reference a Spark configuration
(e.g., future dataflow types), plumb it through
`_extract_spark_configurations` so the deduped list stays complete.

## Error Handling

- Dev-plane fetchers catch `FATError(status_code="Forbidden")` → mark
  the resource unreachable, return empty collection.
- ARM-plane dedicated-pool fetchers catch
  `FATError(status_code="UpdateNotAllowedOnPausedDatabase")` → add to
  `paused_databases`, return empty.
- Everything else re-raises. Don't add blanket `except Exception` in
  new fetchers — it hides real bugs and inflates the "incomplete"
  signal.

## Cross-References

- `assess_workspace()` — the single entry point that orchestrates all
  per-resource `_get_*` calls.
- `SynapseAssessment` dataclass hierarchy — see
  [`copilot-instructions.md`](./copilot-instructions.md#synapse-hierarchy-assessmentsynapsepy).
- ODBC connection-string building — `OdbcClient._build_connection_string`
  in `clients/odbc_client.py`.
