-- Generated from 03_ScalarUDFInlining/01_reference_data_lookup.md.

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

SELECT
    o.name AS FunctionName,
    m.is_inlineable,
    m.inline_eligibility_mask
FROM sys.objects AS o
INNER JOIN sys.sql_modules AS m
    ON o.object_id = m.object_id
WHERE o.name = 'udf_LookupGeoKey';
GO

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
