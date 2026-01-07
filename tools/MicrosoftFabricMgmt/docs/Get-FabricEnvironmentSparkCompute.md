# Get-FabricEnvironmentSparkCompute

## Overview

The `Get-FabricEnvironmentSparkCompute` function communicates with the Microsoft Fabric API to fetch information about Spark compute resources associated with a specified environment. It ensures that the API token is valid and gracefully handles errors during the API call.

## Features

- Retrieves the Spark compute details for a specific environment in a Microsoft Fabric workspace.
- Validates the authentication token before making API requests.
- Handles API responses gracefully by validating status codes.
- Logs detailed messages for debugging and error handling.

## Parameters

### WorkspaceId *(Required)*

- **Description:** The unique identifier of the workspace containing the target environment.
- **Type:** String

### EnvironmentId *(Required)*

- **Description:** The unique identifier of the environment whose Spark compute details are being retrieved.
- **Type:** String

## Usage Examples

### Example 1: Get Spark Compute for an enviroment

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$env = Get-FabricEnvironment -WorkspaceId $workspace.id -EnvironmentName "Env01"
Get-FabricEnvironmentSparkCompute -WorkspaceId $workspace.id -EnvironmentId $env.id
```

## Prerequisites

- The global `$FabricConfig` object must be configured with:
  - `BaseUrl`: The Fabric API base URL.
  - `FabricHeaders`: Authentication headers for the API.
- The `Test-TokenExpired` function should be implemented to validate token expiration.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API endpoint URL using `BaseUrl`, `WorkspaceId`, and `EnvironmentId`.
3. Sends a GET request to the Fabric API to retrieve Spark compute details.
4. Validates the API response and handles errors based on status codes.
5. Returns the retrieved Spark compute details or `null` if an error occurs.

## Error Handling

- Captures and logs any errors encountered during the API request.
- Handles API response codes and returns `null` if an unexpected response occurs.

## Author

**Tiago Balabuch**
