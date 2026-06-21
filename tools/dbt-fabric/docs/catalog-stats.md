# Catalog statistics

When you run `dbt docs generate`, this adapter enriches the [catalog](https://docs.getdbt.com/reference/artifacts/catalog-json) with **approximate row counts** for every table in your Fabric Data Warehouse. These row counts appear in the dbt docs site alongside your column information, giving you a quick sense of table sizes without running any additional queries.

---

## How it works

The catalog query uses the T-SQL function [`OBJECTPROPERTYEX`](https://learn.microsoft.com/sql/t-sql/functions/objectpropertyex-transact-sql?view=fabric) with the `'Cardinality'` property to retrieve the optimizer's row count estimate for each table:

```sql
cast(objectpropertyex(object_id, 'Cardinality') as int)
```

This is the same estimate that the query optimizer uses internally, derived from table statistics. It is **not** an exact count — it is an approximation that avoids the cost of scanning the entire table.

Row counts are included for **base tables only**. Views do not have cardinality statistics, so the row count stat is excluded from views in the catalog output.

---

## What you see in dbt docs

After running `dbt docs generate` and opening the docs site, each table node shows a **Row Count** statistic with the approximate number of rows. Views show no row count.

No configuration is needed — the statistics are included automatically whenever you generate the catalog.

---

## Why row counts in the catalog?

Having row counts visible directly in the dbt docs site is especially useful for:

- **Quickly assessing table sizes** during development and code review
- **Spotting unexpected growth or emptiness** in tables after a dbt run
- **Onboarding new team members** who want to understand the data landscape

---

## Limitations

- Row counts are **approximate**. They come from the query optimizer's statistics, which may lag behind the actual row count if statistics have not been updated recently.
- Row counts are only available for **Fabric Data Warehouse** (the `fabric` adapter type). The FabricSpark adapter does not include this feature.
