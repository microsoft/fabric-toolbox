# New-FabricWarehouse

## Overview

The `New-FabricWarehouse` function creates a new warehouse within a specified Microsoft Fabric workspace. This function simplifies the integration of data storage and management by setting up a warehouse with options for providing descriptions.

## Description

This function sends a POST request to the Microsoft Fabric API to create a new warehouse in the given workspace. It supports optional parameters for adding descriptions. The function handles token validation, API request construction, and error handling.

## Features

- Ensures token validity before making API requests.
- Dynamically constructs the API URL based on provided parameters.
- Supports adding an optional description for the warehouse.
- Handles responses and validates the response code.
- Logs errors in case of API request failure.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the warehouse will be created.
- **Type:** String
- **Mandatory:** Yes

### WarehouseName

- **Description:** The name of the warehouse to be created.
- **Type:** String
- **Mandatory:** Yes
- **Validation:** Only alphanumeric characters, spaces, and underscores are allowed.

### WarehouseDescription

- **Description:** An optional description for the warehouse.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Create a warehouse

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
New-FabricWarehouse -WorkspaceId $workspace.id  -WarehouseName "New Warehouse"
```

### Example 2: Create a warehouse with a description

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
New-FabricWarehouse -WorkspaceId $workspace.id  -WarehouseName "New Warehouse" -WarehouseDescription "Description of the new warehouse"
```

## Prerequisites

- Ensure that `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`, is correctly configured with the required authentication details.
- Token validation should be handled using `Test-TokenExpired`.

## Key Workflow

1. Validates the token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl` and `WorkspaceId`.
3. Prepares the request body with warehouse details and optional description.
4. Sends the POST request to the Microsoft Fabric API to create the warehouse.
5. Handles API responses, including long-running operations and retries.

## Error Handling

- The function logs errors at different stages, such as validation failures, API response errors, and unexpected statuses.
- Comprehensive error handling is included to assist in debugging.

## Author

**Tiago Balabuch**