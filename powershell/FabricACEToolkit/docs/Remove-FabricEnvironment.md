# Remove-FabricEnvironment

## Overview

Deletes an environment from a specified workspace in Microsoft Fabric.

## Features

- Sends a delete request to remove the environment.
- Validates token expiration before making the API request.
- Logs detailed messages for debugging and error handling.

## Parameters

### WorkspaceId *(Mandatory)*

- **Description:** The ID of the workspace containing the environment to delete.
- **Type:** String

### EnvironmentId *(Mandatory)*

- **Description:** The ID of the environment to be deleted.
- **Type:** String

## Usage Examples

### Example 1: Creating a new environment

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$env = Get-FabricEnvironment -WorkspaceId $workspace.id -EnvironmentName "Env02" 
Remove-FabricEnvironment -WorkspaceId $workspace.id -EnvironmentId $env.id
```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates that only one input parameter (`capacityId` or `capacityName`) is provided.
2. Ensures the authentication token is valid.
3. Retrieves capacities via the Fabric API, handling paginated responses automatically.
4. Filters results based on provided criteria or returns all capacities if no filters are applied.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**
