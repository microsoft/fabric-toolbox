# Get-FabricMirroredWarehouse

## Overview

Retrieves a MirroredWarehouse or a list of MirroredWarehouses from a specified workspace in Microsoft Fabric.

## Description

The `Get-FabricMirroredWarehouse` function sends a GET request to the Fabric API to retrieve MirroredWarehouse details for a given workspace. It can filter the results by `MirroredWarehouseName`.

## Parameters

### WorkspaceId

- **Description:** The ID of the workspace to query MirroredWarehouses.
- **Type:** String
- **Mandatory:** Yes

### MirroredWarehouseName

- **Description:** (Optional) The name of the specific MirroredWarehouse to retrieve.
- **Type:** String
- **Mandatory:** No

### MirroredWarehouseId

- **Description:** (Optional) The ID of the specific MirroredWarehouse to retrieve.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Retrieve a MirroredWarehouse by Name

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricMirroredWarehouse -WorkspaceId $workspace.id
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
   - `200`: MirroredWarehouse(s) retrieved successfully.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Provides robust error logging to assist in debugging issues.

## Author

**Tiago Balabuch**