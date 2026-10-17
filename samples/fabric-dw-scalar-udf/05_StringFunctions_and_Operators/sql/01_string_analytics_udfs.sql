-- Generated from 05_StringFunctions_and_Operators/01_string_analytics_udfs.md.

CREATE OR ALTER FUNCTION dbo.udf_IsAlmostEqual
(
    @Value1 VARCHAR(4000),
    @Value2 VARCHAR(4000),
    @MaximumDistance INT = 2
)
RETURNS BIT
AS
BEGIN
    IF @Value1 IS NULL OR @Value2 IS NULL OR @MaximumDistance < 0
        RETURN 0;

    IF EDIT_DISTANCE(
           UPPER(LTRIM(RTRIM(@Value1))),
           UPPER(LTRIM(RTRIM(@Value2)))
       ) <= @MaximumDistance
        RETURN 1;

    RETURN 0;
END;
GO

SELECT
    g1.CityName AS CityName1,
    g2.CityName AS CityName2,
    g1.CanonicalCity,
    EDIT_DISTANCE(g1.CityName, g2.CityName) AS EditDistance
FROM dbo.Lab_Geo AS g1
INNER JOIN dbo.Lab_Geo AS g2
    ON g1.CanonicalCity = g2.CanonicalCity
    AND g1.GeoKey < g2.GeoKey
WHERE dbo.udf_IsAlmostEqual(g1.CityName, g2.CityName, 2) = 1
ORDER BY g1.CanonicalCity, EditDistance;
GO

CREATE OR ALTER FUNCTION dbo.udf_IsLikelyDuplicate
(
    @Value1 VARCHAR(4000),
    @Value2 VARCHAR(4000),
    @MinimumSimilarity INT = 85
)
RETURNS BIT
AS
BEGIN
    IF @Value1 IS NULL OR @Value2 IS NULL
        RETURN 0;

    IF JARO_WINKLER_SIMILARITY(
           UPPER(LTRIM(RTRIM(@Value1))),
           UPPER(LTRIM(RTRIM(@Value2)))
       ) >= @MinimumSimilarity
        RETURN 1;

    RETURN 0;
END;
GO

SELECT TOP (25)
    c1.CustomerID AS CustomerID1,
    c2.CustomerID AS CustomerID2,
    c1.CustomerName AS CustomerName1,
    c2.CustomerName AS CustomerName2,
    JARO_WINKLER_SIMILARITY(
        c1.CustomerName,
        c2.CustomerName
    ) AS Similarity
FROM dbo.Lab_Customers AS c1
INNER JOIN dbo.Lab_Customers AS c2
    ON c1.CustomerID < c2.CustomerID
WHERE dbo.udf_IsLikelyDuplicate(
          c1.CustomerName,
          c2.CustomerName,
          85
      ) = 1
ORDER BY Similarity DESC;
GO

CREATE OR ALTER FUNCTION dbo.udf_TypoSeverity
(
    @ExpectedValue VARCHAR(4000),
    @ObservedValue VARCHAR(4000)
)
RETURNS VARCHAR(10)
AS
BEGIN
    IF @ExpectedValue IS NULL OR @ObservedValue IS NULL
        RETURN 'UNKNOWN';

    DECLARE @Distance INT = EDIT_DISTANCE(
        UPPER(LTRIM(RTRIM(@ExpectedValue))),
        UPPER(LTRIM(RTRIM(@ObservedValue)))
    );

    IF @Distance = 0
        RETURN 'EXACT';

    IF @Distance = 1
        RETURN 'TINY';

    IF @Distance <= 3
        RETURN 'SMALL';

    RETURN 'LARGE';
END;
GO

SELECT
    dbo.udf_TypoSeverity(
        g.CanonicalCity,
        g.CityName
    ) AS Severity,
    COUNT(*) AS CityVariantCount
FROM dbo.Lab_Geo AS g
GROUP BY dbo.udf_TypoSeverity(
    g.CanonicalCity,
    g.CityName
)
ORDER BY CityVariantCount DESC;
GO

CREATE OR ALTER FUNCTION dbo.udf_FormatStatusLabel
(
    @Status VARCHAR(20),
    @Value VARCHAR(100)
)
RETURNS VARCHAR(200)
AS
BEGIN
    DECLARE @Symbol VARCHAR(10);
    DECLARE @Result VARCHAR(200) = '';

    IF UPPER(@Status) IN ('SUCCESS', 'PASS')
        SET @Symbol = UNISTR('\2713');
    ELSE IF UPPER(@Status) IN ('FAIL', 'ERROR')
        SET @Symbol = UNISTR('\2717');
    ELSE IF UPPER(@Status) IN ('WARNING', 'WARN')
        SET @Symbol = UNISTR('\26A0');
    ELSE
        SET @Symbol = UNISTR('\2022');

    SET @Result ||= @Symbol;
    SET @Result ||= ' ';
    SET @Result ||= UPPER(@Status);
    SET @Result ||= ': ';
    SET @Result ||= @Value;

    RETURN @Result;
END;
GO

SELECT TOP (20)
    CustomerID,
    CustomerTier,
    TotalSpend,
    dbo.udf_FormatStatusLabel(
        CASE
            WHEN TotalSpend >= 50000 THEN 'SUCCESS'
            WHEN TotalSpend >= 10000 THEN 'WARNING'
            ELSE 'REVIEW'
        END,
        'Tier=' || CustomerTier
    ) AS ExportLabel
FROM dbo.Lab_Customers
ORDER BY CustomerID;
GO
