-- Generated from 02_InliningViaExpressionBlock/02_validation_returns.md.

CREATE OR ALTER FUNCTION dbo.udf_ValidateTier
(
    @Tier VARCHAR(20),
    @TotalSpend DECIMAL(18,2)
)
RETURNS VARCHAR(20)
AS
BEGIN
    IF @Tier IS NULL OR @TotalSpend IS NULL OR @TotalSpend < 0
        RETURN 'INVALID';

    IF @Tier = 'Gold'
    BEGIN
        IF @TotalSpend >= 50000
            RETURN 'TIER_OK';
        RETURN 'DOWNGRADE_CANDIDATE';
    END;

    IF @Tier = 'Silver'
    BEGIN
        IF @TotalSpend >= 50000
            RETURN 'UPGRADE_CANDIDATE';
        IF @TotalSpend >= 10000
            RETURN 'TIER_OK';
        RETURN 'DOWNGRADE_CANDIDATE';
    END;

    IF @Tier = 'Bronze'
    BEGIN
        IF @TotalSpend >= 10000
            RETURN 'UPGRADE_CANDIDATE';
        RETURN 'TIER_OK';
    END;

    RETURN 'UNKNOWN_TIER';
END;
GO

CREATE OR ALTER FUNCTION dbo.udf_GetStockStatus(@StockQuantity INT)
RETURNS VARCHAR(20)
AS
BEGIN
    IF @StockQuantity IS NULL
        RETURN 'UNKNOWN';

    IF @StockQuantity <= 0
        RETURN 'OUT_OF_STOCK';

    IF @StockQuantity < 500
        RETURN 'LOW';

    IF @StockQuantity < 2000
        RETURN 'MEDIUM';

    RETURN 'HIGH';
END;
GO

SELECT
    CustomerID,
    CustomerName,
    CustomerTier,
    TotalSpend,
    dbo.udf_ValidateTier(CustomerTier, TotalSpend) AS TierRecommendation
FROM dbo.Lab_Customers;
GO

SELECT
    ProductID,
    ProductName,
    StockQuantity,
    dbo.udf_GetStockStatus(StockQuantity) AS StockStatus
FROM dbo.Lab_Products
ORDER BY ProductID;
GO
