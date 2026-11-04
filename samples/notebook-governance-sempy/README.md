# Fabric Notebook API Tools
A collection of Microsoft Fabric notebooks for tenant-wide governance, inventory, and auditing. The notebooks are built on [Semantic Link (SemPy)](https://learn.microsoft.com/en-us/python/api/semantic-link/overview) and the [Fabric REST API](https://learn.microsoft.com/en-us/rest/api/fabric/articles/), and run directly inside a Fabric notebook — no external infrastructure required.

This collection will grow over time. Each notebook/file is self-contained: import or copy it, run it, query the result.

## get-tables.py
Builds a complete inventory of all tables across every workspace and lakehouse you have access to, and registers it as a Spark temporary view (`fabric_lakehouse_inventory`) for immediate SQL querying.

### What it does
- Enumerates all workspaces visible to the executing identity via `sempy.fabric.list_workspaces()`
- Lists every lakehouse in each workspace and every table in each lakehouse
- Collects table metadata: name, type, storage location, and format
- Registers the result as the Spark temp view `fabric_lakehouse_inventory`
- Prints a summary of any workspaces or lakehouses that could not be read, so inventory gaps are visible instead of silent

### Requirements
- Permissions: the inventory covers only workspaces the executing identity can access. For a true tenant-wide inventory, run under an identity with access to all workspaces

### How to use
1. Copy the code into the new notebook
2. Run the notebook
3. Query the inventory in a new cell:

```sql
%%sql
SELECT workspace_name, lakehouse_name, table_name, table_type, location, format
FROM fabric_lakehouse_inventory
```

### Known limitations
- **Schema-enabled lakehouses are not supported** by the underlying tables API and are reported in the failure summary rather than inventoried
- Results are scoped to the permissions of the identity running the notebook
- Workspaces and lakehouses are scanned sequentially; very large tenants may take several minutes

### Use cases
- Locate tables matching a name pattern across the entire tenant
- Count tables per lakehouse or workspace
- Identify duplicate or redundant tables
- Generate a full table inventory for governance and auditing
