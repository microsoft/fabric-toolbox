# 📁 Source Data Setup

> 💡 **Prefer running full scripts?** See the `sql/` subfolder for complete .sql files instead of the step-by-step walkthrough.

> **Run this folder FIRST before labs that use the shared sample data.**
> 
> ⏱️ **Estimated time:** 2-5 minutes

## Scripts

| Script | Description |
|--------|-------------|
| [sql/01_setup_tables.sql](sql/01_setup_tables.sql) | Creates shared sample tables, including geo data |
| [sql/99_cleanup.sql](sql/99_cleanup.sql) | Resets shared sample data and UDFs, including remaining shared-data-lab objects |

> Run `01_setup_tables.sql` first. The common reset permanently removes shared sample tables
> and UDFs; run setup again before continuing dependent labs. Choose common or lab-specific
> cleanup from [Cleanup in the main guide](../README.md#cleanup).

## Self-Contained Labs

These labs do not require the shared setup. Each owns its setup and cleanup; their
objects are not managed by the scripts in this folder.

| Lab | Setup | Cleanup |
|-----|-------|---------|
| [Lab 06: Fuzzy String Matching](../06_FuzzyStringMatching/00_ReadMe.md) | [sql/00_setup.sql](../06_FuzzyStringMatching/sql/00_setup.sql) | [sql/99_cleanup.sql](../06_FuzzyStringMatching/sql/99_cleanup.sql) |
| [Lab 10: AI Functions](../10_AIFunctions/00_ReadMe.md) | [sql/00_setup_ai_requests.sql](../10_AIFunctions/sql/00_setup_ai_requests.sql) | [sql/99_cleanup.sql](../10_AIFunctions/sql/99_cleanup.sql) |

## ⚙️ Configurable Data Scale

Find this line near the top of the script:

```sql
INSERT INTO dbo.Lab_Config VALUES (100000);  -- ← EDIT THIS NUMBER
```

**Suggested values:**
| Rows | Use Case | Estimated Time |
|------|----------|----------------|
| 10,000 | Quick tests | Under a minute |
| 100,000 | Default, recommended start | Under a minute |
| 1,000,000 | Medium scale | Under a minute |
| 10,000,000 | Large scale | Couple of minutes |

## Tables Created

| Table | Description |
|-------|-------------|
| `Lab_Customers` | 1,000 reference customers |
| `Lab_Geo` | 110 city-name variants used by the string analytics lab |
| `Lab_Products` | 11 reference products |
| `Lab_Transactions` | Configurable rows |
| `Lab_InterestRates` | 100 reference rates |
| `Lab_Campaigns` | 200 reference campaigns |

⚠️ **Scoped destructive reset:** Re-running setup drops and recreates the named shared
tables before loading fresh data. It does not reset Lab 06 or Lab 10.

> All data is synthetic. Customer-to-geo assignments are deterministic so lab
> results are reproducible across runs.

---

➡️ **Next:** Learn the execution model in
[Inlining Fundamentals](../01_InliningFundamentals/00_ReadMe.md), then
continue to
[Inlining via Expression Block](../02_InliningViaExpressionBlock/00_ReadMe.md).
