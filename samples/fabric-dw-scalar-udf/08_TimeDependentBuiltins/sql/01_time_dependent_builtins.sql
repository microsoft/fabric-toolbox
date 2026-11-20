-- ============================================================================
-- Lab 08: Time-dependent built-ins in computation-based scalar UDFs
-- ============================================================================

-- Step 1: Put a time-dependent built-in in a scalar UDF.
CREATE OR ALTER FUNCTION dbo.udf_GetCurrentUtc()
RETURNS DATETIME2(6)
AS
BEGIN
    RETURN SYSUTCDATETIME();
END;
GO

-- Step 2: Use two time-dependent expressions around a small procedural loop.
CREATE OR ALTER FUNCTION dbo.udf_GetLoopDurationMicroseconds()
RETURNS INT
AS
BEGIN
    DECLARE @start DATETIME2(6);
    DECLARE @end DATETIME2(6);
    DECLARE @iteration INT = 0;

    SET @start = SYSDATETIME();

    WHILE @iteration < 10
    BEGIN
        SET @iteration = @iteration + 1;
    END;

    SET @end = SYSDATETIME();

    RETURN DATEDIFF(MICROSECOND, @start, @end);
END;
GO

-- Step 3: Confirm that both UDFs use Expression Block inlining.
SELECT
    o.name AS FunctionName,
    m.is_inlineable,
    m.inline_eligibility_mask
FROM sys.objects AS o
INNER JOIN sys.sql_modules AS m
    ON m.object_id = o.object_id
WHERE o.object_id IN
(
    OBJECT_ID('dbo.udf_GetCurrentUtc'),
    OBJECT_ID('dbo.udf_GetLoopDurationMicroseconds')
)
ORDER BY
    o.name;
GO

-- Step 4: Use the UDFs in an analytical query.
SELECT
    t.ProductID,
    COUNT(*) AS TransactionCount,
    SUM(CAST(t.Quantity AS BIGINT)) AS UnitsSold,
    SUM(t.Quantity * t.UnitPrice) AS GrossSales,
    MIN(dbo.udf_GetCurrentUtc()) AS EarliestUtcObserved,
    MAX(dbo.udf_GetCurrentUtc()) AS LatestUtcObserved,
    SUM(
        CAST(
            dbo.udf_GetLoopDurationMicroseconds()
            AS BIGINT
        )
    ) AS SumOfObservedLoopDurationsMicroseconds
FROM dbo.Lab_Transactions AS t
GROUP BY
    t.ProductID
ORDER BY
    GrossSales DESC;
GO
