# Start-FabricLakehouseTableMaintenance

## Overview

The `Start-FabricLakehouseTableMaintenance` function sends a POST request to the Fabric API to start a table maintenance job in a specified Lakehouse within a given workspace. It allows customization of the job through parameters like schema, table names, optimization settings, and retention periods.

## Features

- Ensures token validity before making API requests.
- Constructs the API URL dynamically based on provided parameters.
- Supports table maintenance with schema, VOrder optimization, ZOrder optimization, and retention period.
- Handles responses, including long-running operations.

## Parameters

### WorkspaceId

- **Description:** The ID of the workspace containing the Lakehouse where the table maintenance job will be started.
- **Type:** String
- **Mandatory:** Yes

### LakehouseId

- **Description:** The ID of the Lakehouse where the table maintenance job will be applied.
- **Type:** String
- **Mandatory:** Yes

### JobType

- **Description:** The type of job to be started. Defaults to "TableMaintenance".
- **Type:** String
- **Mandatory:** No
- **Default Value:** "TableMaintenance"

### SchemaName

- **Description:** Optional schema name within the Lakehouse where table maintenance will be applied. Required if the Lakehouse has schema enabled.
- **Type:** String
- **Mandatory:** No

### TableName

- **Description:** Optional table name where table maintenance will be applied.
- **Type:** String
- **Mandatory:** No

### IsVOrder

- **Description:** Optional flag to enable VOrder optimization.
- **Type:** Boolean
- **Mandatory:** No

### ColumnsZOrderBy

- **Description:** Optional columns to apply ZOrder optimization, comma-separated.
- **Type:** String or Array
- **Mandatory:** No

### retentionPeriod

- **Description:** Optional retention period for vacuuming the table, formatted as "days:hours:minutes".
- **Type:** String
- **Mandatory:** No

### waitForCompletion

- **Description:** Optional flag to indicate if the function should wait for the operation to complete.
- **Type:** Boolean
- **Mandatory:** No
- **Default Value:** $false

## Usage Examples

### Example 1: Start table maintenance withouth waiting for completion
```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$lakehouse = Get-FabricLakehouse -WorkspaceId $workspace.id -LakehouseName "Lakehouse-12345"
Start-FabricLakehouseTableMaintenance -WorkspaceId $workspace.id -LakehouseId $lakehouse.id -TableName "Table01" -Debug

### Example 2: Start table maintenance with optimize enabled and vacuum disabled and wait for completion
```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$lakehouse = Get-FabricLakehouse -WorkspaceId $workspace.id -LakehouseName "Lakehouse-12345"
Start-FabricLakehouseTableMaintenance -WorkspaceId $workspace.id -LakehouseId $lakehouse.id -TableName "Table01" -waitForCompletion $true -Debug

### Example 3: Start table maintenance with optimize and V-Order enabled and vacuum disabled
```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$lakehouse = Get-FabricLakehouse -WorkspaceId $workspace.id -LakehouseName "Lakehouse-12345"
Start-FabricLakehouseTableMaintenance `
-WorkspaceId $workspace.id `
-LakehouseId $lakehouse.id `
-TableName "Table01" `
-IsVOrder $true `
-waitForCompletion $false -Debug

### Example 4: Start table maintenance with optimize, V-Order and Z-Order with columns enabled and vacuum disabled 
```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$lakehouse = Get-FabricLakehouse -WorkspaceId $workspace.id -LakehouseName "Lakehouse-12345"
Start-FabricLakehouseTableMaintenance `
-WorkspaceId $workspace.id `
-LakehouseId $lakehouse.id `
-TableName "Table01" `
-ColumnsZOrderBy @("id", "nome") `
-waitForCompletion $false -Debug

### Example 5: Different way to pass ColumnsZOrderBy parameter
```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$lakehouse = Get-FabricLakehouse -WorkspaceId $workspace.id -LakehouseName "Lakehouse-12345"
Start-FabricLakehouseTableMaintenance `
-WorkspaceId $workspace.id `
-LakehouseId $lakehouse.id `
-TableName "Table05" `
-IsVOrder $true `
-ColumnsZOrderBy "id,nome" `
-waitForCompletion $false -Debug

### Example 6: Start table maintenance with optimize and Vaccum enabled. Retention Period must have this pattern: d:hh:mm:ss
```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$lakehouse = Get-FabricLakehouse -WorkspaceId $workspace.id -LakehouseName "Lakehouse-12345"
Start-FabricLakehouseTableMaintenance `
-WorkspaceId $workspace.id `
-LakehouseId $lakehouse.id `
-TableName "Table01" `
-retentionPeriod "1:00:00:00" `
-waitForCompletion $false -Debug

### Example 7: Start table maintenance with all options. Retention Period must have this pattern: d:hh:mm:ss
```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$lakehouse = Get-FabricLakehouse -WorkspaceId $workspace.id -LakehouseName "Lakehouse-12345"
Start-FabricLakehouseTableMaintenance `
-WorkspaceId $workspace.id `
-LakehouseId $lakehouse.id `
-SchemaName "dbo" `
-TableName "Table01" `
-IsVOrder $true `
-ColumnsZOrderBy @("id", "nome") `
-retentionPeriod "1:00:00:00" `
-waitForCompletion $false -Debug 


## Prerequisites

- Use the `Set-FabricApiHeaders` command to configure the global `$FabricConfig` variable, which must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- The `Test-TokenExpired` helper function ensures that the token is valid.

## Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Retrieves the Lakehouse information using `Get-FabricLakehouse` to check if schema is enabled.
3. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `LakehouseId`.
4. Builds a request body with optional schema, table names, VOrder, ZOrder, and retention period.
5. Sends a POST request to the API endpoint.
6. Handles both immediate responses (success or failure) and long-running operations.

## Error Handling

- Logs descriptive error messages for invalid inputs or failed API requests.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**
