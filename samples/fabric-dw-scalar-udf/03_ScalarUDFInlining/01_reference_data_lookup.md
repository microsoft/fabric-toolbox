# Reference-Data Lookup with Scalar UDF Inlining

Run [`00_Source/sql/01_setup_tables.sql`](../00_Source/sql/01_setup_tables.sql)
before starting.

## Create a data-access scalar UDF

`udf_LookupGeoKey` prepares imported city and country values for an exact
lookup against `Lab_Geo`, then returns the matching warehouse geography key.

```sql
CREATE OR ALTER FUNCTION dbo.udf_LookupGeoKey
(
    @InputCity VARCHAR(100),
    @InputCountry VARCHAR(100)
)
RETURNS INT
AS
BEGIN
    DECLARE @GeoKey INT = NULL;
    DECLARE @CleanCity VARCHAR(100) = UPPER(LTRIM(RTRIM(@InputCity)));
    DECLARE @CleanCountry VARCHAR(100) = UPPER(LTRIM(RTRIM(@InputCountry)));

    SELECT TOP (1)
        @GeoKey = GeoKey
    FROM dbo.Lab_Geo
    WHERE UPPER(LTRIM(RTRIM(CityName))) = @CleanCity
        AND UPPER(LTRIM(RTRIM(Country))) = @CleanCountry
    ORDER BY GeoKey;

    RETURN @GeoKey;
END;
GO
```

## Inspect inlineability

```sql
SELECT
    o.name AS FunctionName,
    m.is_inlineable,
    m.inline_eligibility_mask
FROM sys.objects AS o
INNER JOIN sys.sql_modules AS m
    ON o.object_id = m.object_id
WHERE o.name = 'udf_LookupGeoKey';
GO
```

**Expected:** `is_inlineable = 1`, `inline_eligibility_mask = 1`.

## Resolve imported geography values

This query simulates raw geography values arriving from an ETL staging table.
It uses existing `Lab_Geo` rows to create test inputs by converting the city
and country to lowercase and adding surrounding spaces. The original
`GeoKey` is retained as the expected value, while `udf_LookupGeoKey` cleans the
simulated input and returns `ResolvedGeoKey`. Matching keys confirm that the
lookup succeeded.

```sql
SELECT TOP (25)
    g.GeoKey AS ExpectedGeoKey,
    ' ' + LOWER(g.CityName) + ' ' AS ImportedCity,
    ' ' + LOWER(g.Country) + ' ' AS ImportedCountry,
    dbo.udf_LookupGeoKey(
        ' ' + LOWER(g.CityName) + ' ',
        ' ' + LOWER(g.Country) + ' '
    ) AS ResolvedGeoKey
FROM dbo.Lab_Geo AS g
ORDER BY g.GeoKey;
GO
```

➡️ Continue to
[Combining Inlining Techniques](../04_CombiningInliningTechniques/00_ReadMe.md).

🏠 [Back to Main](../README.md)
