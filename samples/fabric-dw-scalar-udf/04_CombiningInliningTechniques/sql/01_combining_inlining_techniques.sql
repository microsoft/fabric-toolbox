-- Generated from
-- 04_CombiningInliningTechniques/01_combining_inlining_techniques.md.

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

-- Expected failure: scalar UDF inlining can't be used with a CTE.
-- Run this block separately when you want to observe the error.
/*
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
*/
