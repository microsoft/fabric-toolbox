# Remove-FabricKQLQueryset

## Overview

Deletes a KQLQueryset from a specified Microsoft Fabric workspace by sending a DELETE request to the Microsoft Fabric API.

## Features

- Sends a DELETE request to remove a specified KQLQueryset.
- Validates token expiration before making the API request.
- Handles API responses with detailed error logging.

## Parameters

### WorkspaceId

- **Description:** The ID of the workspace containing the KQLQueryset to delete.
- **Type:** String
- **Mandatory:** Yes

### KQLQuerysetId

- **Description:** The ID of the KQLQueryset to be deleted.
- **Type:** String
- **Mandatory:** Yes

## Usage Examples

### Example 1: Remove a KQL Query set

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$KQLQueryset = Get-FabricKQLQueryset -WorkspaceId $workspace.id -KQLQuerysetName "KQLQuery-12345"
Remove-FabricKQLQueryset -WorkspaceId $workspace.id -KQLQuerysetId $KQLQueryset.id
```

## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl` and `WorkspaceId` and `KQLQuerysetId`.
3. Sends a DELETE request to the Microsoft Fabric API.
4. Handles API responses:
   - `200`: KQLQueryset deleted successfully.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Provides robust error logging to assist in debugging issues.

## Author

**Tiago Balabuch**