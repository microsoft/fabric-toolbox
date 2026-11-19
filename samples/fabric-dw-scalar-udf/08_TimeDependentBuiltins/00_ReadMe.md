# Lab 08: Time-Dependent Built-ins

⏱️ **Estimated time:** 5 minutes

**Inlining coverage:** Inlining via Expression Block

> **Prerequisite:** Run
> [`../00_Source/sql/01_setup_tables.sql`](../00_Source/sql/01_setup_tables.sql)
> first.

## Read This First

This lab demonstrates time-dependent built-ins in scalar UDFs that are eligible for Expression
Block inlining.

Fabric DW automatically uses Expression Block inlining when the UDF body contains scalar and
procedural logic without references to tables, views, inline TVFs, or other scalar UDFs.

> **Note:** Traditional Scalar UDF Inlining doesn't support these built-ins.

Supported built-ins include `GETDATE`, `GETUTCDATE`, `CURRENT_TIMESTAMP`, `SYSDATETIME`,
`SYSUTCDATETIME`, and `SYSDATETIMEOFFSET`.

This lab demonstrates that:

1. A scalar UDF can contain a time-dependent built-in.
2. One scalar UDF can contain multiple time-dependent expressions.
3. The same time-dependent UDF can be referenced multiple times in one query.
4. Multiple different time-dependent UDFs can be used in one query.
5. A query can apply time-dependent UDFs across many table rows.

## Understand the Results

Fabric DW can evaluate a time-dependent UDF for individual rows or batches of rows. Timestamps can
repeat or change across rows and across multiple references to the UDF.

In the loop example later in this lab, the UDF returns `0` when `@start` and `@end` capture the
same `DATETIME2(6)` value. Across 1,000 or more rows, you will typically also observe positive
durations.

## Time-Dependent Built-ins: SQL Server and Azure SQL Comparison

For the time-dependent built-ins covered in this lab, Fabric DW preserves the same user-visible
T-SQL behavior as SQL Server, Azure SQL Database, and Azure SQL Managed Instance.

Expression Block inlining allows UDFs that use these built-ins to participate in distributed
warehouse queries at scale.

## Run the Lab

Choose either approach:

- Open and run the complete
  [`sql/01_time_dependent_builtins.sql`](sql/01_time_dependent_builtins.sql) script.
- Follow the numbered core steps below and run each SQL block in order.

The complete script covers the numbered core steps. The **Try More** exercises are additional
and must be run separately.

### Step 1: Create a UDF with a time-dependent built-in

`dbo.udf_GetCurrentUtc` returns `SYSUTCDATETIME()`.

```sql
CREATE OR ALTER FUNCTION dbo.udf_GetCurrentUtc()
RETURNS DATETIME2(6)
AS
BEGIN
    RETURN SYSUTCDATETIME();
END;
GO
```

After creation, the **Messages** pane should show:

```text
Function dbo.udf_GetCurrentUtc can be inlined via Expression block.
```

### Step 2: Use the built-in multiple times inside one UDF

`dbo.udf_GetLoopDurationMicroseconds` reads the current time before and after a small `WHILE`
loop. The loop simulates procedural work and is deliberately limited to 10 iterations so the
example remains safe when the UDF is applied to many rows. This is a functional example, not a
performance benchmark.

```sql
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
```

After creation, the **Messages** pane should show:

```text
Function dbo.udf_GetLoopDurationMicroseconds can be inlined via Expression block.
```

### Step 3: Check inlining metadata

Both functions should report:

| Metadata | Expected value |
|---|---:|
| `is_inlineable` | `1` |
| `inline_eligibility_mask` | `2` |

Mask `2` means the function is eligible for inlining via Expression Block.

```sql
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
```

### Step 4: Use the UDFs in an analytical query

The query groups transactions by product and calculates common sales measures. It also references
`udf_GetCurrentUtc` more than once, uses two different time-dependent UDFs, and applies the UDFs
across the transaction rows.

```sql
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
```

Review the results:

- `EarliestUtcObserved` and `LatestUtcObserved` may be equal or different.
- Typically, 1,000 or more source rows will make a positive observed loop duration easier to see.
- `SumOfObservedLoopDurationsMicroseconds` is the sum of values returned by the UDF, not the
  elapsed time of the complete query.

## Try More

### 1. Try more query shapes

Use the UDFs in other valid query shapes produced by your applications, generated SQL, or agents.
Report any unexpected shape in which the inlineable UDF doesn't work.

Current known exclusions for Expression Block-backed scalar UDF calls are:

- `ROLLUP`
- `CUBE`
- `GROUPING SETS`

### 2. Compare where the time value is evaluated

This example uses `DATETIME2(6)` to match `dbo.udf_GetCurrentUtc`. You can use another compatible
time type for your scenario.

```sql
CREATE OR ALTER FUNCTION dbo.udf_ReturnTimeValue
(
    @timeValue DATETIME2(6)
)
RETURNS DATETIME2(6)
AS
BEGIN
    RETURN @timeValue;
END;
GO

DECLARE @capturedUtc DATETIME2(6) = SYSUTCDATETIME();

SELECT
    COUNT(DISTINCT PassedDirectly) AS DistinctPassedDirectly,
    COUNT(DISTINCT PassedFromVariable) AS DistinctPassedFromVariable,
    COUNT(DISTINCT GeneratedInsideUdf) AS DistinctGeneratedInsideUdf
FROM
(
    SELECT
        dbo.udf_ReturnTimeValue(SYSUTCDATETIME()) AS PassedDirectly,
        dbo.udf_ReturnTimeValue(@capturedUtc) AS PassedFromVariable,
        dbo.udf_GetCurrentUtc() AS GeneratedInsideUdf
    FROM GENERATE_SERIES(1, 100000)
) AS results;
GO
```

Compare the three distinct counts. A count of `1` means the same timestamp was reused; a larger
count means that more than one timestamp was generated.

> **Note:** Keep the UDF body limited to scalar and procedural logic. A body that combines
> time-dependent built-ins with table, view, or inline TVF access isn't eligible for either
> inlining technology.

## Cleanup

After the exercises, run [`sql/99_cleanup.sql`](sql/99_cleanup.sql). It removes this lab's two
core UDFs and the optional `udf_ReturnTimeValue` helper, while retaining shared sample data.

## Continue

- [Previous: Lab 07 — Inlineability Diagnostics](../07_InlineabilityDiagnostics/00_ReadMe.md)
- [Next: Lab 09 — `NEWID()`](../09_NEWID/00_ReadMe.md)
- [Back to main](../README.md)

## Related

- [CREATE FUNCTION documentation](https://learn.microsoft.com/sql/t-sql/statements/create-function-sql-data-warehouse?view=fabric)
- [Inlineability Diagnostics](../07_InlineabilityDiagnostics/00_ReadMe.md)

---

Last Updated: November 19, 2026
