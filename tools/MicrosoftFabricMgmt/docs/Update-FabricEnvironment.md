# Update-FabricEnvironment

## Overview

The `Update-FabricEnvironment` function updates the name and/or description of a specified Fabric Environment by making a PATCH request to the API.

## Features

- Validates token expiration before making the API request.
- Constructs and sends a PATCH request to update the environment properties.
- Handles both successful and error responses.

## Parameters

### EnvironmentId

- **Description:** The unique identifier of the Environment to be updated.
- **Type:** String
- **Mandatory:** Yes

### EnvironmentName

- **Description:** The new name for the Environment.
- **Type:** String
- **Mandatory:** Yes

### EnvironmentDescription

- **Description:** (Optional) The new description for the Environment.
- **Type:** String

## Usage Examples

### Example 1: Updates the name and/or description of a specified Fabric Environment

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$env = Get-FabricEnvironment -WorkspaceId $workspace.id -EnvironmentName "Env02"
Update-FabricEnvironment -WorkspaceId $workspace.id -EnvironmentId $env.id -EnvironmentName "Env02 Updated" -EnvironmentDescription "Development Environment Updated"
```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `EnvironmentId`.
3. Builds the request body with new name and optionally the description.
4. Sends a PATCH request to update the environment.
5. Validates the API response and handles results accordingly.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**  
