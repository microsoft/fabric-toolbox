-- Generated from 01_InliningFundamentals/00_ReadMe.md.
-- See the markdown file for explanations, plan signatures, and requirements.

-- ============================================================================
-- 1. Computation-based UDF: inlining via Expression Block
-- ============================================================================
CREATE OR ALTER FUNCTION dbo.udf_WhileSumAccumulator(@n INT)
RETURNS INT
AS
BEGIN
    DECLARE @i INT = 1;
    DECLARE @sum INT = 0;

    WHILE @i <= @n
    BEGIN
        SET @sum = @sum + @i;
        SET @i = @i + 1;
    END;

    RETURN @sum;
END;
GO

SELECT
    o.name AS FunctionName,
    m.is_inlineable,
    m.inline_eligibility_mask
FROM sys.objects AS o
INNER JOIN sys.sql_modules AS m
    ON o.object_id = m.object_id
WHERE o.name = 'udf_WhileSumAccumulator';
GO

SELECT TOP (5)
    t.TransactionID,
    t.Quantity,
    dbo.udf_WhileSumAccumulator(t.Quantity) AS AccumulatedQuantity
FROM dbo.Lab_Transactions AS t
ORDER BY t.TransactionID;
GO

SET SHOWPLAN_XML ON;
GO
SELECT TOP (5)
    t.TransactionID,
    t.Quantity,
    dbo.udf_WhileSumAccumulator(t.Quantity) AS AccumulatedQuantity
FROM dbo.Lab_Transactions AS t
ORDER BY t.TransactionID;
GO
SET SHOWPLAN_XML OFF;
GO

-- ============================================================================
-- 2. Data-access UDF: scalar UDF inlining
-- ============================================================================
CREATE OR ALTER FUNCTION dbo.udf_GetCustomerTier(@CustomerID INT)
RETURNS VARCHAR(20)
AS
BEGIN
    DECLARE @CustomerTier VARCHAR(20);

    SELECT @CustomerTier = CustomerTier
    FROM dbo.Lab_Customers
    WHERE CustomerID = @CustomerID;

    RETURN @CustomerTier;
END;
GO

SELECT
    o.name AS FunctionName,
    m.is_inlineable,
    m.inline_eligibility_mask
FROM sys.objects AS o
INNER JOIN sys.sql_modules AS m
    ON o.object_id = m.object_id
WHERE o.name = 'udf_GetCustomerTier';
GO

SELECT TOP (5)
    t.TransactionID,
    t.CustomerID,
    dbo.udf_GetCustomerTier(t.CustomerID) AS CustomerTier
FROM dbo.Lab_Transactions AS t
ORDER BY t.TransactionID;
GO

SET SHOWPLAN_XML ON;
GO
SELECT TOP (5)
    t.TransactionID,
    t.CustomerID,
    dbo.udf_GetCustomerTier(t.CustomerID) AS CustomerTier
FROM dbo.Lab_Transactions AS t
ORDER BY t.TransactionID;
GO
SET SHOWPLAN_XML OFF;
GO

-- ============================================================================
-- 3. Non-inlineable UDF: expected default rejection, then INLINE = AUTO
-- ============================================================================
DROP FUNCTION IF EXISTS dbo.udf_CountCustomerOrderBatches;
GO

-- Dynamic SQL keeps the complete script running after the expected error.
-- The walkthrough shows the same CREATE FUNCTION statement directly.
BEGIN TRY
    EXEC
    (
        'CREATE FUNCTION dbo.udf_CountCustomerOrderBatches
        (
            @CustomerID INT,
            @BatchSize INT
        )
        RETURNS INT
        AS
        BEGIN
            DECLARE @OrderCount INT = 0;
            DECLARE @BatchCount INT = 0;

            SELECT @OrderCount = COUNT(*)
            FROM dbo.Lab_Transactions
            WHERE CustomerID = @CustomerID;

            WHILE @BatchSize > 0
                AND @OrderCount >= @BatchSize
            BEGIN
                SET @OrderCount = @OrderCount - @BatchSize;
                SET @BatchCount = @BatchCount + 1;
            END;

            RETURN @BatchCount;
        END;'
    );

    THROW 50000, 'Expected CREATE FUNCTION to reject the non-inlineable definition.', 1;
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 19841
    BEGIN
        SELECT
            ERROR_NUMBER() AS ExpectedErrorNumber,
            ERROR_MESSAGE() AS ExpectedErrorMessage;
    END
    ELSE
    BEGIN
        THROW;
    END;
END CATCH;
GO

CREATE OR ALTER FUNCTION dbo.udf_CountCustomerOrderBatches
(
    @CustomerID INT,
    @BatchSize INT
)
RETURNS INT
WITH INLINE = AUTO
AS
BEGIN
    DECLARE @OrderCount INT = 0;
    DECLARE @BatchCount INT = 0;

    SELECT @OrderCount = COUNT(*)
    FROM dbo.Lab_Transactions
    WHERE CustomerID = @CustomerID;

    WHILE @BatchSize > 0
        AND @OrderCount >= @BatchSize
    BEGIN
        SET @OrderCount = @OrderCount - @BatchSize;
        SET @BatchCount = @BatchCount + 1;
    END;

    RETURN @BatchCount;
END;
GO

SELECT
    o.name AS FunctionName,
    m.is_inlineable,
    m.inline_eligibility_mask
FROM sys.objects AS o
INNER JOIN sys.sql_modules AS m
    ON o.object_id = m.object_id
WHERE o.name = 'udf_CountCustomerOrderBatches';
GO

DECLARE @BatchCount INT;
SET @BatchCount = dbo.udf_CountCustomerOrderBatches(1, 10);
SELECT @BatchCount AS CustomerOrderBatches;
GO

-- Unsupported: INLINE = AUTO doesn't make the UDF inlineable.
-- SELECT
--     c.CustomerID,
--     dbo.udf_CountCustomerOrderBatches(c.CustomerID, 10)
-- FROM dbo.Lab_Customers AS c;
