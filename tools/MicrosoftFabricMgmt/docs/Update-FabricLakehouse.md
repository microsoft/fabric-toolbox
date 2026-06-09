# Update-FabricLakehouse

## Overview

The `Update-FabricLakehouse` function updates the name and/or description of a specified Fabric Lakehouse by making a PATCH request to the API.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace containing the Lakehouse.
- **Type:** String
- **Mandatory:** Yes

### LakehouseId

- **Description:** The unique identifier of the Lakehouse to be updated.
- **Type:** String
- **Mandatory:** Yes

### LakehouseName

- **Description:** The new name for the Lakehouse.
- **Type:** String
- **Mandatory:** Yes

### LakehouseDescription

- **Description:** An optional description for the Lakehouse.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Update a Lakehouse Name

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$lakehouse = Get-FabricLakehouse -WorkspaceId $workspace.id -LakehouseName "Lakehouse-12345"
Update-FabricLakehouse -WorkspaceId $workspace.id -LakehouseId $lakehouse.id -LakehouseName "NewLakehouseName"
```

## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `LakehouseId`.
3. Constructs the JSON request body with optional description.
4. Sends a PATCH request to the Microsoft Fabric API.
5. Handles API responses:
   - `200`: Lakehouse updated successfully.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Provides robust error logging to assist in debugging issues.

## Author

**Tiago Balabuch**