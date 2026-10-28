# 🔧 Utilities

Helper scripts for observability and dependency analysis.

## Scripts

| Script | Purpose |
|--------|---------|
| [100_observability_script.sql](100_observability_script.sql) | UDF definition metadata and approximate feature-detection heuristics |
| [100_get_all_dependencies.sql](100_get_all_dependencies.sql) | Identify dependencies referenced by scalar UDFs |

---

## Catalog Reference: UDF Inlining Status

In Fabric Data Warehouse, a scalar UDF must be **inlineable** to run inside distributed queries (`SELECT ... FROM` user tables). You can inspect inlining eligibility with the documented `sys.sql_modules` columns `is_inlineable` and `inline_eligibility_mask`.

### Key Columns

| Column | Description |
|--------|-------------|
| `is_inlineable` | `1` if the function is eligible for inlining, `0` otherwise |
| `inline_eligibility_mask` | Indicates which inlining technique applies |

### `inline_eligibility_mask` Values

| Value | Meaning |
|-------|---------|
| `0` | Not inlineable |
| `1` | Eligible for Scalar UDF inlining |
| `2` | Eligible for inlining via Expression Block |
| `3` | Eligible for either technique |

> **Note:** These attributes are recomputed on `CREATE` or `ALTER FUNCTION`. For the full list of what makes a UDF inlineable, see the official [CREATE FUNCTION (Fabric Data Warehouse)](https://learn.microsoft.com/sql/t-sql/statements/create-function-sql-data-warehouse?view=fabric#metadata) documentation.

### Quick Check Query

```sql
SELECT 
    SCHEMA_NAME(o.schema_id) AS SchemaName,
    o.name AS FunctionName,
    m.is_inlineable,
    m.inline_eligibility_mask,
    CASE m.inline_eligibility_mask
        WHEN 0 THEN 'Not inlineable'
        WHEN 1 THEN 'Scalar UDF inlining'
        WHEN 2 THEN 'Inlining via Expression Block'
        WHEN 3 THEN 'Either technique'
    END AS InliningType
FROM sys.objects o
JOIN sys.sql_modules m ON o.object_id = m.object_id
WHERE o.type = 'FN'
ORDER BY o.name;
```

---

## Notes

These are optional diagnostic tools — use as needed during testing.

> **Note:** The observability script uses T-SQL string pattern matching to detect UDF features. Results are approximate and may not capture all edge cases in large or deeply nested function bodies.

---

⬅️ [Back to Main](../README.md)
