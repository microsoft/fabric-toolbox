# Stop-FabricEnvironmentPublish

## Overview

Cancels the publish operation for a specified environment in Microsoft Fabric.

## Features

- Sends a cancel publish request to the Microsoft Fabric API.
- Validates token expiration before making the API request.
- Handles both successful and error responses.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the environment exists.
- **Type:** String
- **Mandatory:** Yes

### EnvironmentId

- **Description:** The unique identifier of the environment for which the publish operation is to be canceled.
- **Type:** String
- **Mandatory:** Yes

## Usage Examples

### Example 1: Cancels the publish operation for a specified environment

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$env = Get-FabricEnvironment -WorkspaceId $workspace.id -EnvironmentName "Env02"
Stop-FabricEnvironmentPublish -WorkspaceId $workspace.id -EnvironmentId $env.id
```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `EnvironmentId`.
3. Sends a POST request to cancel the publish operation.
4. Handles API responses to check for success or errors.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**  
