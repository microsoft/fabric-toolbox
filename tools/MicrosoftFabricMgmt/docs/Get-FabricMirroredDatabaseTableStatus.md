# Get-FabricMirroredDatabaseTableStatus

## Overview

The `Get-FabricMirroredDatabaseTableStatus` function retrieves the mirroring status of all tables in a MirroredDatabase within a specified Microsoft Fabric workspace. It supports handling paginated API responses using continuation tokens for large datasets.

## Features

- Validates token expiration before making the API request.
- Dynamically constructs API URLs with optional continuation tokens for paginated responses.
- Retrieves data iteratively, adding all results to a consolidated list.
- Provides detailed logging for debugging and monitoring purposes.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace containing the MirroredDatabase.
- **Type:** String
- **Mandatory:** Yes

### MirroredDatabaseId

- **Description:** The unique identifier of the MirroredDatabase for which to retrieve table statuses.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Retrieve all table statuses for a specific MirroredDatabase

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$mirroredDatabase = Get-FabricMirroredDatabase -WorkspaceId $workspace.id -MirroredDatabaseName "WideWorldImportersDW"
Get-FabricMirroredDatabaseTableStatus -WorkspaceId $workspace.id -MirroredDatabaseId $mirroredDatabase.id
```

## Prerequisites

- Use the global configuration variable `$FabricConfig`, which must include:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.
- The `System.Web` assembly is loaded dynamically if not already available.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the base API URL using `WorkspaceId` and optionally `MirroredDatabaseId`.
3. Iterates through paginated responses using continuation tokens, consolidating results.
4. Logs detailed messages for debugging and operational clarity.
5. Returns a list of table mirroring statuses for the specified MirroredDatabase or all tables in the workspace.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.
- Captures and logs error details, including API response codes and continuation token updates.

## Author

**Tiago Balabuch**
