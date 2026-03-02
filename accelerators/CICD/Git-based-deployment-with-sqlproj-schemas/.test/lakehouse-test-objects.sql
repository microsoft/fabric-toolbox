-- Consolidated test objects for lakehouse layer
-- Target: DemoLakehouse_Shortcut (with dependencies on DemoLakehouse)

IF OBJECT_ID(N'[dbo].[sp_Test_GetLakehouseCountries_Local]', N'P') IS NOT NULL
    DROP PROCEDURE [dbo].[sp_Test_GetLakehouseCountries_Local];
GO

IF OBJECT_ID(N'[dbo].[sp_Test_GetLakehouseCountries]', N'P') IS NOT NULL
    DROP PROCEDURE [dbo].[sp_Test_GetLakehouseCountries];
GO

IF OBJECT_ID(N'[dbo].[fn_Test_ParsePopulation]', N'FN') IS NOT NULL
    DROP FUNCTION [dbo].[fn_Test_ParsePopulation];
GO

IF OBJECT_ID(N'[dbo].[ufn_Test_LakehouseCountries_Local]', N'IF') IS NOT NULL
    DROP FUNCTION [dbo].[ufn_Test_LakehouseCountries_Local];
GO

IF OBJECT_ID(N'[dbo].[ufn_Test_LakehouseTopCountries]', N'IF') IS NOT NULL
    DROP FUNCTION [dbo].[ufn_Test_LakehouseTopCountries];
GO

IF OBJECT_ID(N'[dbo].[vw_Test_LakehouseCountries_Local]', N'V') IS NOT NULL
    DROP VIEW [dbo].[vw_Test_LakehouseCountries_Local];
GO

IF OBJECT_ID(N'[dbo].[vw_Test_LakehouseCountries]', N'V') IS NOT NULL
    DROP VIEW [dbo].[vw_Test_LakehouseCountries];
GO

CREATE VIEW [dbo].[vw_Test_LakehouseCountries]
AS
SELECT
    [country],
    [city],
    TRY_CAST([population] AS BIGINT) AS [population_bigint]
FROM [DemoLakehouse].[dbo].[countries];

GO

CREATE FUNCTION [dbo].[ufn_Test_LakehouseTopCountries]
(
    @MinPopulation BIGINT
)
RETURNS TABLE
AS
RETURN
(
    SELECT
        [country],
        SUM(TRY_CAST([population] AS BIGINT)) AS [total_population]
    FROM [DemoLakehouse].[dbo].[countries]
    GROUP BY [country]
    HAVING SUM(TRY_CAST([population] AS BIGINT)) >= @MinPopulation
);

GO

CREATE FUNCTION [dbo].[fn_Test_ParsePopulation]
(
    @Population VARCHAR(8000)
)
RETURNS BIGINT
AS
BEGIN
    RETURN TRY_CAST(@Population AS BIGINT);
END

GO

CREATE PROCEDURE [dbo].[sp_Test_GetLakehouseCountries]
    @CountryName VARCHAR(8000)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        [country],
        [city],
        [population]
    FROM [DemoLakehouse].[dbo].[countries]
    WHERE [country] = @CountryName;
END

GO

-- Local (same-database) 2-part name tests

CREATE VIEW [dbo].[vw_Test_LakehouseCountries_Local]
AS
SELECT
    [country],
    [city],
    TRY_CAST([population] AS BIGINT) AS [population_bigint]
FROM [dbo].[countries];

GO

CREATE FUNCTION [dbo].[ufn_Test_LakehouseCountries_Local]
(
    @CountryName VARCHAR(8000)
)
RETURNS TABLE
AS
RETURN
(
    SELECT
        [country],
        [city],
        [population_bigint]
    FROM [dbo].[vw_Test_LakehouseCountries_Local]
    WHERE [country] = @CountryName
);

GO

CREATE PROCEDURE [dbo].[sp_Test_GetLakehouseCountries_Local]
    @CountryName VARCHAR(8000)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        [country],
        [city],
        [population]
    FROM [dbo].[countries]
    WHERE [country] = @CountryName;
END

GO
