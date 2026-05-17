# FabricNotebookAPITools

A collection of PySpark scripts designed to run inside **Microsoft Fabric Notebooks**. These tools use the Fabric and Power BI REST APIs to inventory, search, and audit resources across all workspaces in your Fabric tenant.

All tools authenticate via `mssparkutils` (available natively in Fabric notebooks) and produce **Spark temporary views** that can be queried with SQL immediately after running.

---

## Tools

### [GetAllTables.py](GetAllTables.py)

**Purpose:** Builds a complete inventory of all tables across every workspace and lakehouse in the tenant.

**What it does:**
- Iterates over all workspaces, then all lakehouses within each workspace
- Collects table metadata: name, type, storage location, and format
- Registers the result as a Spark temporary view for SQL querying

**Output view:** `fabric_lakehouse_inventory`

| Column | Description |
|---|---|
| `workspace_name` | Name of the workspace |
| `lakehouse_name` | Name of the lakehouse |
| `table_name` | Name of the table |
| `table_type` | Table type (e.g., Managed, External) |
| `location` | Storage path of the table |
| `format` | File format (e.g., delta, parquet) |

**Limitations:**
- **Schema-enabled lakehouses are skipped.** The Fabric REST API `/tables` endpoint does not support lakehouses with schemas enabled (`defaultSchema` or `enableSchemas`). These lakehouses are detected automatically and excluded from the inventory. The script prints a summary of skipped lakehouses at the end of the run, so you can identify gaps in coverage.

**Use cases:**
- Find all tables matching a name pattern across the entire tenant
- Count total tables per lakehouse or workspace
- Identify duplicate or redundant tables
- Generate a full table inventory report for governance

**Example query:**
```sql
SELECT * FROM fabric_lakehouse_inventory
WHERE table_name LIKE '%payments%'
ORDER BY workspace_name, lakehouse_name
```

---
