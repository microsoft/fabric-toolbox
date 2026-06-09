# Remove-FabricWarehouse

## Overview

Deletes a warehouse from a specified workspace in Microsoft Fabric.

## Features

- Sends a DELETE request to remove the warehouse.
- Validates token expiration before making the API request.
- Logs detailed messages for debugging and error handling.

## Parameters

### WorkspaceId *(Mandatory)*

- **Description:** The unique identifier of the workspace from which the warehouse will be removed.
- **Type:** String

### WarehouseId *(Mandatory)*

- **Description:** The unique identifier of the warehouse to be removed.
- **Type:** String

## Usage Examples

### Example 1: Removing a Warehouse

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$warehouse = Get-FabricWarehouse -WorkspaceId $workspace.id -WarehouseName "warehouse-67890"
Remove-FabricWarehouse -WorkspaceId $workspace.id -WarehouseId $warehouse.id

```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set the global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token's validity using `Test-TokenExpired`.
2. Constructs the API URL for the DELETE request using the provided parameters.
3. Sends the DELETE request to remove the specified warehouse.
4. Logs detailed responses and errors for debugging purposes.

## Error Handling

- Logs descriptive error messages if the API request fails or invalid input is detected.
- Returns `null` if an error occurs during execution.

## Author

**Tiago Balabuch**