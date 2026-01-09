# Start-FabricMirroredDatabaseMirroring

## Overview

Initiates the mirroring process for a MirroredDatabase in a specified workspace in Microsoft Fabric.

## Features

- Sends a POST request to start mirroring of the MirroredDatabase.
- Validates token expiration before making the API request.
- Logs detailed messages for debugging and error handling.

## Parameters

### WorkspaceId *(Mandatory)*

- **Description:** The ID of the workspace containing the MirroredDatabase to start mirroring.
- **Type:** String

### MirroredDatabaseId *(Optional)*

- **Description:** The ID of the MirroredDatabase to initiate the mirroring process. This parameter is optional.
- **Type:** String

## Usage Examples

### Example 1: Starting mirroring for a specific MirroredDatabase

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$mirroredDatabase = Get-FabricMirroredDatabase -WorkspaceId $workspace.id -MirroredDatabaseName "WideWorldImportersDW"
Start-FabricMirroredDatabaseMirroring -WorkspaceId $workspace.id -MirroredDatabaseId $mirroredDatabase.id
```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set the global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates that the token is valid before making the API request.
2. Constructs the API URL using the provided `WorkspaceId` and optionally `MirroredDatabaseId`.
3. Sends the POST request to start mirroring via the Fabric API.
4. Logs the success or error messages based on the API response.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**
