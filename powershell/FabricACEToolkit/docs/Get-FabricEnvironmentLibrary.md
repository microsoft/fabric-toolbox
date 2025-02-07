# Get-FabricEnvironmentLibrary

## Overview

The `Get-FabricEnvironmentLibrary` function fetches library information for a given workspace and environment using the Microsoft Fabric API. It ensures the authentication token is valid and validates the response to handle errors gracefully.

## Features

- Retrieves the list of libraries associated with a specific environment in a Microsoft Fabric workspace.
- Validates the authentication token before making API requests.
- Handles API responses gracefully by validating status codes.
- Logs detailed messages for debugging and error handling.

## Parameters

### WorkspaceId *(Required)*

- **Description:** The unique identifier of the workspace where the environment is located.
- **Type:** String

### EnvironmentId *(Required)*

- **Description:** The unique identifier of the environment whose libraries are being queried.
- **Type:** String

## Usage Examples

### Example 1: Get a environment Library

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricEnvironmentLibrary -WorkspaceId $workspace.id -EnvironmentId $env.id
```

## Prerequisites

- The global `$FabricConfig` object must be configured with:
  - `BaseUrl`: The Fabric API base URL.
  - `FabricHeaders`: Authentication headers for the API.
- The `Test-TokenExpired` function should be implemented to validate token expiration.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API endpoint URL using `BaseUrl`, `WorkspaceId`, and `EnvironmentId`.
3. Sends a GET request to the Fabric API to retrieve the libraries.
4. Validates the API response and handles errors based on status codes.
5. Returns the retrieved libraries or `null` if an error occurs.

## Error Handling

- Captures and logs any errors encountered during the API request.
- Handles API response codes and returns `null` if an unexpected response occurs.

## Author

**Tiago Balabuch**