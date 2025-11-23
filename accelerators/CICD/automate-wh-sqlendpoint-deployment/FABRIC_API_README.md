# Fabric API Integration for Warehouse Analysis

This project now includes integration with the Microsoft Fabric REST API to identify warehouses in a Fabric workspace.

## New Features

### 1. Fabric Workspace Analysis
- Lists all items in a specified Fabric workspace
- Identifies which items are warehouses vs other types
- Cross-references with dependency analysis results
- Shows warehouses that exist in Fabric but aren't referenced in dependencies
- Shows warehouses referenced in dependencies but not found in Fabric

### 2. New Command Line Parameter
```
--fabric-workspace-id <workspace-guid>
```

## Usage Examples

### Basic Usage (without Fabric analysis)
```powershell
.\AutomateWarehouseProject.exe --server "your-server.database.windows.net" --database "YourWarehouse" --working-dir "C:\temp\warehouse-build"
```

### With Fabric Workspace Analysis
```powershell
.\AutomateWarehouseProject.exe --server "your-server.database.windows.net" --database "YourWarehouse" --working-dir "C:\temp\warehouse-build" --fabric-workspace-id "12345678-1234-1234-1234-123456789abc"
```

## What the Fabric Analysis Shows

When you provide a `--fabric-workspace-id`, the tool will:

1. **List all items** in the Fabric workspace using a single call to `/v1/workspaces/{workspaceId}/items` API
2. **Filter and categorize** relevant items by type (locally, without additional API calls):
   - Regular warehouses (`Warehouse`)
   - Mirrored warehouses (`MirroredWarehouse`)  
   - Lakehouses (`Lakehouse`)
   - *All other item types are filtered out for efficiency*
3. **Cross-reference** with your dependency analysis:
   - ✅ **Common warehouses**: Found in both Fabric and your database dependencies
   - 🏭 **Fabric-only warehouses**: Exist in workspace but not referenced in your database
   - 🔗 **Dependency-only warehouses**: Referenced in your database but not found in workspace
   - 🏞️ **Lakehouses**: Listed for informational purposes

## Sample Output

```
==== Warehouse Project Builder ====
Source:  myserver.database.windows.net / MyWarehouse
Working: C:\temp\warehouse-build
Project: MyWarehouse
Fabric Workspace: 12345678-1234-1234-1234-123456789abc

== Step 1: Analyze Warehouse Dependencies ==
[Dependency analysis results...]

== Step 1.5: Analyze Fabric Workspace for Warehouses ==
🔍 Analyzing Fabric workspace for warehouses and lakehouses: 12345678-1234-1234-1234-123456789abc
   Recursive search: True
   Retrieved 25 items (Total so far: 25)
✅ Analysis complete. Found 3 warehouses, 1 mirrored warehouses, and 1 lakehouses from 25 total items.

==== Fabric Workspace Analysis Results ====
Total Items Found: 25
Warehouses: 3
Mirrored Warehouses: 1
Other Items: 21

📊 Warehouses:
  - SalesWarehouse (ID: aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee)
  - InventoryWarehouse (ID: bbbbbbbb-cccc-dddd-eeee-ffffffffffff)
  - AnalyticsWarehouse (ID: cccccccc-dddd-eeee-ffff-gggggggggggg)

🔄 Mirrored Warehouses:
  - ExternalDataWarehouse (ID: dddddddd-eeee-ffff-gggg-hhhhhhhhhhhh)

📋 Other Items (21):
  Lakehouse: 5 items
    - MainLakehouse
    - SalesLakehouse
    - ... and 3 more
  Notebook: 8 items
    - DataProcessingNotebook
    - AnalysisNotebook
    - ... and 6 more
  Report: 8 items
    - SalesDashboard
    - InventoryReport
    - ... and 6 more
==========================================

== Cross-referencing with Dependency Analysis ==
✅ Common warehouses (in both Fabric and dependencies): 2
   - InventoryWarehouse
   - SalesWarehouse

📊 Warehouses in Fabric workspace only: 2
   - AnalyticsWarehouse (not referenced in MyWarehouse)
   - ExternalDataWarehouse (not referenced in MyWarehouse)

🔗 Warehouses referenced in dependencies only: 1
   - LegacyWarehouse (not found in Fabric workspace)
=========================================
```

## API Details

The integration uses the Microsoft Fabric Core API:
- **Endpoint**: `GET https://api.fabric.microsoft.com/v1/workspaces/{workspaceId}/items`
- **Authentication**: Uses the same Azure CLI credentials as the existing SQL operations
- **Permissions Required**: `Workspace.Read.All` or `Workspace.ReadWrite.All`
- **Supported Item Types**: All Fabric item types, with special handling for:
  - `Warehouse` - Regular Fabric warehouses
  - `MirroredWarehouse` - Mirrored warehouses from external sources

## Error Handling

If the Fabric API call fails (e.g., invalid workspace ID, insufficient permissions), the tool will:
- Show a warning message
- Continue with the regular dependency-based analysis
- Not interrupt the overall warehouse processing workflow

This makes the Fabric integration optional and robust.