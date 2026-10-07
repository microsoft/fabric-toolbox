-- Generated from 02_InliningViaExpressionBlock/04_projected_balance.md.

CREATE OR ALTER FUNCTION dbo.udf_WhileCompoundInterest(
    @principal DECIMAL(18,2),
    @annualRate DECIMAL(6,4),
    @years INT
)
RETURNS DECIMAL(18,2)
AS
BEGIN
    DECLARE @balance DECIMAL(18,2) = @principal;
    DECLARE @monthlyRate DECIMAL(10,8) = @annualRate / 12;
    DECLARE @year INT = 1;
    DECLARE @month INT;

    WHILE @year <= @years
    BEGIN
        SET @month = 1;
        WHILE @month <= 12
        BEGIN
            SET @balance = @balance * (1 + @monthlyRate);
            SET @month = @month + 1;
        END
        SET @year = @year + 1;
    END

    RETURN @balance;
END;
GO

SELECT
    c.CustomerTier,
    AVG(dbo.udf_WhileCompoundInterest(
        c.TotalSpend,
        r.BaseRate,
        3
    )) AS ProjectedBalanceAfter3Years
FROM dbo.Lab_Customers AS c
INNER JOIN dbo.Lab_InterestRates AS r
    ON r.TierName = c.CustomerTier
    AND c.TotalSpend >= r.MinBalance
    AND c.TotalSpend < r.MaxBalance
WHERE r.IsActive = 1
    AND r.CompoundingPeriods = 12
GROUP BY c.CustomerTier;
GO
