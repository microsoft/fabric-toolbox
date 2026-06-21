# Statistics

Fabric Data Warehouse supports [manual statistics](https://learn.microsoft.com/fabric/data-warehouse/statistics) that give the query optimizer accurate cardinality estimates. While Fabric creates automatic statistics at query time (using sampling), manual statistics use `FULLSCAN` by default — reading all rows for exact histograms — and persist across sessions without needing a query to trigger creation.

This adapter lets you manage manual statistics declaratively using the `statistics` config option.

---

## When to use manual statistics

Fabric creates automatic statistics for columns used in `GROUP BY`, `JOIN`, `WHERE`, and `ORDER BY` clauses. Manual statistics add value when:

- **After large data loads** — automatic stats may be stale until the next query triggers a refresh
- **For critical query paths** — avoid the first query after a data change paying the cost of synchronous statistics creation
- **When sampling isn't accurate enough** — automatic stats use sampling; `FULLSCAN` reads all rows

!!! tip "Choosing which columns"
    Focus on columns in `WHERE`, `JOIN`, `GROUP BY`, and `ORDER BY` clauses — these are where the optimizer needs cardinality estimates. Columns only in the `SELECT` list don't benefit from statistics.

---

## Usage

Add `statistics` to your model's config block. It accepts `true` (all columns), a single column name, or a list of column names:

=== "Specific columns"

    ```sql title="models/orders.sql"
    {{ config(
        materialized='table',
        statistics=['customer_id', 'order_date', 'product_id']
    ) }}

    select
        order_id,
        order_date,
        customer_id,
        product_id,
        total_amount
    from {{ source('raw', 'orders') }}
    ```

=== "All columns"

    ```sql title="models/orders.sql"
    {{ config(
        materialized='table',
        statistics=true
    ) }}

    select
        order_id,
        order_date,
        customer_id,
        total_amount
    from {{ source('raw', 'orders') }}
    ```

=== "In dbt_project.yml"

    ```yaml title="dbt_project.yml"
    models:
      my_project:
        marts:
          +statistics: ['customer_id', 'order_date']
        staging:
          +statistics: true
    ```

The generated SQL for specific columns:

```sql
CREATE STATISTICS [dbt_stats__fcfc231ef98cf4ae86d587235eda4cd7]
ON [schema].[orders] ([customer_id]) WITH FULLSCAN;

CREATE STATISTICS [dbt_stats__62b326a5adbe56da5634fa1bcf7b579e]
ON [schema].[orders] ([order_date]) WITH FULLSCAN;
```

On subsequent runs, existing statistics are updated instead of recreated:

```sql
UPDATE STATISTICS [schema].[orders] [dbt_stats__fcfc231ef98cf4ae86d587235eda4cd7] WITH FULLSCAN;
```

---

## Sampling

By default, manual statistics use `FULLSCAN` (exact counts). For large tables where a full scan is too expensive, use `statistics_sample_percent` to switch to sampling:

```sql title="models/orders.sql"
{{ config(
    materialized='table',
    statistics=['customer_id', 'order_date'],
    statistics_sample_percent=50
) }}

select ...
```

```yaml title="dbt_project.yml"
models:
  my_project:
    staging:
      +statistics: true
      +statistics_sample_percent: 25
```

This generates:

```sql
CREATE STATISTICS [dbt_stats__fcfc231ef98cf4ae86d587235eda4cd7]
ON [schema].[orders] ([customer_id]) WITH SAMPLE 50 PERCENT;
```

---

## Works with incremental models

Statistics are created or updated on every run — both full refresh and incremental merge:

```sql title="models/orders_incremental.sql"
{{ config(
    materialized='incremental',
    unique_key='order_id',
    statistics=['customer_id', 'order_date']
) }}

select
    order_id,
    order_date,
    customer_id,
    total_amount
from {{ source('raw', 'orders') }}
{% if is_incremental() %}
where order_date > (select max(order_date) from {{ this }})
{% endif %}
```

---

## Works with snapshots

Statistics can also be configured on snapshots:

```yaml title="snapshots/schema.yml"
snapshots:
  - name: orders_snapshot
    config:
      statistics: ['customer_id', 'dbt_valid_from', 'dbt_valid_to']
```

---

## `statistics: true` vs explicit column list

`statistics: true` creates statistics on every column in the table. This is convenient but has trade-offs:

| | `statistics: true` | Explicit column list |
|---|---|---|
| **Convenience** | No maintenance needed | Must update when columns change |
| **Performance** | Full scan per column — slow on wide, large tables | Only scans the columns you specify |
| **Value** | Covers columns that don't affect query plans | Targets columns the optimizer actually uses |

**Rule of thumb**: use `true` for small-to-medium tables or when simplicity matters. Use an explicit list for large tables where you want to minimize post-create overhead.

---

## Naming convention

Statistics are named `dbt_stats__<md5_hash>` where the hash is computed from `<table>__<column>` (e.g., `dbt_stats__fcfc231ef98cf4ae86d587235eda4cd7` for column `customer_id` on table `orders`). The `dbt_stats__` prefix avoids collisions with Fabric's auto-generated `_WA_Sys_*` statistics, and hashing guarantees uniqueness regardless of identifier length.

---

## Limitations

- **Fabric Data Warehouse only** — FabricSpark (Lakehouse) uses a different statistics mechanism (`ANALYZE TABLE`) and is not supported by this config option
- **Single-column statistics only** — Fabric Data Warehouse [does not support multi-column statistics](https://learn.microsoft.com/fabric/data-warehouse/statistics#limitations)
- **One scan method per model** — all columns in a model use the same `FULLSCAN` or `SAMPLE` setting; for per-column control, use post-hooks
