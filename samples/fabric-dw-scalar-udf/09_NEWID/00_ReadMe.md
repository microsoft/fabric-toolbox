# Lab 09: `NEWID()` in Scalar UDFs

⏱️ **Estimated time:** 5 minutes

**Inlining coverage:** Inlining via Expression Block

> **Prerequisite:** Run
> [`../00_Source/sql/01_setup_tables.sql`](../00_Source/sql/01_setup_tables.sql)
> first.

## Read This First

This lab demonstrates `NEWID()` in scalar UDFs that are eligible for Expression Block inlining.

Fabric DW automatically uses Expression Block inlining when the UDF body contains scalar and
procedural logic without references to tables, views, inline TVFs, or other scalar UDFs.

> **Note:** Traditional Scalar UDF Inlining doesn't support `NEWID()`.

This lab demonstrates that:

1. A scalar UDF can contain `NEWID()`.
2. One scalar UDF can contain multiple `NEWID()` expressions.
3. The same `NEWID()` UDF can be referenced multiple times in one query.
4. Multiple different `NEWID()` UDFs can be used in one query.
5. The UDFs generate row-varying values when applied across table rows.

## Understand the Results

`NEWID()` produces a new value for each row and for each `NEWID()` invocation within the UDF body.

To reuse one identifier, generate it once, store it in a variable, and use that variable wherever
the same value is required.

## `NEWID()` in Scalar UDFs: SQL Server and Azure SQL Comparison

SQL Server, Azure SQL Database, and Azure SQL Managed Instance don't allow `NEWID()` inside a
T-SQL scalar UDF body.

In Fabric DW, Expression Block inlining enables this capability while preserving the row-varying
behavior of `NEWID()`.

## Run the Lab

Choose either approach:

- Open and run the complete [`sql/01_newid.sql`](sql/01_newid.sql) script.
- Follow the numbered core steps below and run each SQL block in order.

The complete script covers the numbered core steps. The **Try More** exercises are additional
and must be run separately.

### Step 1: Create a UDF with `NEWID()`

`dbo.udf_GenerateRunId` returns a newly generated identifier.

```sql
CREATE OR ALTER FUNCTION dbo.udf_GenerateRunId()
RETURNS UNIQUEIDENTIFIER
AS
BEGIN
    RETURN NEWID();
END;
GO
```

After creation, the **Messages** pane should show:

```text
Function dbo.udf_GenerateRunId can be inlined via Expression block.
```

### Step 2: Use `NEWID()` multiple times inside one UDF

`dbo.udf_NewIdPairIsDistinct` generates two identifiers and reports whether they are different.

```sql
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
```

After creation, the **Messages** pane should show:

```text
Function dbo.udf_NewIdPairIsDistinct can be inlined via Expression block.
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
    OBJECT_ID('dbo.udf_GenerateRunId'),
    OBJECT_ID('dbo.udf_NewIdPairIsDistinct')
)
ORDER BY
    o.name;
GO
```

### Step 4: Generate identifiers across table rows

The query applies both UDFs to all transaction rows. It references
`udf_GenerateRunId` twice for each row and stores the generated values for analysis.
The query stores the generated identifiers before analyzing them so each value is captured once.

> **Note:** Each source row generates four `NEWID()` values: two returned by the
> `udf_GenerateRunId` references and two used internally by `udf_NewIdPairIsDistinct`. Only the
> first two identifiers are stored; the second UDF returns whether its internal pair is distinct.

```sql
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
```

### Step 5: Analyze the generated identifiers

The analytical query checks the generated values by product.

```sql
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
```

Review the results:

- Each distinct count should match `TransactionCount`.
- `SameRowCollisions` should be `0`.
- `EveryInternalPairIsDistinct` should be `1`.

## Try More

### 1. Try more query shapes

Use the UDFs in other valid query shapes produced by your applications, generated SQL, or agents.
Report any unexpected shape in which the inlineable UDF doesn't work.

Current known exclusions for Expression Block-backed scalar UDF calls are:

- `ROLLUP`
- `CUBE`
- `GROUPING SETS`

### 2. Compare generation and reuse

This example uses `VARCHAR(50)` to pass the generated identifiers as text.

```sql
CREATE OR ALTER FUNCTION dbo.udf_ReturnValue
(
    @value VARCHAR(50)
)
RETURNS VARCHAR(50)
AS
BEGIN
    RETURN @value;
END;
GO

DECLARE @capturedValue VARCHAR(50) =
    CONVERT(VARCHAR(50), NEWID());

SELECT
    COUNT(DISTINCT PassedDirectly) AS DistinctPassedDirectly,
    COUNT(DISTINCT PassedFromVariable) AS DistinctPassedFromVariable,
    COUNT(DISTINCT GeneratedInsideUdf) AS DistinctGeneratedInsideUdf
FROM
(
    SELECT
        dbo.udf_ReturnValue(CONVERT(VARCHAR(50), NEWID())) AS PassedDirectly,
        dbo.udf_ReturnValue(@capturedValue) AS PassedFromVariable,
        CONVERT(VARCHAR(50), dbo.udf_GenerateRunId()) AS GeneratedInsideUdf
    FROM GENERATE_SERIES(1, 100)
) AS results;
GO
```

Compare the three distinct counts. A count of `1` means the same identifier was reused; a larger
count means that more than one identifier was generated.

> **Note:** Keep the UDF body limited to scalar and procedural logic. A body that combines
> `NEWID()` with table, view, or inline TVF access isn't eligible for either inlining technology.

## Cleanup

After the exercises, run [`sql/99_cleanup.sql`](sql/99_cleanup.sql). It removes this lab's two
core UDFs, optional `udf_ReturnValue` helper, and `Lab_NewIdResults` table. Shared sample data
remains available for other labs.

## Continue

- [Previous: Lab 08 — Time-Dependent Built-ins](../08_TimeDependentBuiltins/00_ReadMe.md)
- [Next: Lab 10 — AI Functions](../10_AIFunctions/00_ReadMe.md)
- [Back to main](../README.md)

## Related

- [CREATE FUNCTION documentation](https://learn.microsoft.com/sql/t-sql/statements/create-function-sql-data-warehouse?view=fabric)
- [Inlineability Diagnostics](../07_InlineabilityDiagnostics/00_ReadMe.md)
- [`NEWID` documentation](https://learn.microsoft.com/sql/t-sql/functions/newid-transact-sql?view=fabric)

---

Last Updated: November 19, 2026
