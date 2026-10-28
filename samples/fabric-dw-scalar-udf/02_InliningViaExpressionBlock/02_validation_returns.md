# Validation with Multiple Returns

These examples use guard clauses and multiple `RETURN` statements to classify
customer and product records.

## Validate customer tier

```sql
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
```

```sql
SELECT
    CustomerID,
    CustomerName,
    CustomerTier,
    TotalSpend,
    dbo.udf_ValidateTier(CustomerTier, TotalSpend) AS TierRecommendation
FROM dbo.Lab_Customers;
```

## Classify inventory

```sql
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
```

```sql
SELECT
    ProductID,
    ProductName,
    StockQuantity,
    dbo.udf_GetStockStatus(StockQuantity) AS StockStatus
FROM dbo.Lab_Products
ORDER BY ProductID;
```

➡️ Continue to [Query Shapes](03_query_shapes.md).
