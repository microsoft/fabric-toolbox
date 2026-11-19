# Lab 07: Inlineability Diagnostics

⏱️ **Estimated time:** 12 minutes

**Inlining coverage:** Both inlining techniques and non-inlineable diagnostics

> **Prerequisite:** Run
> [`../00_Source/sql/01_setup_tables.sql`](../00_Source/sql/01_setup_tables.sql)
> first. If these concepts are new to you, review
> [Lab 01: Inlining Fundamentals](../01_InliningFundamentals/00_ReadMe.md).

## Learning Objective

Learn how to find why a scalar UDF fails, choose the right fix, and confirm that the function
works.

## Mental Model

Start with the inlining technique:

| Mask | Technique | Mental model for this lab |
|---:|---|---|
| `2` | Inlining via Expression Block | **Use UDF.** |
| `1` | Scalar UDF inlining | The definition is inlineable, but documented calling-query restrictions apply. |
| `3` | Either technique | **Use UDF.** |
| `0` | Neither technique | Distributed table queries aren't supported. `INLINE = AUTO` is for deliberate standalone use. |

For this troubleshooting guide, expect a UDF using inlining via Expression Block to work throughout
Warehouse queries. Exotic Expression Block gaps are outside this lab's scope. The CTE restriction
demonstrated later applies to **Scalar UDF inlining**, not to Expression Block.

Use these questions:

1. Which inlining technique is available?
2. If the mask is `1`, does the calling query use a Scalar UDF inlining-compatible shape?
3. If the mask is `0`, should the function be rewritten or kept for standalone use with
   `INLINE = AUTO`?

> **Latest capabilities:** For the latest feature capabilities and supported scenarios, see the
> official [CREATE FUNCTION documentation](https://learn.microsoft.com/sql/t-sql/statements/create-function-sql-data-warehouse?view=fabric&preserve-view=true).

## How to Run the Lab

- **Human:** Follow the numbered sections in this guide. Run each SQL block separately and compare
  what you see with the expected result.
- **Agent or automated test:** Run the complete script. Assertions stop the run if behavior
  changes, and the final result set provides one pass summary.

## Contents

| File | Purpose |
|---|---|
| [`sql/01_inlineability_diagnostics.sql`](sql/01_inlineability_diagnostics.sql) | Automated version with assertions and expected-failure handling |
| [`sql/99_cleanup.sql`](sql/99_cleanup.sql) | Remove the lab-exclusive diagnostic UDF and temporary rewrite table |

## Manual Lab

### 1. Establish the Expression Block baseline

Create a UDF that is eligible for inlining via Expression Block. It uses a `WHILE` loop, but it
doesn't read a table.

```sql
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
```

Check its inlineability metadata:

```sql
SELECT
    o.name AS FunctionName,
    m.is_inlineable,
    m.inline_eligibility_mask
FROM sys.objects AS o
INNER JOIN sys.sql_modules AS m
    ON o.object_id = m.object_id
WHERE o.name = 'udf_DiagnosticOrderBatches';
GO
```

Expected result:

```text
is_inlineable = 1
inline_eligibility_mask = 2
```

Mask `2` means the function can use inlining via Expression Block.

For this lab, mask `2` is the straightforward case: use the UDF where you need it in Warehouse
queries.

Confirm that it works over Warehouse data:

```sql
SELECT
    c.CustomerID,
    dbo.udf_DiagnosticOrderBatches(c.CustomerID, 10) AS CompleteBatches
FROM dbo.Lab_Customers AS c
WHERE c.CustomerID IN (10, 25, 55)
ORDER BY c.CustomerID;
GO
```

Expected results:

| CustomerID | CompleteBatches |
|---:|---:|
| 10 | 1 |
| 25 | 2 |
| 55 | 5 |

### 2. Create a definition that neither technique can process

Now change the function so it reads `Lab_Transactions` and uses a `WHILE` loop:

```sql
ALTER FUNCTION dbo.udf_DiagnosticOrderBatches
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
END;
GO
```

Expected result: error `19841`.

The error should explain both problems:

- inlining via Expression Block doesn't support the table query;
- Scalar UDF inlining doesn't support the `WHILE` loop.

The original mask `2` function is still valid. The altered body combines constructs that leave no
available technique: table access takes it outside Expression Block eligibility, while `WHILE`
takes it outside Scalar UDF inlining eligibility.

It should offer two choices: rewrite the function for use over data, or use `INLINE = AUTO` for
limited standalone execution.

The failed `ALTER FUNCTION` must not replace the working definition. Verify that the function
still has mask `2` and still returns the original result:

```sql
SELECT
    o.name AS FunctionName,
    m.is_inlineable,
    m.inline_eligibility_mask
FROM sys.objects AS o
INNER JOIN sys.sql_modules AS m
    ON o.object_id = m.object_id
WHERE o.name = 'udf_DiagnosticOrderBatches';

DECLARE @PreservedResult INT;
SET @PreservedResult = dbo.udf_DiagnosticOrderBatches(25, 10);

SELECT @PreservedResult AS PreservedResult;
GO
```

Expected result: mask `2` and `PreservedResult = 2`.

### 3. Understand mask `0`: standalone only

Apply the incompatible definition again, this time with `INLINE = AUTO`:

```sql
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
```

Check the metadata:

```sql
SELECT
    o.name AS FunctionName,
    m.is_inlineable,
    m.inline_eligibility_mask
FROM sys.objects AS o
INNER JOIN sys.sql_modules AS m
    ON o.object_id = m.object_id
WHERE o.name = 'udf_DiagnosticOrderBatches';
GO
```

Expected result: `is_inlineable = 0` and mask `0`.

`INLINE = AUTO` allowed the definition to be saved. It didn't make the function inlineable.

Run a standalone call:

```sql
DECLARE @CustomerOrderCount INT;
DECLARE @StandaloneBatchCount INT;

SELECT @CustomerOrderCount = COUNT(*)
FROM dbo.Lab_Transactions
WHERE CustomerID = 1;

SET @StandaloneBatchCount =
    dbo.udf_DiagnosticOrderBatches(1, @CustomerOrderCount);

SELECT
    @CustomerOrderCount AS CustomerOrderCount,
    @CustomerOrderCount AS BatchSize,
    @StandaloneBatchCount AS CustomerOrderBatches;
GO
```

Expected result: `CustomerOrderBatches = 1`.

The shared setup supports different transaction scales, so the number of orders for customer 1
can vary. Using that customer's complete order count as the batch size keeps this result
deterministic at every supported scale.

Now call the same mask `0` function over a user table:

```sql
SELECT TOP (5)
    c.CustomerID,
    dbo.udf_DiagnosticOrderBatches(c.CustomerID, 10) AS CustomerOrderBatches
FROM dbo.Lab_Customers AS c
ORDER BY c.CustomerID;
GO
```

Expected result: error `19835`, because a non-inlineable UDF can't run once per Warehouse row.

### 4. Diagnose a Scalar UDF inlining calling-query restriction

This section applies to mask `1`, not mask `2`. The function definition is valid, but Scalar UDF
inlining supports a narrower set of calling-query shapes than Expression Block.

Create a data-access UDF:

```sql
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
```

Check its mask:

```sql
SELECT
    o.name AS FunctionName,
    m.is_inlineable,
    m.inline_eligibility_mask
FROM sys.objects AS o
INNER JOIN sys.sql_modules AS m
    ON o.object_id = m.object_id
WHERE o.name = 'udf_GetCustomerTier';
GO
```

Expected result: `is_inlineable = 1` and mask `1`.

First run a supported direct query:

```sql
SELECT TOP (3)
    t.TransactionID,
    t.CustomerID,
    dbo.udf_GetCustomerTier(t.CustomerID) AS CustomerTier
FROM dbo.Lab_Transactions AS t
ORDER BY t.TransactionID;
GO
```

Expected results:

| TransactionID | CustomerID | CustomerTier |
|---:|---:|---|
| 1 | 1 | Silver |
| 2 | 2 | Bronze |
| 3 | 3 | Gold |

Now place the same function call behind a CTE:

```sql
WITH recent_transactions AS
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
FROM recent_transactions AS rt;
GO
```

Expected result: error `19835`, because the CTE calling shape isn't supported for a function that
relies on Scalar UDF inlining.

Both unsupported queries return error `19835`. That message identifies an unsupported context,
but it doesn't explain the cause. Use the mask and the smallest working query to distinguish:

- mask `0` plus a table call: the function isn't inlineable;
- mask `1` plus a direct query that works: the CTE shape is unsupported.

### 5. Fix the Scalar UDF inlining CTE query

When a function relies on Scalar UDF inlining, consider these options in order:

1. If the table lookup can move outside the function, rewrite the body so it is eligible for
   inlining via Expression Block. That technique supports broader calling-query shapes and can
   represent complex procedural logic.
2. If table access is an essential part of the function, keep the function and rewrite the
   calling query into a supported shape.

`udf_GetCustomerTier` exists to read `Lab_Customers`, so this example keeps the function and
replaces the unsupported CTE with the
[temporary-table approach from Microsoft Learn](https://learn.microsoft.com/fabric/data-warehouse/how-to-inline-udf#replace-a-common-table-expression).

Materialize the UDF result in a temporary table, then query that table:

Run every SQL block in this section using the same SQL session or connection. The temporary table
exists only in the session that creates it.

```sql
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

SELECT
    TransactionID,
    CustomerID,
    CustomerTier
FROM #RecentTransactionTiers
ORDER BY TransactionID;
GO

DROP TABLE IF EXISTS #RecentTransactionTiers;
GO
```

Expected result: 20 rows. The first three tiers remain `Silver`, `Bronze`, and `Gold`.

The function wasn't changed. The UDF call now runs in the supported `INSERT ... SELECT`, and the
final query reads the materialized result without calling the UDF through a CTE.

### 6. Combine mask `2` and mask `1` functions

A query can call functions that use different inlining techniques. The complete query must satisfy
the requirements of every function it calls.

Restore `udf_DiagnosticOrderBatches` as the original mask `2` function:

```sql
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
```

The query below calls both the mask `2` function and the mask `1` `udf_GetCustomerTier` function
in a supported direct shape:

```sql
SELECT TOP (3)
    t.TransactionID,
    dbo.udf_DiagnosticOrderBatches(t.TransactionID, 10) AS CompleteBatches,
    dbo.udf_GetCustomerTier(t.CustomerID) AS CustomerTier
FROM dbo.Lab_Transactions AS t
ORDER BY t.TransactionID;
GO
```

Expected results:

| TransactionID | CompleteBatches | CustomerTier |
|---:|---:|---|
| 1 | 0 | Silver |
| 2 | 0 | Bronze |
| 3 | 0 | Gold |

Now place the same two calls behind a CTE:

```sql
WITH recent_transactions AS
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
FROM recent_transactions AS rt;
GO
```

Expected result: error `19835`.

The mask `2` function can be used where needed, but the same query also calls a mask `1` function.
The complete query is therefore subject to Scalar UDF inlining requirements.

## What You Learned

- Mask `2` means inlining via Expression Block is available. Use the UDF where you need it in
  Warehouse queries.
- Mask `1` means Scalar UDF inlining is available. The function can work in a direct query while an
  unsupported calling-query shape, such as a CTE, still fails.
- When one query calls both mask `2` and mask `1` functions, the complete query must satisfy the
  mask `1` Scalar UDF inlining requirements.
- Error `19841` means the function definition can't use either inlining technique.
- Mask `0` with `INLINE = AUTO` saves a non-inlineable definition for limited standalone use; it
  doesn't make distributed table queries work.
- Error `19835` is generic. For mask `1`, compare a working direct query with the failing shape.

## Troubleshooting Decision Table

| Observation | Meaning | Recommended action |
|---|---|---|
| DDL error `19841` | Definition isn't eligible for either technique | Rewrite the body, or use `INLINE = AUTO` only for a deliberate standalone scenario |
| Mask `0` | Cataloged but non-inlineable | Don't call it from a distributed user-table query |
| Mask `1` | Eligible for Scalar UDF inlining | Use Scalar UDF inlining-compatible calling-query shapes |
| Mask `2` | Eligible for inlining via Expression Block | Use UDF |
| Mask `3` | Either technique can process the definition | Use UDF |
| Mask `1` function fails only in one query | Scalar UDF inlining calling-query restriction or complexity limit | Check the query-shape requirements, or break the query into multiple queries, for example by using temporary tables |
| Query calls both mask `2` and mask `1` functions | The complete query is subject to Scalar UDF inlining requirements | Rewrite the mask `1` function for mask `2` eligibility if possible, or break the work into multiple queries in the same batch, for example by using temporary tables |
| Mask `2` function unexpectedly fails | Behavior outside this lab's expected Expression Block model | Capture the exact repro, metadata, error, and all displayed statement IDs as a possible product gap |

## Cleanup

Step 6 restores `udf_DiagnosticOrderBatches` to the mask `2` definition created in Step 1.
After the exercises, run [`sql/99_cleanup.sql`](sql/99_cleanup.sql) to remove that lab-exclusive
function. You can also use cleanup if you stop partway through the lab; it removes the diagnostic
function in its current state and the temporary rewrite table in the current session.

The cleanup retains shared sample data and `udf_GetCustomerTier`, whose definition matches
Lab 01.

## Feedback

For unexpected behavior, capture a minimal reproduction, function metadata, and the exact error.
Remove connection details, identifiers, secrets, and customer data before sharing. See the
[main guide](../README.md) for reporting channels.

## Continue

- [Previous: Lab 06 — Fuzzy String Matching](../06_FuzzyStringMatching/00_ReadMe.md)
- [Next: Lab 08 — Time-Dependent Built-ins](../08_TimeDependentBuiltins/00_ReadMe.md)
- [Back to main](../README.md)

## Related

- [Inlining Fundamentals](../01_InliningFundamentals/00_ReadMe.md)

---

Last Updated: November 19, 2026
