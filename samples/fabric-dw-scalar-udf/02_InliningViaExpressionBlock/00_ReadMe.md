# Inlining via Expression Block

> **Start here after [Inlining Fundamentals](../01_InliningFundamentals/00_ReadMe.md).**
>
> Estimated time: 20 minutes

These lessons focus on procedural scalar UDFs that Fabric compiles through
inlining via Expression Block. The examples progress through nested `WHILE`
loops, deeply nested `IF/ELSE` decisions, multiple-return workflows, and
analytical query shapes.

## Scripts

| Script | What you'll learn |
|--------|-------------------|
| [01_business_rules.md](01_business_rules.md) | Nested `IF/ELSE`, including a five-level fulfillment decision tree |
| [02_validation_returns.md](02_validation_returns.md) | Guard clauses and foundational multiple-return patterns |
| [03_query_shapes.md](03_query_shapes.md) | UDFs in `SELECT`, `WHERE`, `GROUP BY`, `HAVING`, CTEs, and join predicates |
| [04_projected_balance.md](04_projected_balance.md) | Nested `WHILE` loops for years and compounding periods |
| [05_multi_factor_pricing.md](05_multi_factor_pricing.md) | Multi-factor order pricing in projection and filtering |
| [06_customer_risk_assessment.md](06_customer_risk_assessment.md) | Multiple returns across validation, iterative scoring, and nested branches |

Complete executable versions are available in the [`sql`](sql/) subfolder. Run
them in numeric order because later query-shape scripts reuse functions
created by earlier lessons.

➡️ Continue to [Scalar UDF Inlining](../03_ScalarUDFInlining/00_ReadMe.md).

🏠 [Back to Main](../README.md)
