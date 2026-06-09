# Remove-FabricSparkCustomPool

## Overview

Deletes a Spark custom pool from a specified Microsoft Fabric workspace.

## Features

- Sends a DELETE request to remove the Spark custom pool.
- Validates token expiration before making the API request.
- Logs detailed messages for debugging and error handling.

## Parameters

### WorkspaceId *(Mandatory)*

- **Description:** The unique identifier of the workspace containing the Spark custom pool to delete.
- **Type:** String

### SparkCustomPoolId *(Mandatory)*

- **Description:** The unique identifier of the Spark custom pool to be deleted.
- **Type:** String

## Usage Examples

### Example 1: Removing a Spark custom pool

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$pool = Get-FabricSparkCustomPool -WorkspaceId $workspace.id -SparkCustomPoolName "MyCustomPool"
Remove-FabricSparkCustomPool -WorkspaceId $workspace.id -SparkCustomPoolId $pool.id
```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set the global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token's validity using `Test-TokenExpired`.
2. Constructs the API URL for the DELETE request using the provided parameters.
3. Sends the DELETE request to remove the specified Spark custom pool.
4. Logs detailed responses and errors for debugging purposes.

## Error Handling

- Logs descriptive error messages if the API request fails or invalid input is detected.
- Returns `null` if an error occurs during execution.

## Author

**Tiago Balabuch**