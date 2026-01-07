# Get-FabricLakehouseTable

## Overview

Retrieves tables from a specific Lakehouse in Microsoft Fabric.

## Description

The `Get-FabricLakehouseTable` function sends a GET request to the Fabric API to retrieve table details for a specified Lakehouse within a workspace. It handles pagination using continuation tokens to retrieve all available tables.

## Features

- Ensures token validity before making API requests.
- Constructs the API URL dynamically based on provided parameters.
- Handles responses and validates the response code.
- Logs errors in case of API request failure.
  
## Parameters

### WorkspaceId

- **Description:** The ID of the workspace where the Lakehouse resides.
- **Type:** String
- **Mandatory:** Yes

### LakehouseId

- **Description:** The ID of the Lakehouse from which to retrieve tables.
- **Type:** String
- **Mandatory:** Yes

## Usage Examples

### Example 1: Retrieve tables from a specific Lakehouse

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$lakehouse = Get-FabricLakehouse -WorkspaceId $workspace.id -LakehouseName "lakehouse-12345"
Get-FabricLakehouseTable -WorkspaceId $workspace.id -LakehouseId $lakehouse.id
```

Retrieves all tables from Lakehouse with ID "67890" in workspace "12345".

## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `LakehouseId`.
3. Sends a GET request to the Microsoft Fabric API.
4. Handles API responses:
   - `200`: Tables retrieved successfully.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs detailed error messages for API failures or invalid inputs.
- Provides robust error logging to assist in debugging issues.

## Author

**Tiago Balabuch**
