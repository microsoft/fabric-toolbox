# Multi-Phase Risk Assessment with Multiple Returns

This capstone first derives customer metrics with a CTE, then passes those
metrics to a UDF that combines:

- Guard-clause returns for invalid data.
- Nested returns for new-customer routing.
- Two iterative scoring phases using `WHILE`.
- Nested spend and transaction-frequency decisions.
- Twelve possible exit points across the complete function.

```sql
CREATE OR ALTER FUNCTION dbo.udf_ReturnCreditRiskScore(
    @customerId INT,
    @transactionCount INT,
    @totalSpend DECIMAL(12,2),
    @avgTransactionValue DECIMAL(10,2),
    @daysSinceLastPurchase INT,
    @customerTier VARCHAR(20)
)
RETURNS VARCHAR(120)
AS
BEGIN
    -- Phase 1: Input Validation
    IF @customerId IS NULL OR @customerId <= 0
        RETURN 'ERROR: Invalid customer ID';
    IF @transactionCount < 0 OR @totalSpend < 0
        RETURN 'ERROR: Invalid transaction data';

    -- Phase 2: New Customer Check
    IF @transactionCount = 0
    BEGIN
        IF @customerTier = 'Platinum'
            RETURN 'NEW-PREMIUM: VIP fast-track, Risk=LOW';
        IF @customerTier = 'Gold'
            RETURN 'NEW-GOLD: Expedited review, Risk=LOW-MED';
        RETURN 'NEW-STANDARD: Full verification required, Risk=UNKNOWN';
    END

    -- Phase 3: Calculate Base Risk Score
    DECLARE @riskScore INT = 50;
    DECLARE @iteration INT = 1;

    IF @customerTier = 'Platinum' SET @riskScore = @riskScore - 20;
    ELSE IF @customerTier = 'Gold' SET @riskScore = @riskScore - 10;
    ELSE IF @customerTier = 'Bronze' SET @riskScore = @riskScore + 10;

    -- Transaction frequency scoring
    DECLARE @frequencyThreshold INT = 5;
    WHILE @iteration <= 5
    BEGIN
        IF @transactionCount >= @frequencyThreshold * @iteration
        BEGIN
            SET @riskScore = @riskScore - 3;
            IF @riskScore <= 15 AND @totalSpend > 10000
                RETURN 'EXCELLENT: Score=' + CAST(@riskScore AS VARCHAR(5)) +
                       ', TxnCount=' + CAST(@transactionCount AS VARCHAR(10)) + ', Risk=MINIMAL';
        END
        SET @iteration = @iteration + 1;
    END

    -- Phase 4: Spend Analysis
    IF @totalSpend > 0
    BEGIN
        IF @avgTransactionValue > 500
        BEGIN
            IF @transactionCount > 10
            BEGIN
                SET @riskScore = @riskScore - 15;
                IF @riskScore < 15
                    RETURN 'HIGH-VALUE: Score=' + CAST(@riskScore AS VARCHAR(5)) +
                           ', AvgTxn=$' + CAST(CAST(@avgTransactionValue AS INT) AS VARCHAR(10)) + ', Risk=LOW';
            END
            ELSE
                SET @riskScore = @riskScore + 5;
        END
        ELSE IF @avgTransactionValue < 50 AND @transactionCount > 50
            SET @riskScore = @riskScore - 5;
    END
    ELSE
        SET @riskScore = @riskScore + 20;

    -- Phase 5: Recency Check
    DECLARE @recencyPenalty INT = 0;
    DECLARE @dayCheck INT = 30;

    WHILE @dayCheck <= 180
    BEGIN
        IF @daysSinceLastPurchase > @dayCheck
            SET @recencyPenalty = @recencyPenalty + 5;
        ELSE
        BEGIN
            IF @daysSinceLastPurchase <= 7
                SET @riskScore = @riskScore - 5;
            SET @dayCheck = 999;
        END
        SET @dayCheck = @dayCheck + 30;
    END

    SET @riskScore = @riskScore + @recencyPenalty;

    -- Phase 6: Final Classification
    IF @riskScore > 80
        RETURN 'DECLINE: Score=' + CAST(@riskScore AS VARCHAR(5)) + ', Risk=CRITICAL';
    IF @riskScore > 60
        RETURN 'REVIEW: Score=' + CAST(@riskScore AS VARCHAR(5)) + ', Risk=HIGH';
    IF @riskScore > 40
        RETURN 'CONDITIONAL: Score=' + CAST(@riskScore AS VARCHAR(5)) + ', Risk=MEDIUM';
    IF @riskScore > 20
        RETURN 'APPROVE: Score=' + CAST(@riskScore AS VARCHAR(5)) + ', Risk=LOW';

    RETURN 'FAST-TRACK: Score=' + CAST(@riskScore AS VARCHAR(5)) + ', Risk=MINIMAL';
END;
GO
```

The function can exit during validation, new-customer routing, frequency
scoring, high-value analysis, or final classification. This demonstrates that
multiple `RETURN` statements can be distributed throughout nested and
iterative procedural logic.

The UDF operates on the result of a warehouse aggregation:

```sql
WITH CustomerMetrics AS
(
    SELECT
        c.CustomerID,
        c.CustomerName,
        c.CustomerTier,
        c.TotalSpend,
        COUNT(t.TransactionID) AS TransactionCount,
        ISNULL(AVG(t.UnitPrice * t.Quantity), 0) AS AverageTransactionValue,
        ISNULL(
            DATEDIFF(DAY, MAX(t.TransactionDate), GETDATE()),
            365
        ) AS DaysSinceLastPurchase
    FROM dbo.Lab_Customers AS c
    LEFT JOIN dbo.Lab_Transactions AS t
        ON c.CustomerID = t.CustomerID
    GROUP BY c.CustomerID, c.CustomerName, c.CustomerTier, c.TotalSpend
)
SELECT
    CustomerID,
    CustomerName,
    CustomerTier,
    TransactionCount,
    TotalSpend,
    AverageTransactionValue,
    DaysSinceLastPurchase,
    dbo.udf_ReturnCreditRiskScore(
        CustomerID,
        TransactionCount,
        TotalSpend,
        AverageTransactionValue,
        DaysSinceLastPurchase,
        CustomerTier
    ) AS RiskAssessment
FROM CustomerMetrics
ORDER BY CustomerID;
```

➡️ Continue to
[Scalar UDF Inlining](../03_ScalarUDFInlining/00_ReadMe.md).
