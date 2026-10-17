# 📁 Source Data Setup

> 💡 **Prefer running full scripts?** See the `sql/` subfolder for complete .sql files instead of the step-by-step walkthrough.


> **Run this folder FIRST before any other tests.**
> 
> ⏱️ **Estimated time:** 2-5 minutes

## Scripts

| Script | Description |
|--------|-------------|
| [sql/01_setup_tables.sql](sql/01_setup_tables.sql) | Creates all `Lab_*` tables, including geo data, with test data |
| [sql/99_cleanup.sql](sql/99_cleanup.sql) | Optional full reset — drops all packaged UDFs and sample tables |

> Run `01_setup_tables.sql` first. Run `99_cleanup.sql` only after all labs and
> observability checks are complete. It permanently removes the sample tables.

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

⚠️ **Scoped destructive reset:** Re-running setup drops and recreates every
`Lab_*` table before loading fresh data.

> All data is synthetic. Customer-to-geo assignments are deterministic so lab
> results are reproducible across runs.

---

➡️ **Next:** Learn the execution model in
[Inlining Fundamentals](../01_InliningFundamentals/00_ReadMe.md), then
continue to
[Inlining via Expression Block](../02_InliningViaExpressionBlock/00_ReadMe.md).
