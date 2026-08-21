# Known limitations

This page documents platform limitations of Microsoft Fabric that affect dbt models. These are not adapter bugs — they are constraints of the underlying compute engines that cannot be worked around with macro overrides.

## Data Warehouse (T-SQL)

### Unsupported dbt features

| dbt feature | Status | Details |
|---|---|---|
| **Persist docs** | Not supported | Fabric Data Warehouse cannot persist table/column descriptions via DDL. Use [Purview integration](purview-integration.md) instead. |
| **Materialized views** | Not supported | Fabric Data Warehouse does not support `CREATE MATERIALIZED VIEW`. Use tables with incremental materialization. |
| **Functions: aggregate (UDAF)** | Not supported | T-SQL does not have `CREATE AGGREGATE`. Only scalar functions are supported. |
| **Functions: Python UDF** | Not supported | Cannot create Python UDFs in Data Warehouse. Use [Python models](python-models.md) via Livy instead. |
| **Functions: volatility** | Not applicable | T-SQL scalar functions have no `DETERMINISTIC`/`STABLE`/`VOLATILE` metadata. The config is accepted but ignored. |
| **Ephemeral models (nested)** | Partially supported | Ephemeral models compile to CTEs. Nested ephemeral references fail in views because T-SQL does not support nested CTEs in view definitions. Materialize as `table` instead. |
| **Python models: non-PySpark** | Not supported | Only PySpark DataFrames are supported. Pandas, Polars, and other DataFrame types cannot be used. |
| **Catalog for single relation** | Not implemented | The optimized single-relation catalog query provides no benefit in Fabric. |

### SQL dialect limitations

| Limitation | Impact | Workaround |
|---|---|---|
| **No regular expressions** | `REGEXP`, `REGEXP_LIKE`, `RLIKE` do not exist | Use `LIKE` or `PATINDEX` for simple patterns; complex regex is not possible |
| **No boolean type** | Cannot use bare `TRUE`/`FALSE` in expressions or cast to boolean | Use `CASE WHEN` expressions or integer `0`/`1` |
| **No positional GROUP BY / ORDER BY** | `GROUP BY 1, 2` is not valid | Use explicit column names or expressions |
| **No nested CTEs in views** | A view definition cannot contain CTEs that reference other CTEs | Materialize as `table` instead of `view`, or restructure the query |
| **No CTEs inside subqueries** | CTEs cannot be used inside `FROM (...)` subqueries | Use inline subqueries or `CROSS APPLY VALUES` to restructure |
| **No `WIDTH_BUCKET()` function** | The standard SQL binning function does not exist | The adapter emulates it with `CEILING` and `CASE` |
| **No `DATE(y, m, d)` constructor** | No function to construct a date from year, month, day | Use `DATEFROMPARTS(y, m, d)` or compile-time Jinja |
| **No interval arithmetic** | Cannot use `+ INTERVAL '6 days'` syntax | Use `DATEADD(day, 6, ...)` |
| **No ISO week truncation** | No `DATE_TRUNC('isoweek', ...)` | Use `DATEADD`/`DATEDIFF` week arithmetic from day 0 |

### DDL limitations

| Limitation | Impact | Workaround |
|---|---|---|
| **No cascading drops** | Dropping a table does not cascade to dependent views | Drop dependent views first, or rebuild them after |
| **No `CREATE EXTERNAL TABLE`** | Synapse-style external tables are not supported | Use [OPENROWSET views](external-tables.md) |
| **Type inference for `bigint`** | Uncast integer literals show as `numeric`, not `bigint` | Explicitly cast with `CAST(... AS bigint)` |

## Lakehouse (Spark SQL)

### Unsupported dbt features

| dbt feature | Status | Details |
|---|---|---|
| **Clone** | Not supported | Fabric Lakehouse does not support `SHALLOW CLONE` (Databricks-specific Delta feature). The `dbt clone` command cannot be used. |
| **Grants** | Not supported | Fabric Lakehouse uses workspace-level access control, not SQL `GRANT` statements. The `grants` config has no effect. |
| **Functions (all types)** | Not supported | Fabric Lakehouse does not support `CREATE FUNCTION` via Spark SQL. This is a Databricks-only feature. No scalar, aggregate, or Python UDFs can be created. |
| **Persist docs** | Not supported | Cannot persist table/column descriptions via Spark SQL DDL. |
| **Constraints: NOT NULL in CTAS** | Not supported | `CREATE TABLE AS SELECT` cannot enforce `NOT NULL` constraints. They are silently ignored. |
| **Constraints: enforcement** | Not supported | `ALTER TABLE CHANGE COLUMN SET NOT NULL` is not supported on Fabric Delta tables. Constraint violations cannot be detected or rolled back during model execution. |
| **Incremental: delete+insert with predicates** | Not supported | Delta Lake on Fabric does not support subqueries in `DELETE` statements, which the delete+insert strategy requires when using predicates. |
| **Incremental: `on_schema_change='sync_all_columns'`** | Not supported | Apache Spark on Fabric does not support dropping columns from Delta tables. Schema sync cannot remove columns. |
| **Incremental: column changes after removal** | Broken | `DELTA_MERGE_UNRESOLVED_EXPRESSION` when merging after a column was removed upstream. Requires full refresh. |
| **Catalog for single relation** | Not implemented | Capability not implemented in FabricSpark. |

### SQL dialect limitations

| Limitation | Impact | Workaround |
|---|---|---|
| **No `information_schema`** | `information_schema.tables`, `information_schema.columns` do not exist | Use `SHOW TABLES`, `SHOW COLUMNS`, `DESCRIBE` |
| **No distinct window functions** | `COUNT(DISTINCT ...) OVER (...)` is not supported | Use subqueries or self-joins |
| **No subqueries in `DELETE`** | `DELETE FROM ... WHERE x IN (SELECT ...)` fails | Use `MERGE INTO` as an alternative |
| **No `CREATE FUNCTION`** | Spark SQL in Fabric does not support `CREATE FUNCTION` (Databricks-only) | Not available — use Python models for custom logic |
| **No `SHALLOW CLONE`** | Delta Lake clone operations are Databricks-specific | Not available in Fabric |
| **3-part name restrictions in DML** | `INSERT INTO` fails with 3-part names when temporary views exist in the session | The adapter handles this automatically |
| **`generate_series` compilation errors** | The `upper bound must be positive` error in Spark's implementation | Not available for certain use cases |

### DDL limitations

| Limitation | Impact | Workaround |
|---|---|---|
| **No cascading drops** | Dropping a source table does not drop dependent materialized views | Drop dependent views first |
| **No `DEFAULT` in `ALTER TABLE ADD COLUMN`** | Delta tables do not support default values when adding columns | Backfill defaults after adding the column |
| **No column drops from Delta tables** | `ALTER TABLE DROP COLUMN` is not supported | Recreate the table without the column |
| **No SQL `GRANT` statements** | Access control is workspace-level, not SQL-level | Manage access through Fabric workspace settings |
| **No `STRUCT` type** | BigQuery-specific type; not available in Spark SQL on Fabric | Use separate columns or JSON strings |

### Incremental model limitations

| Limitation | Strategy affected | Details |
|---|---|---|
| **Column removal breaks merge** | `merge` | `DELTA_MERGE_UNRESOLVED_EXPRESSION` when merging after a column was removed upstream. Requires `--full-refresh`. |
| **`sync_all_columns` not supported** | `merge` | Cannot drop columns from Delta tables, so schema sync is impossible. |
| **`partition_by` required** | `insert_overwrite`, `microbatch` | These strategies require `partition_by` to be set in the model config. |
| **Subqueries in predicates** | `delete+insert` | Delta Lake does not support subqueries in `DELETE` statements. Use `merge` instead. |
