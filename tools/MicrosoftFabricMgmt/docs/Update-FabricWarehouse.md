# Update-FabricWarehouse

## Overview

The `Update-FabricWarehouse` function updates an existing warehouse in a specified Microsoft Fabric workspace by sending a PATCH request to the Microsoft Fabric API. It allows modifications to the warehouse's name and description.

## Features

- Validates the token using `Test-TokenExpired` before making the API request.
- Allows updates to the warehouse's name (mandatory) and description (optional).
- Provides detailed logging for debugging and error handling.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the warehouse exists.
- **Type:** String
- **Mandatory:** Yes

### WarehouseId

- **Description:** The unique identifier of the warehouse to be updated.
- **Type:** String
- **Mandatory:** Yes

### WarehouseName

- **Description:** The new name of the warehouse.
- **Type:** String
- **Mandatory:** Yes
- **Validation:** Only allows alphanumeric characters, spaces, and underscores.

### WarehouseDescription

- **Description:** An optional new description for the warehouse.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Update a Warehouse

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$warehouse = Get-FabricWarehouse -WorkspaceId $workspace.id -WarehouseName "warehouse-67890"
Update-FabricWarehouse -WorkspaceId $workspace.id -WarehouseId $warehouse.id -WarehouseName "warehouse-67890 Updated" -WarehouseDescription "Warehouse Updated"
```

## Prerequisites

- The global `$FabricConfig` variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- The `Test-TokenExpired` function must be implemented to validate token expiry.

## Workflow

1. Validates the token using `Test-TokenExpired`.
2. Constructs the API URL based on `WorkspaceId` and `WarehouseId`.
3. Builds the request body in JSON format, including mandatory and optional parameters.
4. Sends a PATCH request to the API endpoint with the constructed JSON body.
5. Handles API responses and logs messages for debugging or error handling.

## Error Handling

- Logs detailed error messages for invalid inputs or failed API requests.
- Returns `null` if the API response code is not `200`.

## Author

**Tiago Balabuch**