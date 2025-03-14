# Remove-FabricLakehouse

## Overview

The `Remove-FabricLakehouse` function sends a DELETE request to the Fabric API to remove a specified Lakehouse from a given workspace.

## Features

- Ensures token validity before making API requests.
- Constructs the API URL dynamically based on provided parameters.
- Handles responses and validates the response code.
- Logs errors in case of API request failure.

## Usage Examples

### Example 1: Delete a Lakehouse

```powershell
Remove-FabricLakehouse -WorkspaceId "12345" -LakehouseId "67890"
```

Deletes the Lakehouse with ID "67890" from workspace "12345".

## Parameters

### WorkspaceId

- **Description:** The ID of the workspace containing the Lakehouse to delete.
- **Type:** String
- **Mandatory:** Yes

### LakehouseId

- **Description:** The ID of the Lakehouse to be deleted.
- **Type:** String
- **Mandatory:** Yes

## Prerequisites

- Use the `Set-FabricApiHeaders` command to configure the global `$FabricConfig` variable, which must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- The `Test-TokenExpired` helper function ensures that the token is valid.

## Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl` and `WorkspaceId`, `LakehouseId`.
3. Sends a DELETE request to the API endpoint.
4. Handles both immediate responses (success or failure).

## Error Handling

- Logs descriptive error messages for invalid inputs or failed API requests.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**
