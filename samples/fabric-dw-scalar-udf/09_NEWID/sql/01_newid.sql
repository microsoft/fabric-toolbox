-- ============================================================================
-- Lab 09: NEWID() in scalar UDFs
-- ============================================================================

-- Step 1: Create a UDF with one NEWID() expression.
CREATE OR ALTER FUNCTION dbo.udf_GenerateRunId()
RETURNS UNIQUEIDENTIFIER
AS
BEGIN
    RETURN NEWID();
END;
GO

-- Step 2: Create a UDF with two NEWID() expressions.
CREATE OR ALTER FUNCTION dbo.udf_NewIdPairIsDistinct()
RETURNS BIT
AS
BEGIN
    DECLARE @firstId UNIQUEIDENTIFIER = NEWID();
    DECLARE @secondId UNIQUEIDENTIFIER = NEWID();

    RETURN
        CASE
            WHEN @firstId <> @secondId THEN 1
            ELSE 0
        END;
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
    OBJECT_ID('dbo.udf_GenerateRunId'),
    OBJECT_ID('dbo.udf_NewIdPairIsDistinct')
)
ORDER BY
    o.name;
GO

-- Step 4: Generate identifiers across all transaction rows.
DROP TABLE IF EXISTS dbo.Lab_NewIdResults;
GO

CREATE TABLE dbo.Lab_NewIdResults
(
    TransactionID INT NOT NULL,
    ProductID INT NOT NULL,
    RunId1 UNIQUEIDENTIFIER NOT NULL,
    RunId2 UNIQUEIDENTIFIER NOT NULL,
    InternalPairIsDistinct BIT NOT NULL
);
GO

INSERT INTO dbo.Lab_NewIdResults
(
    TransactionID,
    ProductID,
    RunId1,
    RunId2,
    InternalPairIsDistinct
)
SELECT
    t.TransactionID,
    t.ProductID,
    dbo.udf_GenerateRunId(),
    dbo.udf_GenerateRunId(),
    dbo.udf_NewIdPairIsDistinct()
FROM dbo.Lab_Transactions AS t;
GO

-- Step 5: Analyze the generated identifiers by product.
SELECT
    ProductID,
    COUNT(*) AS TransactionCount,
    COUNT(DISTINCT RunId1) AS DistinctRunId1Count,
    COUNT(DISTINCT RunId2) AS DistinctRunId2Count,
    SUM(
        CASE
            WHEN RunId1 = RunId2 THEN 1
            ELSE 0
        END
    ) AS SameRowCollisions,
    MIN(CAST(InternalPairIsDistinct AS INT))
        AS EveryInternalPairIsDistinct
FROM dbo.Lab_NewIdResults
GROUP BY
    ProductID
ORDER BY
    ProductID;
GO
