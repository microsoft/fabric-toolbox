# New-FabricEnvironment

## Overview

Creates a new environment in a specified workspace.

## DESCRIPTION

The `New-FabricEnvironment` function creates a new environment within a given workspace by making a POST request to the Fabric API. This environment can optionally include a description. The function ensures token validity and handles API errors gracefully.

## PARAMETERS

### WorkspaceId

- **Type**: String  
- **Mandatory**: Yes  
- **Description**: The unique identifier of the workspace where the environment will be created.

### EnvironmentName

- **Type**: String  
- **Mandatory**: Yes  
- **Description**: The name of the environment to be created. Only alphanumeric characters, spaces, and underscores are allowed.

### EnvironmentDescription

- **Type**: String  
- **Mandatory**: No  
- **Description**: A description of the environment.

## Usage Examples

### Example 1: Creating a new environment

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
New-FabricEnvironment -WorkspaceId $workspace.id -EnvironmentName "Env01"
```

This command creates an environment named `Env01` in the workspace with ID `workspace-12345`

### Example 2: Creating a new environment with description

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName ""workspace-12345""
New-FabricEnvironment -WorkspaceId $workspace.id -EnvironmentName "Env02" -EnvironmentDescription "Development Environment"
```

This command creates an environment named `Env02` in the workspace with ID `"workspace-12345"` and adds the specified description.

## Prerequisites

- The global `$FabricConfig` object must be configured with:
  - `BaseUrl`: The Fabric API base URL.
  - `FabricHeaders`: Authentication headers for the API.
- The `Test-TokenExpired` function should be implemented to validate token expiration.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API endpoint URL using `BaseUrl`, `WorkspaceId`, and `EnvironmentId`.
3. Sends a GET request to the Fabric API to retrieve staging Spark compute details.
4. Validates the API response and handles errors based on status codes.
5. Returns the retrieved staging Spark compute configurations or `null` if an error occurs.

## ERROR HANDLING

- The function handles and logs API errors, including unexpected response codes or failed requests.
- If the operation is long-running (202 status code), the function polls for the operation status and retrieves the final result.

## AUTHOR

**Tiago Balabuch**  

