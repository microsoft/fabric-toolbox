-- ============================================================================
-- Lab 07: Inlineability diagnostics, error messages, and INLINE = AUTO
-- Prerequisites:
--   00_Source/sql/01_setup_tables.sql
-- ============================================================================

-- ============================================================================
-- 1. Inlineable baseline: WHILE logic eligible for Expression Block inlining
-- ============================================================================
CREATE OR ALTER FUNCTION dbo.udf_DiagnosticOrderBatches
(
    @OrderCount INT,
    @BatchSize INT
)
RETURNS INT
AS
BEGIN
    IF @BatchSize <= 0
        RETURN NULL;

    DECLARE @RemainingOrders INT = @OrderCount;
    DECLARE @BatchCount INT = 0;

    WHILE @RemainingOrders >= @BatchSize
    BEGIN
        SET @RemainingOrders = @RemainingOrders - @BatchSize;
        SET @BatchCount = @BatchCount + 1;
    END;

    RETURN @BatchCount;
END;
GO

DECLARE @Inlineable BIT;
DECLARE @EligibilityMask INT;

SELECT
    @Inlineable = m.is_inlineable,
    @EligibilityMask = m.inline_eligibility_mask
FROM sys.objects AS o
INNER JOIN sys.sql_modules AS m
    ON o.object_id = m.object_id
WHERE o.name = 'udf_DiagnosticOrderBatches';

IF @Inlineable IS NULL
    OR @EligibilityMask IS NULL
    OR @Inlineable <> 1
    OR @EligibilityMask <> 2
    THROW 50001, 'Baseline diagnostic UDF must be inlineable with mask 2.', 1;

SELECT
    c.CustomerID,
    dbo.udf_DiagnosticOrderBatches(c.CustomerID, 10) AS CompleteBatches
FROM dbo.Lab_Customers AS c
WHERE c.CustomerID IN (10, 25, 55)
ORDER BY c.CustomerID;

DROP TABLE IF EXISTS #BaselineResults;

CREATE TABLE #BaselineResults
(
    CustomerID INT NOT NULL,
    CompleteBatches INT NULL
)
WITH (DISTRIBUTION = ROUND_ROBIN);

INSERT INTO #BaselineResults
SELECT
    c.CustomerID,
    dbo.udf_DiagnosticOrderBatches(c.CustomerID, 10)
FROM dbo.Lab_Customers AS c
WHERE c.CustomerID IN (10, 25, 55);

DECLARE @BaselineRowCount INT;
DECLARE @BaselineMatchCount INT;

SELECT
    @BaselineRowCount = COUNT(*),
    @BaselineMatchCount = SUM
    (
        CASE
            WHEN CustomerID = 10 AND CompleteBatches = 1 THEN 1
            WHEN CustomerID = 25 AND CompleteBatches = 2 THEN 1
            WHEN CustomerID = 55 AND CompleteBatches = 5 THEN 1
            ELSE 0
        END
    )
FROM #BaselineResults;

IF @BaselineRowCount <> 3
    OR @BaselineMatchCount IS NULL
    OR @BaselineMatchCount <> 3
    THROW 50009, 'Baseline distributed results do not match the expected values.', 1;

SELECT
    'Baseline definition' AS DiagnosticStage,
    @Inlineable AS is_inlineable,
    @EligibilityMask AS inline_eligibility_mask,
    @BaselineRowCount AS ValidatedRows;

DROP TABLE IF EXISTS #BaselineResults;
GO

-- ============================================================================
-- 2. Expected DDL rejection: table access combined with WHILE
--    The previous inlineable definition must remain unchanged.
-- ============================================================================
BEGIN TRY
    EXEC
    (
        'ALTER FUNCTION dbo.udf_DiagnosticOrderBatches
        (
            @CustomerID INT,
            @BatchSize INT
        )
        RETURNS INT
        AS
        BEGIN
            IF @BatchSize <= 0
                RETURN NULL;

            DECLARE @OrderCount INT = 0;
            DECLARE @BatchCount INT = 0;

            SELECT @OrderCount = COUNT(*)
            FROM dbo.Lab_Transactions
            WHERE CustomerID = @CustomerID;

            WHILE @OrderCount >= @BatchSize
            BEGIN
                SET @OrderCount = @OrderCount - @BatchSize;
                SET @BatchCount = @BatchCount + 1;
            END;

            RETURN @BatchCount;
        END;'
    );

    THROW 50002, 'Expected ALTER FUNCTION to reject the non-inlineable definition.', 1;
END TRY
BEGIN CATCH
    DECLARE @AlterErrorNumber INT = ERROR_NUMBER();
    DECLARE @AlterErrorMessage VARCHAR(4000) = ERROR_MESSAGE();

    IF @AlterErrorNumber IS NULL OR @AlterErrorNumber <> 19841
        THROW;

    IF @AlterErrorMessage IS NULL
        OR @AlterErrorMessage NOT LIKE '%Expression block%'
        OR @AlterErrorMessage NOT LIKE '%Scalar UDF inlining%'
        OR @AlterErrorMessage NOT LIKE '%INLINE = AUTO%'
        OR @AlterErrorMessage NOT LIKE '%rewrite UDF%'
        THROW 50010, 'Error 19841 no longer provides the expected recovery guidance.', 1;

    SELECT
        'Expected ALTER rejection' AS DiagnosticStage,
        @AlterErrorNumber AS ErrorNumber,
        @AlterErrorMessage AS ErrorMessage;
END CATCH;
GO

DECLARE @InlineableAfterFailedAlter BIT;
DECLARE @MaskAfterFailedAlter INT;
DECLARE @DefinitionAfterFailedAlter VARCHAR(MAX);
DECLARE @PreservedResult INT;

SELECT
    @InlineableAfterFailedAlter = m.is_inlineable,
    @MaskAfterFailedAlter = m.inline_eligibility_mask,
    @DefinitionAfterFailedAlter = m.definition
FROM sys.objects AS o
INNER JOIN sys.sql_modules AS m
    ON o.object_id = m.object_id
WHERE o.name = 'udf_DiagnosticOrderBatches';

IF @InlineableAfterFailedAlter IS NULL
    OR @MaskAfterFailedAlter IS NULL
    OR @InlineableAfterFailedAlter <> 1
    OR @MaskAfterFailedAlter <> 2
    THROW 50003, 'A failed ALTER unexpectedly replaced the prior inlineable definition.', 1;

SET @PreservedResult = dbo.udf_DiagnosticOrderBatches(25, 10);

IF @PreservedResult IS NULL
    OR @DefinitionAfterFailedAlter IS NULL
    OR @PreservedResult <> 2
    OR @DefinitionAfterFailedAlter NOT LIKE '%@OrderCount%'
    OR @DefinitionAfterFailedAlter LIKE '%Lab_Transactions%'
    THROW 50011, 'A failed ALTER did not preserve the original function behavior.', 1;

SELECT
    'Definition preserved after failed ALTER' AS DiagnosticStage,
    @InlineableAfterFailedAlter AS is_inlineable,
    @MaskAfterFailedAlter AS inline_eligibility_mask,
    @PreservedResult AS PreservedResult;
GO

-- ============================================================================
-- 3. Catalog the non-inlineable definition with INLINE = AUTO
-- ============================================================================
ALTER FUNCTION dbo.udf_DiagnosticOrderBatches
(
    @CustomerID INT,
    @BatchSize INT
)
RETURNS INT
WITH INLINE = AUTO
AS
BEGIN
    IF @BatchSize <= 0
        RETURN NULL;

    DECLARE @OrderCount INT = 0;
    DECLARE @BatchCount INT = 0;

    SELECT @OrderCount = COUNT(*)
    FROM dbo.Lab_Transactions
    WHERE CustomerID = @CustomerID;

    WHILE @OrderCount >= @BatchSize
    BEGIN
        SET @OrderCount = @OrderCount - @BatchSize;
        SET @BatchCount = @BatchCount + 1;
    END;

    RETURN @BatchCount;
END;
GO

DECLARE @AutoInlineable BIT;
DECLARE @AutoMask INT;

SELECT
    @AutoInlineable = m.is_inlineable,
    @AutoMask = m.inline_eligibility_mask
FROM sys.objects AS o
INNER JOIN sys.sql_modules AS m
    ON o.object_id = m.object_id
WHERE o.name = 'udf_DiagnosticOrderBatches';

IF @AutoInlineable IS NULL
    OR @AutoMask IS NULL
    OR @AutoInlineable <> 0
    OR @AutoMask <> 0
    THROW 50004, 'INLINE = AUTO definition must remain non-inlineable with mask 0.', 1;

SELECT
    'Cataloged with INLINE = AUTO' AS DiagnosticStage,
    @AutoInlineable AS is_inlineable,
    @AutoMask AS inline_eligibility_mask;
GO

-- Supported standalone use.
DECLARE @CustomerOrderCount INT;
DECLARE @StandaloneBatchCount INT;

SELECT @CustomerOrderCount = COUNT(*)
FROM dbo.Lab_Transactions
WHERE CustomerID = 1;

IF @CustomerOrderCount <= 0
    THROW 50015, 'Customer 1 must have at least one transaction.', 1;

SET @StandaloneBatchCount =
    dbo.udf_DiagnosticOrderBatches(1, @CustomerOrderCount);

IF @StandaloneBatchCount IS NULL OR @StandaloneBatchCount <> 1
    THROW 50005, 'Unexpected standalone result for the INLINE = AUTO function.', 1;

SELECT
    'Standalone INLINE = AUTO call' AS DiagnosticStage,
    @CustomerOrderCount AS CustomerOrderCount,
    @CustomerOrderCount AS BatchSize,
    @StandaloneBatchCount AS CustomerOrderBatches,
    1 AS Expected;
GO

-- Expected distributed-query rejection.
BEGIN TRY
    EXEC
    (
        'SELECT TOP (5)
            c.CustomerID,
            dbo.udf_DiagnosticOrderBatches(c.CustomerID, 10) AS CustomerOrderBatches
        FROM dbo.Lab_Customers AS c
        ORDER BY c.CustomerID;'
    );

    THROW 50006, 'Expected the distributed call of a non-inlineable UDF to fail.', 1;
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 50006
        THROW;

    IF ERROR_NUMBER() <> 19835
        OR ERROR_MESSAGE() NOT LIKE '%Scalar UDF execution is currently unavailable%'
        THROW;

    SELECT
        'Expected distributed-query rejection' AS DiagnosticStage,
        ERROR_NUMBER() AS ErrorNumber,
        ERROR_MESSAGE() AS ErrorMessage;
END CATCH;
GO

-- ============================================================================
-- 4. The data-access definition is inlineable, but the CTE calling shape is
--    unsupported for scalar UDF inlining.
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

DECLARE @TierMask INT;

SELECT @TierMask = m.inline_eligibility_mask
FROM sys.objects AS o
INNER JOIN sys.sql_modules AS m
    ON o.object_id = m.object_id
WHERE o.name = 'udf_GetCustomerTier';

IF @TierMask IS NULL OR @TierMask <> 1
    THROW 50012, 'The data-access comparison UDF must have mask 1.', 1;

SELECT TOP (3)
    t.TransactionID,
    t.CustomerID,
    dbo.udf_GetCustomerTier(t.CustomerID) AS CustomerTier
FROM dbo.Lab_Transactions AS t
ORDER BY t.TransactionID;

DROP TABLE IF EXISTS #DirectTierResults;

CREATE TABLE #DirectTierResults
(
    TransactionID INT NOT NULL,
    CustomerID INT NOT NULL,
    CustomerTier VARCHAR(20) NULL
)
WITH (DISTRIBUTION = ROUND_ROBIN);

INSERT INTO #DirectTierResults
SELECT TOP (3)
    t.TransactionID,
    t.CustomerID,
    dbo.udf_GetCustomerTier(t.CustomerID)
FROM dbo.Lab_Transactions AS t
ORDER BY t.TransactionID;

DECLARE @TierRowCount INT;
DECLARE @TierMatchCount INT;

SELECT
    @TierRowCount = COUNT(*),
    @TierMatchCount = SUM
    (
        CASE
            WHEN TransactionID = 1 AND CustomerID = 1 AND CustomerTier = 'Silver' THEN 1
            WHEN TransactionID = 2 AND CustomerID = 2 AND CustomerTier = 'Bronze' THEN 1
            WHEN TransactionID = 3 AND CustomerID = 3 AND CustomerTier = 'Gold' THEN 1
            ELSE 0
        END
    )
FROM #DirectTierResults;

IF @TierRowCount <> 3
    OR @TierMatchCount IS NULL
    OR @TierMatchCount <> 3
    THROW 50013, 'The direct mask 1 query did not return the expected tiers.', 1;

SELECT
    'Supported direct mask 1 query' AS DiagnosticStage,
    @TierMask AS inline_eligibility_mask,
    @TierRowCount AS ValidatedRows;

DROP TABLE IF EXISTS #DirectTierResults;
GO

BEGIN TRY
    EXEC
    (
        'WITH recent_transactions AS
        (
            SELECT TOP (20)
                t.TransactionID,
                t.CustomerID
            FROM dbo.Lab_Transactions AS t
            ORDER BY t.TransactionID
        )
        SELECT
            rt.TransactionID,
            dbo.udf_GetCustomerTier(rt.CustomerID) AS CustomerTier
        FROM recent_transactions AS rt;'
    );

    THROW 50007, 'Expected the scalar-UDF-inlining CTE query to fail.', 1;
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 50007
        THROW;

    IF ERROR_NUMBER() <> 19835
        OR ERROR_MESSAGE() NOT LIKE '%Scalar UDF execution is currently unavailable%'
        THROW;

    SELECT
        'Expected CTE calling-query rejection' AS DiagnosticStage,
        ERROR_NUMBER() AS ErrorNumber,
        ERROR_MESSAGE() AS ErrorMessage;
END CATCH;
GO

-- ============================================================================
-- 5. Rewrite the unsupported CTE shape by materializing the UDF result.
-- ============================================================================
DROP TABLE IF EXISTS #RecentTransactionTiers;
GO

CREATE TABLE #RecentTransactionTiers
(
    TransactionID INT NOT NULL,
    CustomerID INT NOT NULL,
    CustomerTier VARCHAR(20) NOT NULL
)
WITH (DISTRIBUTION = ROUND_ROBIN);
GO

INSERT INTO #RecentTransactionTiers
(
    TransactionID,
    CustomerID,
    CustomerTier
)
SELECT TOP (20)
    t.TransactionID,
    t.CustomerID,
    dbo.udf_GetCustomerTier(t.CustomerID)
FROM dbo.Lab_Transactions AS t
ORDER BY t.TransactionID;
GO

DECLARE @MaterializedRowCount INT;
DECLARE @MaterializedTier1 VARCHAR(20);
DECLARE @MaterializedTier2 VARCHAR(20);
DECLARE @MaterializedTier3 VARCHAR(20);

SELECT @MaterializedRowCount = COUNT(*)
FROM #RecentTransactionTiers;

SELECT @MaterializedTier1 = CustomerTier
FROM #RecentTransactionTiers
WHERE TransactionID = 1;

SELECT @MaterializedTier2 = CustomerTier
FROM #RecentTransactionTiers
WHERE TransactionID = 2;

SELECT @MaterializedTier3 = CustomerTier
FROM #RecentTransactionTiers
WHERE TransactionID = 3;

IF @MaterializedRowCount <> 20
    OR @MaterializedTier1 IS NULL
    OR @MaterializedTier2 IS NULL
    OR @MaterializedTier3 IS NULL
    OR @MaterializedTier1 <> 'Silver'
    OR @MaterializedTier2 <> 'Bronze'
    OR @MaterializedTier3 <> 'Gold'
    THROW 50008, 'The temporary-table query rewrite returned unexpected results.', 1;

SELECT
    'Supported temporary-table query rewrite' AS DiagnosticStage,
    @MaterializedRowCount AS MaterializedRowCount,
    @MaterializedTier1 AS Customer1Tier,
    @MaterializedTier2 AS Customer2Tier,
    @MaterializedTier3 AS Customer3Tier;
GO

DROP TABLE IF EXISTS #RecentTransactionTiers;
GO

-- ============================================================================
-- 6. A query that calls mask 2 and mask 1 functions must satisfy the mask 1
--    Scalar UDF inlining requirements.
-- ============================================================================
CREATE OR ALTER FUNCTION dbo.udf_DiagnosticOrderBatches
(
    @OrderCount INT,
    @BatchSize INT
)
RETURNS INT
AS
BEGIN
    IF @BatchSize <= 0
        RETURN NULL;

    DECLARE @RemainingOrders INT = @OrderCount;
    DECLARE @BatchCount INT = 0;

    WHILE @RemainingOrders >= @BatchSize
    BEGIN
        SET @RemainingOrders = @RemainingOrders - @BatchSize;
        SET @BatchCount = @BatchCount + 1;
    END;

    RETURN @BatchCount;
END;
GO

DECLARE @MixedMask2 INT;
DECLARE @MixedMask1 INT;

SELECT @MixedMask2 = m.inline_eligibility_mask
FROM sys.objects AS o
INNER JOIN sys.sql_modules AS m
    ON o.object_id = m.object_id
WHERE o.name = 'udf_DiagnosticOrderBatches';

SELECT @MixedMask1 = m.inline_eligibility_mask
FROM sys.objects AS o
INNER JOIN sys.sql_modules AS m
    ON o.object_id = m.object_id
WHERE o.name = 'udf_GetCustomerTier';

IF @MixedMask2 IS NULL
    OR @MixedMask1 IS NULL
    OR @MixedMask2 <> 2
    OR @MixedMask1 <> 1
    THROW 50014, 'The mixed query scenario requires one mask 2 and one mask 1 function.', 1;
GO

SELECT TOP (3)
    t.TransactionID,
    dbo.udf_DiagnosticOrderBatches(t.TransactionID, 10) AS CompleteBatches,
    dbo.udf_GetCustomerTier(t.CustomerID) AS CustomerTier
FROM dbo.Lab_Transactions AS t
ORDER BY t.TransactionID;

DROP TABLE IF EXISTS #MixedDirectResults;

CREATE TABLE #MixedDirectResults
(
    TransactionID INT NOT NULL,
    CompleteBatches INT NULL,
    CustomerTier VARCHAR(20) NULL
)
WITH (DISTRIBUTION = ROUND_ROBIN);

INSERT INTO #MixedDirectResults
SELECT TOP (3)
    t.TransactionID,
    dbo.udf_DiagnosticOrderBatches(t.TransactionID, 10),
    dbo.udf_GetCustomerTier(t.CustomerID)
FROM dbo.Lab_Transactions AS t
ORDER BY t.TransactionID;

DECLARE @MixedRowCount INT;
DECLARE @MixedMatchCount INT;

SELECT
    @MixedRowCount = COUNT(*),
    @MixedMatchCount = SUM
    (
        CASE
            WHEN TransactionID = 1 AND CompleteBatches = 0 AND CustomerTier = 'Silver' THEN 1
            WHEN TransactionID = 2 AND CompleteBatches = 0 AND CustomerTier = 'Bronze' THEN 1
            WHEN TransactionID = 3 AND CompleteBatches = 0 AND CustomerTier = 'Gold' THEN 1
            ELSE 0
        END
    )
FROM #MixedDirectResults;

IF @MixedRowCount <> 3
    OR @MixedMatchCount IS NULL
    OR @MixedMatchCount <> 3
    THROW 50016, 'The supported mixed direct query returned unexpected results.', 1;

SELECT
    'Supported mixed direct query' AS DiagnosticStage,
    @MixedRowCount AS ValidatedRows;

DROP TABLE IF EXISTS #MixedDirectResults;
GO

BEGIN TRY
    EXEC
    (
        'WITH recent_transactions AS
        (
            SELECT TOP (20)
                t.TransactionID,
                t.CustomerID
            FROM dbo.Lab_Transactions AS t
            ORDER BY t.TransactionID
        )
        SELECT
            rt.TransactionID,
            dbo.udf_DiagnosticOrderBatches(rt.TransactionID, 10) AS CompleteBatches,
            dbo.udf_GetCustomerTier(rt.CustomerID) AS CustomerTier
        FROM recent_transactions AS rt;'
    );

    THROW 50017, 'Expected the mixed CTE query to fail because it includes a mask 1 function.', 1;
END TRY
BEGIN CATCH
    IF ERROR_NUMBER() = 50017
        THROW;

    IF ERROR_NUMBER() <> 19835
        OR ERROR_MESSAGE() NOT LIKE '%Scalar UDF execution is currently unavailable%'
        THROW;

    SELECT
        'Expected mixed-query CTE rejection' AS DiagnosticStage,
        ERROR_NUMBER() AS ErrorNumber,
        ERROR_MESSAGE() AS ErrorMessage;
END CATCH;
GO
