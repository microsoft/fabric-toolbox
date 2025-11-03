# Get-FabricMirroredDatabaseDefinition

## Overview

The `Get-FabricMirroredDatabaseDefinition` function retrieves the definition of a MirroredDatabase from a specific workspace in Microsoft Fabric. The function supports synchronous and asynchronous operations, ensuring detailed logging and error handling throughout the process.

## Features

- Validates token expiration before making the API request.
- Retrieves MirroredDatabase definitions either for a specific database or all databases in a workspace.
- Handles long-running operations asynchronously.
- Provides detailed logging and error handling for seamless operation.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace to query for MirroredDatabase definitions.
- **Type:** String
- **Mandatory:** Yes

### MirroredDatabaseId

- **Description:** The unique identifier of the MirroredDatabase to retrieve the definition for.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Get the definition of a specific MirroredDatabase

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$mirroredDatabase = Get-FabricMirroredDatabase -WorkspaceId $workspace.id -MirroredDatabaseName "WideWorldImportersDW"
Get-FabricMirroredDatabaseDefinition -WorkspaceId $workspace.id -MirroredDatabaseId $mirroredDatabase.id
```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.
- Long-running operations are managed using the `Get-FabricLongRunningOperation` and `Get-FabricLongRunningOperationResult` helper functions.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL for retrieving MirroredDatabase definitions.
3. Handles API responses, including synchronous (200 OK) and asynchronous (202 Accepted) operations.
4. Manages long-running operations and retrieves the result upon successful completion.
5. Provides descriptive logging for debugging and error handling.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Handles unexpected API response codes and logs detailed error information.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**
