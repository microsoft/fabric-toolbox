# Fabric SQL Schema Extraction & CI/CD Pipeline

## What Is This?

Automated Azure Data Factory/Fabric SQL schema extraction, DACPAC compilation, and multi-environment deployment pipeline. This solution demonstrates enterprise patterns for managing SQL projects across Fabric workspaces with dependency resolution and cross-database reference handling.

## Architecture

```
Fabric Lakehouses  →  SqlPackage  →  Extract SQL Schemas  →  Auto-Detect Dependencies
       ↓                                        ↓
    [SQL Queries]                    [.sql files + .sqlproj]
                                               ↓
                        ┌───────────────────────────────────┐
                        │  topological-sort dependency order │
                        └───────────────────────────────────┘
                                      ↓
                   [Build Lakehouse DACPACs in Order]
                                      ↓
                ┌──────────────────────────────────────┐
                │  Scan for Cross-Database References  │
                │  [DB].[schema].[object] Regex Match  │
                └──────────────────────────────────────┘
                                      ↓
              [Auto-Inject ArtifactReferences]
                                      ↓
                   [Build Warehouse DACPAC]
                                      ↓
          [Publish to DevOps → Test → Prod]
```

## How It Works

1. **Extract** - SqlPackage extracts SQL schemas from Fabric lakehouses into folder structures
2. **Scan** - PowerShell regex scans SQL files for cross-database reference patterns `[DB].[schema].[object]`
3. **Inject** - Auto-generates ArtifactReference XML elements for DACPAC resolving
4. **Build** - dotnet build compiles projects in topological order; warehouses depend on lakehouses
5. **Publish** - SqlPackage deploys DACPACs to target environments

## Setup

### Prerequisites
- Azure Pipelines with SPN credentials (aztenantid, azclientid, azspsecret)
- Fabric workspace IDs and SQL endpoints for each environment
- .NET 8.x SDK (installed by pipeline)
- SqlPackage (installed by pipeline)

### Key Files
- `.pipeline/Deploy-To-Fabric.yml` - Main CI/CD orchestration (598 lines)
- `.deploy/extract-lakehouse-schema.ps1` - Schema extraction with auto-dependency detection (536 lines)
- `.deploy/deploy-to-fabric.py` - Fabric workspace discovery and SQL endpoint enumeration (328 lines)
- `lakehouse-schema/*/` - Extracted SQL project structures
- `fabric/*/Warehouse/` - Warehouse project definitions

## Test Objects

Use the consolidated scripts in `.test/` to create dependency test objects quickly by server type:

- `.test/lakehouse-test-objects.sql` - Creates lakehouse test objects (view, stored procedure, scalar function, table-valued function) in `DemoLakehouse_Shortcut` with both cross-database dependencies on `DemoLakehouse` (3-part names) and same-database references (2-part names)
- `.test/warehouse-test-objects.sql` - Creates warehouse test objects (view, stored procedure, scalar function, table-valued function) in `DemoWarehouse` with cross-database dependencies on `DemoLakehouse` and `DemoLakehouse_Shortcut`

**Note on Scalar Functions:** Fabric/Data Warehouse does not support scalar functions (SQL70015 error). The test scripts include them for documentation purposes, but the extraction process automatically filters and skips scalar functions to prevent build failures.

Reference naming rule used by these scripts:
- Use 3-part names `[Database].[schema].[object]` for cross-database references
- Use 2-part names `[schema].[object]` for same-database references

### Parameters
- `items_in_scope` - Controls which Fabric item types to deploy (default: all 7 types)

Environment variables from variable groups:
- `Fabric_Deployment_Group_S` - SPN credentials from Key Vault
- `Fabric_Deployment_Group_DWFeature_NS` - Workspace names per environment

## Learning Focus: Defensive Coding Patterns

This solution implements defensive SQL/XML handling practices that prevent common CI/CD failures:

### Cross-Platform Path Handling
- **Issue:** PowerShell `-like "*\lakehouse-schema\*"` fails on Linux agents (backslash treated as escape)
- **Solution:** Use regex `-match '[\\/]lakehouse-schema[\\/]'` accepting both `/` and `\` separators
- **Location:** [extract-lakehouse-schema.ps1](extract-lakehouse-schema.ps1) (lines 330-333, 394-397)

### XML NULL Safety
- **Issue:** Direct property enumeration `$itemGroup.ArtifactReference` returns null when empty, causing RemoveChild($null) to crash
- **Solution:** Use XPath `.SelectNodes("./ArtifactReference")` which returns empty collection, not null
- **Location:** [extract-lakehouse-schema.ps1](extract-lakehouse-schema.ps1) (lines 402-407)

### DACPAC Model Caching
- **Issue:** Explicit `<Compile>` items in .sqlproj cause SDK to treat SQL files as C# source
- **Solution:** Remove explicit Compile items; SDK auto-discovers .sql files correctly
- **Location:** [fabric/DemoWarehouse.Warehouse/DemoWarehouse.sqlproj](fabric/DemoWarehouse.Warehouse/DemoWarehouse.sqlproj)

### Object Reference Syntax
- **Issue:** Three-part names `[DemoWarehouse].[dbo].[Diabetes]` for same-database objects fail resolution
- **Solution:** Use two-part names `[dbo].[Diabetes]` for local objects; three-part only for cross-database
- **Location:** [fabric/DemoWarehouse.Warehouse/dbo/Views/vw_CrossJoin.sql](fabric/DemoWarehouse.Warehouse/dbo/Views/vw_CrossJoin.sql)

## Troubleshooting

### SQL71561: Unresolved References
- **Cause:** ArtifactReference missing or DACPAC path incorrect
- **Fix:** Check extract-lakehouse-schema.ps1 output for "No ArtifactReference entries"; verify relative paths use `/` not `\`

### SQL46010: Incorrect Syntax near '-'
- **Cause:** Malformed comment lines (single `-` instead of `--`) in SQL files
- **Fix:** SqlPackage extraction sometimes corrupts comments; verify .sql files have valid `--` markers

### Build Dependency Cycle Detected
- **Cause:** Topological sort array handling; scalar returned instead of array
- **Fix:** Ensure all sort functions wrap output with `@()` array forcing

## Contributing

This is an educational template demonstrating:
- Automated cross-platform SQL project discovery
- DACPAC-based multi-environment deployment
- Defensive PowerShell/XML handling for fragile build environments
- Dependency resolution without explicit configuration

The 6+ recent fixes documented inline prevent common SQL Server Data Tools (SSDT) and Microsoft.Build.Sql pitfalls.