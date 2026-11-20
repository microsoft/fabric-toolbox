# Scalar UDF Hands-On Lab — Fabric Data Warehouse

A hands-on lab for learning **scalar user-defined functions (UDFs)** in
[Microsoft Fabric Data Warehouse](https://learn.microsoft.com/fabric/data-warehouse/). Work
through T-SQL scripts that showcase inlining, procedural logic such as `WHILE` loops,
`IF/ELSE` branching, and multiple `RETURN` statements, and different ways to use UDFs in
analytical queries.

> **Scope:** Scalar UDFs are available in both **Warehouse** and **SQL analytics endpoint** items.
> The instructions and sample scripts are designed for a Warehouse item.

> **AI-generated examples:** The examples throughout this lab are AI-generated for educational
> purposes. Real-world usage patterns and scenarios may vary.

> This sample is provided as-is for educational purposes to help you explore the feature and
> bootstrap your own UDFs. See the repository [LICENSE](../../LICENSE) and
> [SECURITY.md](../../SECURITY.md).

## What Are Scalar UDFs?

The scalar UDFs in this lab:

- are written entirely in T-SQL;
- return a single scalar value; and
- run directly in the Fabric Data Warehouse query engine.

They are not Python functions, table-valued functions, or external/CLR functions.

### Two Inlining Techniques

Fabric Data Warehouse transforms the UDF body into the calling query and executes it in a
distributed manner. This transformation uses two inlining techniques:

| Inlining technique | Typical function definition | Lab focus |
|---|---|---|
| **Inlining via Expression Block** | Procedural logic over parameters and local variables, without table access | `WHILE`, branching, multiple returns, business rules, and broad query shapes |
| **Scalar UDF inlining** | Logic that reads tables, views, or inline table-valued functions | Data access, cleansing, and reference-data lookup |

The `inline_eligibility_mask` identifies which techniques can process a function definition.
Calling-query support is evaluated when the query is compiled. Start with
[Inlining Fundamentals](01_InliningFundamentals/00_ReadMe.md) to compare the techniques,
inspect their metadata and plans, and contrast them with a deliberately non-inlineable function
created using `INLINE = AUTO`.

For the latest feature capabilities and supported scenarios, see the official
[CREATE FUNCTION documentation](https://learn.microsoft.com/sql/t-sql/statements/create-function-sql-data-warehouse?view=fabric&preserve-view=true).

## What This Lab Covers

> The examples in this lab are designed for a **Warehouse** item.

- Expression Block inlining and Scalar UDF inlining
- Inlineability metadata, `SHOWPLAN_XML`, and `INLINE = AUTO`
- Using both inlining techniques in one analytical query
- Iterative calculations with `WHILE`
- Multiple `RETURN` statements (early exit, guard clauses)
- Multi-branch and nested `IF/ELSE` business rules
- UDFs used in combination with `CTE`, `GROUP BY`, `HAVING`, and `ORDER BY`
- Scalar UDFs combined with string analytics functions and operators
- Applying fuzzy string matching to incoming product names
- Diagnosing inlining eligibility and calling-query restrictions
- Using time-dependent built-ins and `NEWID()` inside scalar UDFs
- Chaining AI extraction, classification, and draft generation through scalar UDFs

## Prerequisites

1. Access to a Microsoft Fabric workspace where you can create a Warehouse.
2. A SQL client, such as the Fabric SQL query editor, SSMS, or another TDS-compatible client.
3. VS Code or another Markdown viewer if you want rendered instructions alongside the SQL.

## Quick Start

1. In your Microsoft Fabric workspace, create a Warehouse.
2. Connect to the Warehouse with your SQL client.
3. Run the shared-data setup: [`00_Source`](00_Source/00_ReadMe.md).
4. Learn the execution model:
   [Inlining Fundamentals](01_InliningFundamentals/00_ReadMe.md).
5. Explore
   [Inlining via Expression Block](02_InliningViaExpressionBlock/00_ReadMe.md).
6. Continue with [Scalar UDF Inlining](03_ScalarUDFInlining/00_ReadMe.md).
7. Use both techniques in
   [Combining Inlining Techniques](04_CombiningInliningTechniques/00_ReadMe.md).
8. Explore
   [String Functions and Operators](05_StringFunctions_and_Operators/00_ReadMe.md).
9. Complete the
   [Fuzzy String Matching](06_FuzzyStringMatching/00_ReadMe.md) scenario,
   which has its own setup and cleanup.
10. Explore [Inlineability Diagnostics](07_InlineabilityDiagnostics/00_ReadMe.md),
    which you can also revisit when troubleshooting.
11. Try [Time-Dependent Built-ins](08_TimeDependentBuiltins/00_ReadMe.md).
12. Try [`NEWID()`](09_NEWID/00_ReadMe.md).
13. Optionally continue with [Lab 10: AI Functions](10_AIFunctions/00_ReadMe.md), which has
    its own setup and [AI prerequisites](https://learn.microsoft.com/fabric/data-warehouse/ai-functions#prerequisites).
14. Return to [Cleanup](#cleanup) for common or lab-specific reset options.

Run scripts in the documented order. Some query-shape scripts intentionally reuse UDFs created by
an earlier lesson. Most labs also have a `sql` subfolder with complete executable scripts.

## Folder Structure

| Folder | Purpose | Order |
|---|---|---|
| [00_Source](00_Source/00_ReadMe.md) | Shared-data setup and common reset; links to self-contained labs | First |
| [01_InliningFundamentals](01_InliningFundamentals/00_ReadMe.md) | Inlining techniques, metadata, plans, and `INLINE = AUTO` | Second |
| [02_InliningViaExpressionBlock](02_InliningViaExpressionBlock/00_ReadMe.md) | Procedural logic, business rules, and Warehouse query shapes | Third |
| [03_ScalarUDFInlining](03_ScalarUDFInlining/00_ReadMe.md) | Reference-data lookup with a data-access UDF | Fourth |
| [04_CombiningInliningTechniques](04_CombiningInliningTechniques/00_ReadMe.md) | Both inlining techniques used in one calling query | Fifth |
| [05_StringFunctions_and_Operators](05_StringFunctions_and_Operators/00_ReadMe.md) | Scalar UDFs with string functions and operators | Sixth |
| [06_FuzzyStringMatching](06_FuzzyStringMatching/00_ReadMe.md) | End-to-end fuzzy product-name matching; own setup and cleanup | Seventh |
| [07_InlineabilityDiagnostics](07_InlineabilityDiagnostics/00_ReadMe.md) | Eligibility, expected errors, and calling-query troubleshooting | Eighth, or revisit as needed |
| [08_TimeDependentBuiltins](08_TimeDependentBuiltins/00_ReadMe.md) | Time-dependent built-ins inside scalar UDFs | Ninth |
| [09_NEWID](09_NEWID/00_ReadMe.md) | Identifier generation and materialized per-row results | Tenth |
| [10_AIFunctions](10_AIFunctions/00_ReadMe.md) | AI-backed scalar UDFs and materialized demonstration drafts; own setup and cleanup | Optional, after Lab 09 |
| [100_Utilities](100_Utilities/100_ReadMe.md) | Observability and dependency scripts | As needed |

## Sample Data

The setup script creates synthetic tables such as `Lab_Customers`, `Lab_Products`, and
`Lab_Transactions`. Row count is configurable in
[`01_setup_tables.sql`](00_Source/sql/01_setup_tables.sql); the default is 100,000 rows. All data
is fictitious and generated at runtime.

Labs 06 and 10 have their own setup and cleanup. See
[Source Data Setup](00_Source/00_ReadMe.md#self-contained-labs) for the script links.

Lab 10 creates its own synthetic order inquiries and stored prompts. It calls external AI APIs
through Microsoft Fabric; use only the supplied synthetic data. Generated replies are
demonstration drafts for human review, not production customer-service guidance.

## Cleanup

Each lab that creates lab-exclusive objects includes a cleanup step. These steps retain shared
sample data and functions needed by other labs. If a lab deliberately changes a shared object,
follow its restoration step rather than dropping the object.

You can run shared-data cleanup at any time using `00_Source/sql/99_cleanup.sql`. It permanently
deletes shared sample tables and UDFs, including lab-specific objects left behind when individual
cleanup steps were skipped. Labs 06 and 10 are excluded; use their own cleanup scripts.

If you want to run a shared-data lab again afterward, rerun shared data setup and the prerequisite
scripts listed in that lab's guide. Shared data setup recreates tables, but not UDFs.

| Cleanup | Script |
|---|---|
| Shared-data cleanup | [`00_Source/sql/99_cleanup.sql`](00_Source/sql/99_cleanup.sql) |
| Lab 01 exclusive UDFs | [`01_InliningFundamentals/sql/99_cleanup.sql`](01_InliningFundamentals/sql/99_cleanup.sql) |
| Lab 02 exclusive UDFs | [`02_InliningViaExpressionBlock/sql/99_cleanup.sql`](02_InliningViaExpressionBlock/sql/99_cleanup.sql) |
| Lab 05 exclusive UDFs | [`05_StringFunctions_and_Operators/sql/99_cleanup.sql`](05_StringFunctions_and_Operators/sql/99_cleanup.sql) |
| Lab 06 complete reset | [`06_FuzzyStringMatching/sql/99_cleanup.sql`](06_FuzzyStringMatching/sql/99_cleanup.sql) |
| Lab 07 diagnostic UDF | [`07_InlineabilityDiagnostics/sql/99_cleanup.sql`](07_InlineabilityDiagnostics/sql/99_cleanup.sql) |
| Lab 08 UDFs, including the optional helper | [`08_TimeDependentBuiltins/sql/99_cleanup.sql`](08_TimeDependentBuiltins/sql/99_cleanup.sql) |
| Lab 09 UDFs and results, including the optional helper | [`09_NEWID/sql/99_cleanup.sql`](09_NEWID/sql/99_cleanup.sql) |
| Lab 10 complete reset | [`10_AIFunctions/sql/99_cleanup.sql`](10_AIFunctions/sql/99_cleanup.sql) |

Labs 03 and 04 need no separate local cleanup: the reference-lookup and compound-interest
functions remain available for Lab 04 and are removed by shared-data cleanup.

## Feedback

Found an issue with the public sample or have a suggestion? Open an issue in
[microsoft/fabric-toolbox](https://github.com/microsoft/fabric-toolbox/issues). Do not include
workspace IDs, connection strings, tokens, customer data, or other secrets.

For feedback about the Fabric Data Warehouse Scalar UDF feature, email
[Fabric DW functions feedback](mailto:fabricdw-functions@microsoft.com).

## Contributing

This project welcomes contributions and suggestions under the Microsoft
[fabric-toolbox](https://github.com/microsoft/fabric-toolbox) contribution guidelines and CLA.

---

Last Updated: November 19, 2026
