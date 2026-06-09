# Table to View
This procedure was developed to help customers consolidate data for reporting purposes in a single Warehouse, Lakehouse or Mirrored database and remove the need for explicit cross-database queries.

By creating views in one Warehouse or SQL Analytics Endpoint (database) from a collection of Warehouses, Lakehouses, and Mirrored databases, the data will appear to be in one location, simplifying reporting and analysis.

This approach also helps when customers experience long delays with MD Sync, which can result in stale data in the SQL Analytics Endpoint. By distributing tables across multiple Lakehouses or SQL Analytics Endpoints, MD Sync has less work to do, but we still need a mechanism to bring the data back together into a single consolidated view — which is exactly what this procedure enables.

This needs to be executed at least once for each source database.

---

# `Table to View` Stored Procedure

## Overview

The `table_to_view` stored procedure generates **CREATE OR ALTER VIEW scripts** for all tables in a specified database. It optionally applies the views to the target database and logs the generated scripts for review. This procedure is useful for quickly turning tables into views, particularly for migration, auditing, or automation scenarios.

---

## Parameters

| Parameter        | Type            | Description                                                                                                                                                                                                 |
| ---------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@InputDatabase` | `NVARCHAR(255)` | The source database from which tables and columns will be read.                                                                                                                                             |
| `@apply_views`   | `INT`           | Controls the behavior of the procedure:<br>`0` – Only generate and display the logging / scripts.<br>`1` – Generate, display, and create the views.<br>`2` – Only create the views, do not display scripts. |

---

## How It Works

1. **Temporary table creation**
   The procedure creates a temporary table `#temp_tbl` to hold metadata for all tables in the source database, including:

   * Schema name (`SchName`)
   * Table name (`tblName`)
   * Generated view DDL script (`DDLScript`)
   * Row number (`id_col`) for sequential execution

2. **Dynamic SQL for metadata collection**

   * Uses dynamic SQL to query `sys.tables`, `sys.columns`, `sys.schemas`, `sys.types`, and default constraints.
   * Aggregates column names with `STRING_AGG` to create a valid `SELECT` list for the view.
   * Groups results by schema and table to generate one DDL script per table.

3. **Logging / Display**

   * If `@apply_views = 0` or `1`, the procedure prints the generated DDL scripts and displays the contents of `#temp_tbl`.
   * This allows you to review scripts before execution.

4. **View creation**

   * If `@apply_views = 1` or `2`, the procedure loops through the generated scripts in `#temp_tbl` and executes them to create or alter the views in the target database.
   * Each script is printed before execution for transparency.

---

## Example Usage

```sql
-- Just show the generated view scripts and logging
EXEC table_to_view @InputDatabase = 'MyDatabase', @apply_views = 0;

-- Show scripts and create views
EXEC table_to_view @InputDatabase = 'MyDatabase', @apply_views = 1;

-- Create views without displaying scripts
EXEC table_to_view @InputDatabase = 'MyDatabase', @apply_views = 2;
```

---

## Notes

* Views are generated **exactly from the source table schema**, including all columns.
* The procedure uses **dynamic SQL**, so proper permissions are required to read system catalog views and execute `CREATE OR ALTER VIEW`.
* Temporary table `#temp_tbl` exists only during the procedure execution.
* If running in **SQL Analytics Endpoint (LakeWarehouse)** or other environments with restrictions on `INSERT`, modifications may be required to avoid errors related to temp-table inserts.



