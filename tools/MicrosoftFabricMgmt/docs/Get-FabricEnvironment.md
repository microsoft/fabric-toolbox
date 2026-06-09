# Get-FabricEnvironment

## Overview

The `Get-FabricEnvironment` function sends a GET request to the Fabric API to retrieve environment details for a given workspace. It can filter the results by `EnvironmentName`.

## Features

- Retrieves environments from a specified workspace.
- Supports filtering environments by `EnvironmentId` or `EnvironmentName`.
- Handles pagination using continuation tokens.
- Logs detailed messages for debugging and error handling.

## Parameters

### WorkspaceId *(Required)*

- **Description:** The ID of the workspace to query environments.
- **Type:** String

### EnvironmentId *(Optional)*

- **Description:** The ID of a specific environment to retrieve.
- **Type:** String

### EnvironmentName *(Optional)*

- **Description:** The name of the specific environment to retrieve.
- **Type:** String

## Usage Examples

### Example 1: Get a list of environment list

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricEnvironment -WorkspaceId $workspace.id
```

### Example 2: Get an environment by Name

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricEnvironment -WorkspaceId $workspace.id -EnvironmentName "Env01"
```

### Example 3: Get an environment by Id

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricEnvironment -WorkspaceId $workspace.id -EnvironmentId "a94f2cfd-5fc2-46f5-9ef0-9ef5160af4bf"
```

## Prerequisites

- The global `$FabricConfig` variable must be configured with:
  - `BaseUrl`: The Fabric API base URL.
  - `FabricHeaders`: Authentication headers for the API.
- The `Test-TokenExpired` function should be implemented to validate token expiration.

## Key Workflow

1. Handles ambiguous input by ensuring only one of `EnvironmentId` or `EnvironmentName` is provided.
2. Validates token validity before making API requests.
3. Constructs the API endpoint URL with or without a continuation token.
4. Sends the GET request to the Fabric API and processes the response.
5. Uses pagination (continuation tokens) to retrieve all environments in the workspace.
6. Filters the results based on the provided parameters (`EnvironmentId` or `EnvironmentName`).
7. Logs detailed information about API requests, responses, and errors.

## Error Handling

- Captures and logs any errors encountered during the API request.
- Handles API response codes and returns `null` if an error occurs.

## Author

**Tiago Balabuch**  
