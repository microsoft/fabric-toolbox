# Inlining Fundamentals

⏱️ **Estimated time:** 10 minutes

> **Prerequisite:** Run the [data setup](../00_Source/00_ReadMe.md) before
> executing the examples in this folder.

## Why Start Here?

To participate in a distributed query over user tables, a scalar UDF is
transformed into the calling query at compilation time. The applicable
inlining technique depends on the function definition and influences how the
logic appears in the query plan and which calling-query requirements apply.

Understanding this execution model helps you write inlineable UDFs, interpret
their metadata and query plans, and select supported query shapes.

Fabric Data Warehouse provides two inlining techniques for transforming scalar
UDF logic into a distributed query:

| Typical function definition | Inlining technique | Eligibility metadata |
|---|---|---|
| Procedural code without table access | **Inlining via Expression Block** | `is_inlineable = 1`, `inline_eligibility_mask = 2` |
| Logic that reads a table, view, or iTVF | **Scalar UDF inlining** | `is_inlineable = 1`, `inline_eligibility_mask = 1` |

- `is_inlineable` indicates whether the function definition can participate in
  inlining.
- `inline_eligibility_mask` identifies the available technique:
  - `1` — scalar UDF inlining
  - `2` — inlining via Expression Block
  - `3` — either inlining technique

A valid function that isn't eligible for either technique can still be created
with `INLINE = AUTO` and used in supported standalone scenarios. Its metadata
shows `is_inlineable = 0` and `inline_eligibility_mask = 0`.

## Query Shape Support

| Inlining eligibility | Query shape support | Example |
|---|---|---|
| Inlining via Expression Block | All* | UDFs in CTEs, `GROUP BY`, `HAVING`, and `ORDER BY` |
| Scalar UDF inlining (FROID) | Scoped | Can be used in `SELECT`, `WHERE`, and `JOIN`, but not in `GROUP BY`, `ORDER BY`, or queries with CTEs |
| Non-inlineable (`INLINE = AUTO`) | Limited | `DECLARE @var INT; SET @var = dbo.udf_call();` |

\* Confirm current query-shape support against the product documentation.

## Number of UDFs in a Query

| Inlining eligibility | Number of UDF calls |
|---|---|
| Inlining via Expression Block | Unlimited |
| Scalar UDF inlining (FROID) | Limited; depends on overall query complexity |
| Non-inlineable (`INLINE = AUTO`) | Unlimited in supported standalone queries |

> **Combined-query requirement:** If a query calls even one UDF that is
> eligible only for scalar UDF inlining, the complete query must meet scalar
> UDF inlining requirements for query shape and number of UDF calls.

For the complete and current rules, see:

- [Create scalar user-defined functions](https://learn.microsoft.com/fabric/data-warehouse/how-to-inline-udf)
- [CREATE FUNCTION (Fabric Data Warehouse)](https://learn.microsoft.com/sql/t-sql/statements/create-function-sql-data-warehouse?view=fabric)

---

## 1. Computation-Based UDF: Inlining via Expression Block

This function contains procedural logic but doesn't read a table.

```sql
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
```

Check the definition metadata:

```sql
SELECT
    o.name AS FunctionName,
    m.is_inlineable,
    m.inline_eligibility_mask
FROM sys.objects AS o
INNER JOIN sys.sql_modules AS m
    ON o.object_id = m.object_id
WHERE o.name = 'udf_WhileSumAccumulator';
GO
```

**Expected:** `is_inlineable = 1`, `inline_eligibility_mask = 2`.

Now use the UDF over distributed user data:

```sql
SELECT TOP (5)
    t.TransactionID,
    t.Quantity,
    dbo.udf_WhileSumAccumulator(t.Quantity) AS AccumulatedQuantity
FROM dbo.Lab_Transactions AS t
ORDER BY t.TransactionID;
GO
```

### Inspect the estimated plan

`SET SHOWPLAN_XML` returns the plan without executing the query. Run the full
batch, including both `GO` separators:

```sql
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
```

Search the returned XML for:

- `ContainsInlineScalarTsqlUdfs="1"`
- `EXPRESSION_BLOCK_EXECUTE`
- `<UserDefinedFunction FunctionName="...udf_WhileSumAccumulator">`

`ContainsInlineScalarTsqlUdfs="1"` on the `<QueryPlan>` element confirms that
the plan contains an inlined scalar T-SQL UDF. This is a common marker for both
inlining techniques; it doesn't identify which technique was used.

For inlining via Expression Block, the operator tree retains an explicit
`<ScalarOperator>` with a nested `<UserDefinedFunction>` element. Its
`ScalarString` contains `EXPRESSION_BLOCK_EXECUTE(...)`, which is the
technique-specific signature.

---

## 2. Data-Access UDF: Scalar UDF Inlining

This function reads `Lab_Customers`, so the data-access rules apply.

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

Run the same metadata query:

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

**Expected:** `is_inlineable = 1`, `inline_eligibility_mask = 1`.

Use a simple supported calling-query shape:

```sql
SELECT TOP (5)
    t.TransactionID,
    t.CustomerID,
    dbo.udf_GetCustomerTier(t.CustomerID) AS CustomerTier
FROM dbo.Lab_Transactions AS t
ORDER BY t.TransactionID;
GO
```

Inspect its estimated plan:

```sql
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
```

Search the returned XML for:

- `ContainsInlineScalarTsqlUdfs="1"`
- `Lab_Transactions`
- `Lab_Customers`

The UDF name remains in the `<StmtSimple StatementText="...">` attribute
because that attribute records the submitted query. Unlike the Expression
Block plan, however, the operator tree has no `<UserDefinedFunction>` element
and no `EXPRESSION_BLOCK_EXECUTE(...)` expression.

Scalar UDF inlining transforms the function body into common relational and
scalar operators.
In this example, the plan exposes access to `Lab_Customers` alongside
`Lab_Transactions`, with join and aggregate operators implementing the UDF
logic. The original `udf_GetCustomerTier` call is therefore not a separate
operator.

---

## 3. Intentionally Non-Inlineable UDF

The next definition combines table access with a `WHILE` loop. Inlining via
Expression Block rejects the table query, while scalar UDF inlining rejects
`WHILE`.

```sql
DROP FUNCTION IF EXISTS dbo.udf_CountCustomerOrderBatches;
GO

CREATE FUNCTION dbo.udf_CountCustomerOrderBatches
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
END;
GO
```

**Expected:** The default `CREATE FUNCTION` is rejected with error `19841`.
The message identifies both incompatibilities and suggests either rewriting
the function or using `WITH INLINE = AUTO` for standalone execution.

To preserve the function for a standalone calculation, add the function
option after `RETURNS INT`, then rerun the same definition:

```sql
RETURNS INT
WITH INLINE = AUTO
AS
```

Check its metadata:

```sql
SELECT
    o.name AS FunctionName,
    m.is_inlineable,
    m.inline_eligibility_mask
FROM sys.objects AS o
INNER JOIN sys.sql_modules AS m
    ON o.object_id = m.object_id
WHERE o.name = 'udf_CountCustomerOrderBatches';
GO
```

**Expected:** `is_inlineable = 0`, `inline_eligibility_mask = 0`.

Call it once as a standalone scalar expression:

```sql
DECLARE @BatchCount INT;
SET @BatchCount = dbo.udf_CountCustomerOrderBatches(1, 10);
SELECT @BatchCount AS CustomerOrderBatches;
GO
```

`INLINE = AUTO` doesn't make the function inlineable. The following
distributed table query remains unsupported:

```sql
-- Unsupported: the non-inlineable UDF is called over a user table.
SELECT
    c.CustomerID,
    dbo.udf_CountCustomerOrderBatches(c.CustomerID, 10)
FROM dbo.Lab_Customers AS c;
```

---

## Plan Comparison

| What to inspect | Inlining via Expression Block | Scalar UDF inlining |
|---|---|---|
| Metadata in this lab | Mask `2` | Mask `1` |
| Plan signature | `EXPRESSION_BLOCK_EXECUTE(...)` | UDF logic expanded into common operators |
| Tables visible in the plan | Calling-query table | Calling-query table plus table read inside the UDF |
| Supported calling-query shapes | Broad | Follow documented requirements |

Exact operators and costs can change as the optimizer evolves, so use the
signatures above rather than expecting identical XML.

---

## Next Step

➡️ Continue to
[Inlining via Expression Block](../02_InliningViaExpressionBlock/00_ReadMe.md)
for procedural `WHILE`, `IF/ELSE`, and multiple `RETURN` patterns.

---

🏠 [Back to Main](../README.md)
