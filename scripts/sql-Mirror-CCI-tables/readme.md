# Mirror CCI Tables for Fabric SQL DB  
Automatically replicate Clustered Columnstore Index (CCI) tables inside Fabric SQL Database

---

This stored procedure enables mirroring of **Clustered Columnstore Index (CCI) tables** into a new schema within a **Fabric SQL Database**, allowing them to behave like standard **Mirrored tables**. This fills a feature gap in Fabric where CCI-based tables cannot currently be mirrored natively.

The procedure creates a replica copy of each eligible table, maintains sync through incremental inserts/deletes, and logs run history for audit visibility.

---

## 🚀 What the stored procedure does

- Creates stored procedure `dbo.Mirror_CCI_tables`
- Automatically identifies all non-mirrored source tables
- Creates target versions in a separate schema (default `Mirroring`)
- Performs **initial full snapshot cloning**
- On subsequent executions:
  - Inserts new rows
  - Deletes rows no longer in source
  - Leaves unchanged rows untouched (efficient delta sync)
- Tracks row insert/delete counts per run in an audit table

---

## ⚙ How to run

1. Execute the T-SQL script in your **Fabric SQL Database**
2. Run the procedure manually or via scheduled automation:

```sql
EXEC dbo.Mirror_CCI_tables;
