# Get-FabricMirroredDatabaseStatus

## Overview

The `Get-FabricMirroredDatabaseStatus` function retrieves the mirroring status of a MirroredDatabase from a specified Microsoft Fabric workspace. It supports retrieving the status of all databases in the workspace or a specific database using its unique identifier.

## Features

- Validates token expiration before making the API request.
- Constructs the API URL dynamically based on provided parameters.
- Handles API responses and logs detailed information for debugging.
- Provides error handling with descriptive messages for operational clarity.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace containing the MirroredDatabase.
- **Type:** String
- **Mandatory:** Yes

### MirroredDatabaseId

- **Description:** The unique identifier of the MirroredDatabase for which to retrieve the status.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Retrieve the status of a specific MirroredDatabase

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$mirroredDatabase = Get-FabricMirroredDatabase -WorkspaceId $workspace.id -MirroredDatabaseName "WideWorldImportersDW"
Get-FabricMirroredDatabaseStatus -WorkspaceId $workspace.id -MirroredDatabaseId $mirroredDatabase.id
```

## Prerequisites

- Use the global configuration variable `$FabricConfig`, which must include:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using the `WorkspaceId` and optionally the `MirroredDatabaseId`.
3. Sends an API request to retrieve the mirroring status.
4. Processes the API response, ensuring valid status codes and handling errors.
5. Logs detailed messages for debugging and operational clarity.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**
