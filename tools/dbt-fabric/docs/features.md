# Features

The `dbt-fabric` adapter provides production-ready dbt support for both Microsoft Fabric compute engines — the **Data Warehouse** (T-SQL) and the **Lakehouse** (Spark SQL) — from a single Python package. Two `AdapterPlugin` registrations, two profile types (`fabric` and `fabricspark`), one shared codebase for connection management, authentication, Fabric REST API access, and Python model submission.

## Design principle: dbt-native

Every feature in this adapter is built to use dbt's standard mechanisms rather than parallel constructions. Where dbt has an `on-run-start` / `on-run-end` hook, that is how side effects are orchestrated. Where dbt has a `dispatch` system, that is how community-package overrides are wired. Where dbt has a `{{ source() }}` reference with built-in lineage tracking, that is how external data is modeled. Where dbt has standard model `config()` options for clustering and statistics, that is how those settings are exposed.

The benefit is uniformity: users of dbt on other warehouses can pick this adapter up without learning a Fabric-specific layer on top of dbt. There is no separate `synapse_*()` macro family, no parallel snapshot-orchestration profile setting, no out-of-band feature configuration. Everything is just dbt.

---

## Modeling

### `MERGE` in incremental and microbatch models

Incremental models support all standard dbt strategies (`append`, `merge`, `delete+insert`, `microbatch`, plus `insert_overwrite` on FabricSpark). The default is `merge` when a `unique_key` is provided, generating a [`MERGE` statement](https://learn.microsoft.com/sql/t-sql/statements/merge-transact-sql) that matches on the unique key and updates or inserts as needed.

```sql
{{ config(materialized='incremental', unique_key='id', incremental_strategy='merge') }}

select * from {{ source('my_source', 'my_table') }}
{% if is_incremental() %}
where updated_at > (select max(updated_at) from {{ this }})
{% endif %}
```

This also works for microbatch models with `batch_size`, `begin`, and `event_time`.

### `CLUSTER BY` data clustering

Fabric Data Warehouse supports [automatic data clustering](https://learn.microsoft.com/fabric/data-warehouse/statistics#automatic-clustering) via the `CLUSTER BY` clause. This adapter exposes it as a standard dbt model-config option, syntactically identical to how Snowflake and BigQuery expose clustering:

```sql
{{ config(materialized='table', cluster_by=['customer_id', 'order_date']) }}
```

Generated DDL:

```sql
CREATE TABLE [schema].[orders]
WITH (CLUSTER BY ([customer_id], [order_date]))
AS select ...
```

Works on tables, incremental models, and models with contract enforcement. See [Data clustering](cluster-by.md).

### Manual statistics

[Manual statistics](https://learn.microsoft.com/fabric/data-warehouse/statistics) give the query optimizer accurate cardinality estimates with `FULLSCAN` precision. This adapter exposes them as a declarative model config:

```sql
{{ config(materialized='table', statistics=['customer_id', 'order_date']) }}
```

Statistics are idempotent — created on first run with `CREATE STATISTICS ... WITH FULLSCAN`, updated on subsequent runs with `UPDATE STATISTICS ... WITH FULLSCAN`. The naming convention `dbt_stats__<md5_hash>` avoids collisions with Fabric's auto-generated `_WA_Sys_*` statistics. Use `statistics=true` for all columns, or `statistics_sample_percent` to switch from `FULLSCAN` to sampling. See [Statistics](statistics.md).

### Materialized lake views (FabricSpark)

The Lakehouse adapter supports `materialized_view` as a materialization, creating Fabric [lake views](https://learn.microsoft.com/fabric/data-engineering/lakehouse-sql-analytics-endpoint) with `CREATE OR REPLACE MATERIALIZED LAKE VIEW`. Lake views support `PARTITIONED BY`, `TBLPROPERTIES`, and `CHECK` constraints with `ON MISMATCH` behavior.

---

## Data warehouse operations

### Warehouse snapshots

A [Fabric warehouse snapshot](https://learn.microsoft.com/fabric/data-warehouse/warehouse-snapshot) is a read-only, point-in-time view of a Data Warehouse. This adapter exposes snapshot creation as a Jinja macro:

```jinja
{{ create_or_update_fabric_warehouse_snapshot('daily_snapshot', 'Snapshot after dbt run') }}
```

Call it from any context where dbt allows macros — `on-run-start`, `on-run-end`, `post-hook`, or inline in a model. The result: dynamic snapshot names via Jinja expressions, per-model timing via `post-hook`, environment-variable-driven names via `env_var()`, all using dbt's standard side-effect orchestration mechanism. See [Warehouse snapshots](warehouse-snapshots.md).

### Catalog statistics in `dbt docs generate`

When you run `dbt docs generate`, the adapter automatically enriches the catalog with approximate row counts for every table — derived from `OBJECTPROPERTYEX(object_id, 'Cardinality')`. No configuration needed; row counts simply appear on every table node in the docs site. See [Catalog statistics](catalog-stats.md).

---

## External data

### `dbt-external-tables` integration via `OPENROWSET`

The Fabric Data Warehouse uses [`OPENROWSET(BULK ...)`](https://learn.microsoft.com/sql/t-sql/functions/openrowset-bulk-transact-sql) for external data access. This adapter provides override macros for the [dbt-external-tables](https://github.com/dbt-labs/dbt-external-tables) package — wired via dbt's [dispatch system](https://docs.getdbt.com/reference/dbt-jinja-functions/dispatch) — so external files appear as regular `{{ source('my_external', 'sales') }}` references:

```yaml
sources:
  - name: my_external
    schema: dbo
    tables:
      - name: sales
        external:
          location: "https://onelake.dfs.fabric.microsoft.com/<workspace-id>/<lakehouse-id>/Files/data/sales.parquet"
          file_format: parquet
```

```shell
dbt run-operation stage_external_sources
```

Because external data flows through dbt's source-staging workflow, you get lineage tracking and source freshness for free. Supported formats: Parquet, CSV, JSONL. Supported storage: Fabric OneLake, Azure Data Lake Storage Gen2, Azure Blob Storage. See [External tables](external-tables.md).

---

## Governance

### Microsoft Purview integration

Sync dbt metadata to [Microsoft Purview Data Catalog](https://learn.microsoft.com/purview/) via a single macro:

```yaml
on-run-end:
  - "{{ purview_sync() }}"
```

What gets synced: model and column descriptions, dbt tags, materialization type, test names and results, custom meta. Table-level lineage is built from dbt's `ref()` and `source()` dependency graph. Column entities are created for all physical columns discovered from the database catalog. The sync respects dbt's standard [`persist_docs`](https://docs.getdbt.com/reference/resource-configs/persist_docs) config — models with `persist_docs: false` are skipped entirely.

No Purview scanning or live view configuration is required. The adapter creates all entities directly via the Purview Data Map API, eliminating scan capacity costs and removing the delay between table changes and catalog updates. See [Microsoft Purview integration](purview-integration.md).

---

## Compute & Python

### Python models on both engines

Python models work on both adapter types. For the Data Warehouse (`type: fabric`), Python models execute via a Livy session against a Lakehouse and write back through the [`synapsesql` connector](https://learn.microsoft.com/fabric/data-engineering/spark-data-warehouse-connector). For the Lakehouse (`type: fabricspark`), Python models run in the same Livy session that handles SQL models.

```python
def model(dbt, spark):
    source_df = dbt.ref("my_upstream_model")
    return source_df.withColumn("full_name",
        spark.sql("concat(first_name, ' ', last_name)"))
```

The `model(dbt, spark)` signature, `dbt.ref()` / `dbt.source()` returning PySpark DataFrames, and `dbt.config.get()` for accessing model configuration all match dbt-spark's standard API. See [Python models](python-models.md).

### High-concurrency Livy session reuse (FabricSpark)

The FabricSpark adapter uses Fabric's [high-concurrency Livy API](https://learn.microsoft.com/fabric/data-engineering/high-concurrency-livy). Each dbt thread acquires its own REPL inside a shared underlying Livy session, derived from a deterministic session tag based on `(workspace_id, lakehouse_id)`. Result: successive `dbt run` invocations against the same workspace/lakehouse reattach to the still-warm Spark session, skipping Spark cold-start entirely. Statements from different threads execute in parallel inside the same Spark application, so raising `threads` directly raises throughput.

| Property | Shared across underlying sessions |
|---|---|
| OneLake Delta tables (dbt model outputs) | Yes |
| Catalog / metastore | Yes |
| Temp views | No (REPL-local) |

See [Lakehouse (Spark SQL)](lakehouse.md#high-concurrency-livy) for details.

---

## Connectivity

### No external ODBC driver installation

The Data Warehouse adapter uses [`mssql-python`](https://github.com/microsoft/mssql-python), Microsoft's official native Python driver for SQL Server. It bundles the Microsoft ODBC Driver 18 and unixODBC directly in the Python package, so installation is a single `pip install dbt-fabric` on Linux, macOS, and Windows — no `unixODBC` setup, no `msodbcsql18` install, no platform-specific scripts.

### Auto host-resolution from workspace name

The adapter resolves the SQL endpoint hostname automatically from the workspace name via the Fabric REST API:

```yaml
dev:
  type: fabric
  workspace: "gold_{{ env_var('FABRIC_ENV', 'dev') }}"
  database: dwh
  schema: dbt
```

Switching environments is then just `export FABRIC_ENV=prod` — no per-environment `host:` field to maintain.

### Extensive authentication support

A unified `FabricTokenProvider` handles 11 authentication methods across both adapter types: `ActiveDirectoryServicePrincipal`, `ActiveDirectoryPassword`, `ActiveDirectoryInteractive`, `ActiveDirectoryDefault` (default), `CLI`, `environment` (env-var based), `DeviceCode`, `ManagedIdentity`, `workload_identity` (federated OIDC for CI/CD), `token_credential` (bring your own `TokenCredential` class), and Windows Login. All are configured via the standard `authentication` profile key. See [Authentication](authentication.md).

---

## Ecosystem

### Community package support

Seven popular dbt community packages are tested with this adapter, with per-package compatibility documentation listing every supported and unsupported macro:

| Package | Tested version | Data Warehouse | Lakehouse |
|---|---|---|---|
| [dbt-utils](packages/dbt-utils.md) | 1.3.3 | Tested | Tested |
| [dbt-date](packages/dbt-date.md) | 0.17.2 | Tested | Tested |
| [dbt-codegen](packages/dbt-codegen.md) | 0.14.1 | Tested | Tested |
| [dbt-expectations](packages/dbt-expectations.md) | 0.10.10 | Tested | Tested |
| [dbt-audit-helper](packages/dbt-audit-helper.md) | 0.13.0 | Tested | Tested |
| [dbt-external-tables](packages/dbt-external-tables.md) | 0.11.0 | Tested | Not applicable |
| [dbt-profiler](packages/dbt-profiler.md) | 1.0.0 | Tested | Tested |

Compatibility is established via macro overrides wired through dbt's dispatch system. See [Package support](packages/index.md) for setup and the per-package detail pages.

### Capability declarations

The adapter declares its capabilities to dbt-core (`SchemaMetadataByRelations`, `TableLastModifiedMetadata`), so dbt can choose optimized code paths without the adapter needing to monkey-patch dbt internals.

### Transparent limitations documentation

Not every dbt feature is supported on every Fabric compute engine — and where it isn't, the [limitations page](limitations.md) documents exactly which features, why (platform constraint vs adapter design), and what workarounds exist. This applies to both adapter types and is organized by category: unsupported dbt features, SQL dialect limitations, DDL limitations, incremental model limitations.
