# Inlining via Expression Block

⏱️ **Estimated time:** 20 minutes

**Inlining coverage:** Inlining via Expression Block

> **Prerequisite:** Complete
> [Inlining Fundamentals](../01_InliningFundamentals/00_ReadMe.md).

These lessons focus on procedural scalar UDFs that Fabric compiles through
inlining via Expression Block. The examples progress through nested `WHILE`
loops, deeply nested `IF/ELSE` decisions, multiple-return workflows, and
analytical query shapes.

## Scripts

| Lab guide | Executable SQL | What you'll learn |
|---|---|---|
| [01_business_rules.md](01_business_rules.md) | [Run](sql/01_business_rules.sql) | Nested `IF/ELSE`, including a five-level fulfillment decision tree |
| [02_validation_returns.md](02_validation_returns.md) | [Run](sql/02_validation_returns.sql) | Guard clauses and foundational multiple-return patterns |
| [03_query_shapes.md](03_query_shapes.md) | [Run](sql/03_query_shapes.sql) | UDFs in `SELECT`, `WHERE`, `GROUP BY`, `HAVING`, CTEs, and join predicates |
| [04_projected_balance.md](04_projected_balance.md) | [Run](sql/04_projected_balance.sql) | Nested `WHILE` loops for years and compounding periods |
| [05_multi_factor_pricing.md](05_multi_factor_pricing.md) | [Run](sql/05_multi_factor_pricing.sql) | Multi-factor order pricing in projection and filtering |
| [06_customer_risk_assessment.md](06_customer_risk_assessment.md) | [Run](sql/06_customer_risk_assessment.sql) | Multiple returns across validation, iterative scoring, and nested branches |

Run the scripts in numeric order because later query-shape scripts reuse functions created by
earlier lessons.

## Cleanup

After all six lessons, run [`sql/99_cleanup.sql`](sql/99_cleanup.sql) to remove lab-exclusive
UDFs. Do not run it between lessons. Shared sample data and `udf_WhileCompoundInterest` remain
available for Lab 04.

➡️ Continue to [Scalar UDF Inlining](../03_ScalarUDFInlining/00_ReadMe.md).

🏠 [Back to Main](../README.md)
