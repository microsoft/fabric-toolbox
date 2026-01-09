# Get-FabricMirroredDatabase

## Overview

The `Get-FabricMirroredDatabase` function retrieves MirroredDatabase details from a specified Microsoft Fabric workspace. It supports filtering by either `MirroredDatabaseId` or `MirroredDatabaseName`.

## Features

- Validates token expiration before making the API request.
- Handles ambiguous input by ensuring only one filter parameter is specified.
- Supports paginated API responses using continuation tokens.
- Provides detailed error handling and descriptive logging.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace to query MirroredDatabases.
- **Type:** String
- **Mandatory:** Yes

### MirroredDatabaseId

- **Description:** The unique identifier of the MirroredDatabase to retrieve.
- **Type:** String
- **Mandatory:** No

### MirroredDatabaseName

- **Description:** The name of the MirroredDatabase to retrieve.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Retrieve all MirroredDatabases in a workspace

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricMirroredDatabase -WorkspaceId $workspace.id
```

### Example 2: Retrieve a specific MirroredDatabase by name

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricMirroredDatabase -WorkspaceId $workspace.id -Debug -MirroredDatabaseName "WideWorldImportersDW"
```

### Example 2: Retrieve a specific MirroredDatabase by id

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricMirroredDatabase -WorkspaceId $workspace.id -Debug -MirroredDatabaseId "7c3d98fb-8b60-4924-8e15-24212a7a8356"
```

## Prerequisites

- Use the global configuration variable `$FabricConfig`, which must include:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Ensures only one filter (`MirroredDatabaseId` or `MirroredDatabaseName`) is provided.
2. Validates the authentication token using `Test-TokenExpired`.
3. Constructs the API URL and retrieves MirroredDatabase details using paginated responses if needed.
4. Filters the response data based on the provided parameters.
5. Logs descriptive messages for debugging and error handling.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**
