# Use Both Inlining Techniques in One Query

This lesson reuses two functions created earlier:

- `udf_WhileCompoundInterest` uses inlining via Expression Block.
- `udf_LookupGeoKey` uses scalar UDF inlining.

Run the following scripts before starting:

1. [`02_InliningViaExpressionBlock/sql/04_projected_balance.sql`](../02_InliningViaExpressionBlock/sql/04_projected_balance.sql)
2. [`03_ScalarUDFInlining/sql/01_reference_data_lookup.sql`](../03_ScalarUDFInlining/sql/01_reference_data_lookup.sql)

## Compare the eligibility metadata

```sql
SELECT
    o.name AS FunctionName,
    m.is_inlineable,
    m.inline_eligibility_mask,
    CASE m.inline_eligibility_mask
        WHEN 1 THEN 'Scalar UDF inlining'
        WHEN 2 THEN 'Inlining via Expression Block'
        WHEN 3 THEN 'Either inlining technique'
        ELSE 'Not inlineable'
    END AS EligibleTechnique
FROM sys.objects AS o
INNER JOIN sys.sql_modules AS m
    ON o.object_id = m.object_id
WHERE o.name IN
(
    'udf_WhileCompoundInterest',
    'udf_LookupGeoKey'
)
ORDER BY o.name;
GO
```

**Expected:**

| Function | `inline_eligibility_mask` |
|---|---:|
| `udf_WhileCompoundInterest` | `2` |
| `udf_LookupGeoKey` | `1` |

## Enrich customer records

The query projects a three-year customer balance and resolves the customer's
imported city and country values to a warehouse geography key:

```sql
SELECT TOP (25)
    c.CustomerID,
    c.CustomerTier,
    c.TotalSpend AS CurrentBalance,
    dbo.udf_WhileCompoundInterest(
        c.TotalSpend,
        CASE c.CustomerTier
            WHEN 'Gold' THEN 0.0400
            WHEN 'Silver' THEN 0.0500
            ELSE 0.0600
        END,
        3
    ) AS ProjectedBalanceAfter3Years,
    g.CityName AS ImportedCity,
    g.Country AS ImportedCountry,
    dbo.udf_LookupGeoKey(
        g.CityName,
        g.Country
    ) AS ResolvedGeoKey
FROM dbo.Lab_Customers AS c
INNER JOIN dbo.Lab_Geo AS g
    ON g.GeoKey = c.GeoKey
WHERE c.IsActive = 1
ORDER BY c.CustomerID;
GO
```

The query combines both inlining techniques over the same customer and
geography rows. Because the city and country values come from the joined
`Lab_Geo` reference row, the lookup uses controlled sample data to demonstrate
the combined execution pattern; it isn't intended to represent a production
geography-enrichment pipeline.

## Compare with a CTE pattern

The following query moves the same source rows into a CTE. It is intentionally
an expected-failure example: because `udf_LookupGeoKey` relies on scalar UDF
inlining, the complete query can't use a CTE.

```sql
WITH CustomerLocations AS
(
    SELECT
        c.CustomerID,
        c.CustomerTier,
        c.TotalSpend,
        g.CityName,
        g.Country
    FROM dbo.Lab_Customers AS c
    INNER JOIN dbo.Lab_Geo AS g
        ON g.GeoKey = c.GeoKey
    WHERE c.IsActive = 1
)
SELECT TOP (25)
    CustomerID,
    CustomerTier,
    dbo.udf_WhileCompoundInterest(
        TotalSpend,
        CASE CustomerTier
            WHEN 'Gold' THEN 0.0400
            WHEN 'Silver' THEN 0.0500
            ELSE 0.0600
        END,
        3
    ) AS ProjectedBalanceAfter3Years,
    dbo.udf_LookupGeoKey(
        CityName,
        Country
    ) AS ResolvedGeoKey
FROM CustomerLocations;
GO
```

**Expected error:** `Scalar UDF execution is currently unavailable in this
context.`

➡️ Continue to
[String Functions and Operators](../05_StringFunctions_and_Operators/00_ReadMe.md).

🏠 [Back to Main](../README.md)
