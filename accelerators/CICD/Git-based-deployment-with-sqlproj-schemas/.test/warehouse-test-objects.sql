-- Consolidated test objects for warehouse layer
-- Target: DemoWarehouse (with dependencies on DemoLakehouse and DemoLakehouse_Shortcut)

IF OBJECT_ID(N'[dbo].[usp_Test_WarehouseLakehouseSummary]', N'P') IS NOT NULL
    DROP PROCEDURE [dbo].[usp_Test_WarehouseLakehouseSummary];
GO

IF OBJECT_ID(N'[dbo].[fn_Test_WarehousePopulationBucket]', N'FN') IS NOT NULL
    DROP FUNCTION [dbo].[fn_Test_WarehousePopulationBucket];
GO

IF OBJECT_ID(N'[dbo].[ufn_Test_WarehouseLakehouseCountries]', N'IF') IS NOT NULL
    DROP FUNCTION [dbo].[ufn_Test_WarehouseLakehouseCountries];
GO

IF OBJECT_ID(N'[dbo].[vw_Test_WarehouseLakehouseDependency]', N'V') IS NOT NULL
    DROP VIEW [dbo].[vw_Test_WarehouseLakehouseDependency];
GO

CREATE VIEW [dbo].[vw_Test_WarehouseLakehouseDependency]
AS
SELECT
    [country],
    [city],
    TRY_CAST([population] AS BIGINT) AS [population_bigint]
FROM [DemoLakehouse_Shortcut].[dbo].[countries];

GO

CREATE FUNCTION [dbo].[ufn_Test_WarehouseLakehouseCountries]
(
    @CountryPrefix VARCHAR(100)
)
RETURNS TABLE
AS
RETURN
(
    SELECT
        [country],
        [city],
        TRY_CAST([population] AS BIGINT) AS [population_bigint]
    FROM [DemoLakehouse].[dbo].[countries]
    WHERE [country] LIKE @CountryPrefix + '%'
);

GO

CREATE FUNCTION [dbo].[fn_Test_WarehousePopulationBucket]
(
    @Population BIGINT
)
RETURNS VARCHAR(20)
AS
BEGIN
    RETURN
        CASE
            WHEN @Population IS NULL THEN 'unknown'
            WHEN @Population < 1000000 THEN 'small'
            WHEN @Population < 5000000 THEN 'medium'
            ELSE 'large'
        END;
END

GO

CREATE PROCEDURE [dbo].[usp_Test_WarehouseLakehouseSummary]
    @TopN INT = 10
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP (@TopN)
        c.[country],
        c.[city],
        TRY_CAST(c.[population] AS BIGINT) AS [population_bigint],
        d.[AGE],
        d.[SEX],
        d.[BMI]
    FROM [DemoLakehouse].[dbo].[countries] c
    LEFT JOIN [dbo].[Diabetes] d
        ON 1 = 1
    ORDER BY TRY_CAST(c.[population] AS BIGINT) DESC;
END

GO
