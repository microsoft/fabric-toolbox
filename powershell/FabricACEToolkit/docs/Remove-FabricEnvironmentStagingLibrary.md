# Remove-FabricEnvironmentStagingLibrary

## Overview

Deletes a specified library from the staging environment in a Microsoft Fabric workspace.

## Features

- Sends a delete request to remove the library.
- Validates token expiration before making the API request.
- Logs detailed messages for debugging and error handling.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace from which the library is to be deleted.
- **Type:** String
- **Mandatory:** Yes

### EnvironmentId

- **Description:** The unique identifier of the staging environment containing the library.
- **Type:** String
- **Mandatory:** Yes

### LibraryName

- **Description:** The name of the library to be deleted from the environment.
- **Type:** String
- **Mandatory:** Yes

## Usage Examples

### Example 1: Creating a new environment

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$env = Get-FabricEnvironment -WorkspaceId $workspace.id -EnvironmentName "Env02"
Remove-FabricEnvironmentStagingLibrary -WorkspaceId $workspace.id -EnvironmentId $env.id -LibraryName "somelibrary.whl"
```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates that only one input parameter (`capacityId` or `capacityName`) is provided.
2. Ensures the authentication token is valid.
3. Constructs the API URL using `BaseUrl`, `WorkspaceId`, `EnvironmentId`, and `LibraryName`.
4. Sends a DELETE request to remove the library from the staging environment.
5. Handles the API response to check for success or error.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**  
