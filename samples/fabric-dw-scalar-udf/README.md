# Scalar UDF Hands-On Lab — Fabric Data Warehouse

A hands-on lab for learning **scalar user-defined functions (UDFs)** in [Microsoft Fabric Data Warehouse](https://learn.microsoft.com/fabric/data-warehouse/). Work through T-SQL scripts that showcase inlining, procedural logic — `WHILE` loops, `IF/ELSE` branching, multiple `RETURN` statements — and different ways to use UDFs in analytical queries.

> 💡 Scalar UDFs are available in both **Warehouse** and **SQL analytics endpoint** items.

> ⚠️ **Scalar UDFs are in public preview.** Behavior, syntax, and supported scenarios may change before general availability. Always confirm current capabilities against the official [CREATE FUNCTION](https://learn.microsoft.com/sql/t-sql/statements/create-function-sql-data-warehouse?view=fabric) documentation.

> ⚠️ **String analytics functions are in public preview.** The functions used in Labs 05 and 06 (`EDIT_DISTANCE`, `JARO_WINKLER_SIMILARITY`, `UNISTR`, `||` / `||=`) are in **public preview**.

> 💡 **AI-generated examples:** The examples throughout this lab are AI-generated for educational purposes. Real-world usage patterns and scenarios may vary based on your specific data and business requirements.

> This sample is provided as-is for educational purposes to help you explore the feature and bootstrap your own UDFs. See the repository [LICENSE](../../LICENSE) and [SECURITY.md](../../SECURITY.md).

## What Are Scalar UDFs?

The scalar UDFs in this lab:
- Are written entirely in T-SQL
- Return a single scalar value
- Run directly in the Fabric Data Warehouse query engine

They are **not** Python functions, table-valued functions, or external/CLR functions. They use pure T-SQL and execute natively in the warehouse engine.

### Two Inlining Techniques

Fabric Data Warehouse transforms the UDF body into the calling query and
executes it in a distributed manner. This transformation uses two inlining
techniques:

| Inlining technique | Typical function definition | Lab focus |
|---|---|---|
| **Inlining via Expression Block** | Procedural logic over parameters and local variables, without table access | `WHILE`, branching, multiple returns, business rules, and broad query shapes |
| **Scalar UDF inlining** | Logic that reads tables, views, or inline table-valued functions | ETL cleansing and reference-key lookup |

The `inline_eligibility_mask` identifies which techniques can process a
function definition. Calling-query support is evaluated when the query is
compiled. Start with
[Inlining Fundamentals](01_InliningFundamentals/00_ReadMe.md) to compare the
techniques, inspect their metadata and plans, and contrast them with a
deliberately non-inlineable function created using `INLINE = AUTO`.

## What This Lab Covers

> The examples in this lab are designed for a **Warehouse** item.

- Expression Block vs. scalar UDF inlining
- Inlineability metadata, `SHOWPLAN_XML`, and `INLINE = AUTO`
- Using both inlining techniques in one analytical query
- Iterative calculations with `WHILE`
- Multiple `RETURN` statements (early exit, guard clauses)
- Multi-branch and nested `IF-THEN-ELSE` business rules
- UDFs used in combination with `CTE`, `GROUP BY`, `HAVING`, and `ORDER BY`
- Combining scalar UDFs with string analytics functions (`EDIT_DISTANCE`, `JARO_WINKLER_SIMILARITY`, `UNISTR`, `||` / `||=`)
- Applying fuzzy string matching to incoming product names

## Prerequisites

1. Access to a **Microsoft Fabric** workspace with permission to create a **Warehouse**. Start free: [Microsoft Fabric trial](https://learn.microsoft.com/fabric/fundamentals/fabric-trial).
2. A SQL client — the Microsoft Fabric **SQL query editor** (in-portal), SSMS, and other TDS-compatible clients and drivers.
3. **VS Code** (optional) is a convenient way to browse this kit with rendered markdown and syntax-highlighted SQL.

## Quick Start

1. In your Fabric workspace, choose **+ New** → **Warehouse** and give it a name.
2. Connect to the warehouse with your SQL client.
3. Run the setup: [`00_Source`](00_Source/00_ReadMe.md) — creates the sample tables.
4. Learn the execution model: [Inlining Fundamentals](01_InliningFundamentals/00_ReadMe.md).
5. Explore [Inlining via Expression Block](02_InliningViaExpressionBlock/00_ReadMe.md).
6. Continue with [Scalar UDF Inlining](03_ScalarUDFInlining/00_ReadMe.md).
7. Use both techniques in [Combining Inlining Techniques](04_CombiningInliningTechniques/00_ReadMe.md).
8. Explore [String Functions and Operators](05_StringFunctions_and_Operators/00_ReadMe.md).
9. Complete the [Fuzzy String Matching](06_FuzzyStringMatching/00_ReadMe.md) scenario.
10. When finished, run [`00_Source/sql/99_cleanup.sql`](00_Source/sql/99_cleanup.sql) for a full reset. It drops all packaged UDFs and sample tables.

Run scripts in the documented order. Some query-shape scripts intentionally
reuse UDFs created by an earlier lesson. Most labs also have a `sql/` subfolder
with complete executable scripts.

## Folder Structure

| Folder | Purpose | Order |
|--------|---------|-------|
| [00_Source](00_Source/00_ReadMe.md) | Setup scripts for the lab | ⬅️ First |
| [01_InliningFundamentals](01_InliningFundamentals/00_ReadMe.md) | Inlining techniques, metadata, plans, and `INLINE = AUTO` | ⬅️ Second |
| [02_InliningViaExpressionBlock](02_InliningViaExpressionBlock/00_ReadMe.md) | Procedural logic, business rules, and warehouse query shapes | ⬅️ Third |
| [03_ScalarUDFInlining](03_ScalarUDFInlining/00_ReadMe.md) | Reference-data lookup with a data-access UDF | ⬅️ Fourth |
| [04_CombiningInliningTechniques](04_CombiningInliningTechniques/00_ReadMe.md) | Both inlining techniques used in one calling query | ⬅️ Fifth |
| [05_StringFunctions_and_Operators](05_StringFunctions_and_Operators/00_ReadMe.md) | Scalar UDFs with string functions and operators | ⬅️ Sixth |
| [06_FuzzyStringMatching](06_FuzzyStringMatching/00_ReadMe.md) | End-to-end fuzzy product-name matching | ⬅️ Seventh |
| [100_Utilities](100_Utilities/100_ReadMe.md) | Observability and dependency scripts | 🔧 As needed |

## Sample Data

The setup script creates synthetic tables (`Lab_Customers`, `Lab_Products`, `Lab_Transactions`, etc.) populated with generated data. Row counts are configurable (10K / 100K / 1M / 10M) via a single line in [`01_setup_tables.sql`](00_Source/sql/01_setup_tables.sql); the default is 100K. All data is fictitious and generated at runtime.

## Feedback

Found an issue with this sample or have a suggestion? Please open an issue on the [microsoft/fabric-toolbox](https://github.com/microsoft/fabric-toolbox/issues) repository. When sharing a repro, do **not** include workspace IDs, connection strings, tokens, or other secrets.

For feedback about the Fabric Data Warehouse Scalar UDF **feature itself**, email [Fabric DW functions feedback](mailto:fabricdw-functions@microsoft.com).

## Contributing

This project welcomes contributions and suggestions under the Microsoft [fabric-toolbox](https://github.com/microsoft/fabric-toolbox) contribution guidelines and CLA.
