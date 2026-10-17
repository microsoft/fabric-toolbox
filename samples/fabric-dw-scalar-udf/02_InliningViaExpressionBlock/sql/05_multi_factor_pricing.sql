-- Generated from 02_InliningViaExpressionBlock/05_multi_factor_pricing.md.

CREATE OR ALTER FUNCTION dbo.udf_CalculateNetOrderValue
(
    @UnitPrice DECIMAL(10,2),
    @CustomerTier VARCHAR(20),
    @Quantity INT,
    @MonthNumber INT
)
RETURNS DECIMAL(18,2)
AS
BEGIN
    IF @UnitPrice IS NULL OR @Quantity IS NULL OR @Quantity <= 0
        RETURN NULL;

    DECLARE @TierDiscount DECIMAL(5,4) = 0;
    DECLARE @VolumeDiscount DECIMAL(5,4) = 0;
    DECLARE @SeasonalFactor DECIMAL(5,4) = 1;

    IF @CustomerTier = 'Gold'
        SET @TierDiscount = 0.20;
    ELSE IF @CustomerTier = 'Silver'
        SET @TierDiscount = 0.10;
    ELSE IF @CustomerTier = 'Bronze'
        SET @TierDiscount = 0.05;

    IF @Quantity >= 50
        SET @VolumeDiscount = 0.10;
    ELSE IF @Quantity >= 20
        SET @VolumeDiscount = 0.05;
    ELSE IF @Quantity >= 10
        SET @VolumeDiscount = 0.02;

    IF @MonthNumber IN (11, 12)
        SET @SeasonalFactor = 1.10;
    ELSE IF @MonthNumber IN (1, 2)
        SET @SeasonalFactor = 0.95;

    RETURN ROUND(
        @UnitPrice
        * @Quantity
        * (1 - @TierDiscount)
        * (1 - @VolumeDiscount)
        * @SeasonalFactor,
        2
    );
END;
GO

SELECT
    c.CustomerTier,
    MONTH(t.TransactionDate) AS TransactionMonth,
    COUNT(*) AS HighValueTransactionCount,
    SUM(t.UnitPrice * t.Quantity) AS HighValueGrossOrderValue,
    SUM(dbo.udf_CalculateNetOrderValue(
        t.UnitPrice,
        c.CustomerTier,
        t.Quantity,
        MONTH(t.TransactionDate)
    )) AS HighValueNetOrderValue
FROM dbo.Lab_Transactions AS t
INNER JOIN dbo.Lab_Customers AS c
    ON t.CustomerID = c.CustomerID
WHERE dbo.udf_CalculateNetOrderValue(
          t.UnitPrice,
          c.CustomerTier,
          t.Quantity,
          MONTH(t.TransactionDate)
      ) >= 500
GROUP BY
    c.CustomerTier,
    MONTH(t.TransactionDate)
ORDER BY
    TransactionMonth,
    c.CustomerTier;
GO
