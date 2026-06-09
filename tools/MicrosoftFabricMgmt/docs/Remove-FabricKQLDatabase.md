# Remove-FabricKQLDatabase

## Overview

Deletes a KQLDatabase from a specified Microsoft Fabric workspace by sending a DELETE request to the Microsoft Fabric API.

## Features

- Sends a DELETE request to remove a specified KQLDatabase.
- Validates token expiration before making the API request.
- Handles API responses with detailed error logging.

## Parameters

### WorkspaceId

- **Description:** The ID of the workspace containing the KQLDatabase to delete.
- **Type:** String
- **Mandatory:** Yes

### KQLDatabaseId

- **Description:** The ID of the KQLDatabase to be deleted.
- **Type:** String
- **Mandatory:** Yes

## Usage Examples

### Example 1: Remove a KQL Database

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$kqlDatabase = Get-FabricKqlDatabase -WorkspaceId $workspace.id -KqlDatabaseName "KQLDB-12345"
Remove-FabricKqlDatabase -WorkspaceId $workspace.id -KqlDatabaseId $kqlDatabase.id
```

## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl` and `WorkspaceId` and `KQLDatabaseId`.
3. Sends a DELETE request to the Microsoft Fabric API.
4. Handles API responses:
   - `200`: KQLDatabase deleted successfully.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Provides robust error logging to assist in debugging issues.

## Author

**Tiago Balabuch**