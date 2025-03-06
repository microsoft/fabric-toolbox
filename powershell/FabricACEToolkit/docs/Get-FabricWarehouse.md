# Get-FabricWarehouse

## Overview

The `Get-FabricWarehouse` function retrieves warehouse details from a specified Microsoft Fabric workspace using either the provided WarehouseId or WarehouseName.

## Features

- Validates token expiration before making the API request.
- Supports retrieval by Warehouse ID or name.
- Handles paginated API responses using continuation tokens.
- Provides error handling and descriptive logging.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the warehouse exists.
- **Type:** String
- **Mandatory:** Yes

### WarehouseId

- **Description:** The unique identifier of the warehouse to retrieve.
- **Type:** String
- **Mandatory:** No

### WarehouseName

- **Description:** The name of the warehouse to retrieve.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Get a list of Warehouses

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricWarehouse -WorkspaceId $workspace.id
```

### Example 2: Get a Warehouse by name

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricWarehouse -WorkspaceId $workspace.id -WarehouseName "My Warehouse"
```

### Example 3: Get a Warehouse by ID

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricWarehouse -WorkspaceId $workspace.id -WarehouseId "12345-67890"
```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set the global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Ensures only one filter (`WarehouseId` or `WarehouseName`) is provided.
2. Validates the authentication token using `Test-TokenExpired`.
3. Constructs the API URL and retrieves Warehouse details using paginated responses if needed.
4. Filters the response data based on the provided parameters.
5. Logs descriptive messages for debugging and error handling.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**
