# Update-FabricMirroredDatabase

## Overview

Updates the properties of a Fabric MirroredDatabase by making a PATCH request to the Fabric API.

## Features

- Sends a PATCH request to update the name and/or description of a MirroredDatabase.
- Validates token expiration before making the API request.
- Logs detailed messages for debugging and error handling.

## Parameters

### WorkspaceId *(Mandatory)*

- **Description:** The ID of the workspace containing the MirroredDatabase to be updated.
- **Type:** String

### MirroredDatabaseId *(Mandatory)*

- **Description:** The unique identifier of the MirroredDatabase to be updated.
- **Type:** String

### MirroredDatabaseName *(Mandatory)*

- **Description:** The new name for the MirroredDatabase.
- **Type:** String

### MirroredDatabaseDescription *(Optional)*

- **Description:** The new description for the MirroredDatabase (optional).
- **Type:** String

## Usage Examples

### Example 1: Updating the name of a MirroredDatabase

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$mirroredDatabase = Get-FabricMirroredDatabase -WorkspaceId $workspace.id -MirroredDatabaseName "WideWorldImportersDW"
Update-FabricMirroredDatabase -WorkspaceId $workspace.id -MirroredDatabaseId $mirroredDatabase.id -MirroredDatabaseName "WideWorldImportersDWUpdated" -MirroredDatabaseDescription "WideWorldImportersDW Updated"
```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates token validity before making the API request.
2. Constructs the API URL using the provided `WorkspaceId` and `MirroredDatabaseId`.
3. Creates the PATCH request body, including new name and optional description.
4. Sends the PATCH request to the Fabric API.
5. Logs the success or error messages based on the API response.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**