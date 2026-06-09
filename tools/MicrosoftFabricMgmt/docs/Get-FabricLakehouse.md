# Get-FabricLakehouse

## Overview

Retrieves a Lakehouse or a list of Lakehouses from a specified workspace in Microsoft Fabric.

## Description

The `Get-FabricLakehouse` function sends a GET request to the Fabric API to retrieve Lakehouse details for a given workspace. It can filter the results by `LakehouseName`.

## Parameters

### WorkspaceId

- **Description:** The ID of the workspace to query Lakehouses.
- **Type:** String
- **Mandatory:** Yes

### LakehouseName

- **Description:** (Optional) The name of the specific Lakehouse to retrieve.
- **Type:** String
- **Mandatory:** No

### LakehouseId

- **Description:** (Optional) The ID of the specific Lakehouse to retrieve.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Get a list of Lakehouse
```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricLakehouse -WorkspaceId $workspace.id
```

### Example 2: Get Lakehouse by Name

```powershell 
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricLakehouse -WorkspaceId $workspace.id -LakehouseName "LH01"
```

### Example 3: Get Lakehouse by Id

```powershell 
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricLakehouse -WorkspaceId $workspace.id -LakehouseId "8f64ee06-62c8-45c8-83ec-ea1a30f0fe89"
```

## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl` and `WorkspaceId`.
3. Sends a GET request to the Microsoft Fabric API.
4. Handles API responses:
   - `200`: Lakehouse(s) retrieved successfully.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Provides robust error logging to assist in debugging issues.

## Author

**Tiago Balabuch**
