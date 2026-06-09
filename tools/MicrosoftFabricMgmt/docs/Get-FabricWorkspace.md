# Get-FabricWorkspace

## Overview

The `Get-FabricWorkspace` function retrieves workspace details from a specified Microsoft Fabric workspace using either the provided `WorkspaceId` or `WorkspaceName`.

## Features

- Validates token expiration before making the API request.
- Supports retrieval by `WorkspaceId` or `WorkspaceName`.
- Handles paginated API responses using continuation tokens.
- Provides error handling and descriptive logging.

## Parameters

### `WorkspaceId`

- **Description:** The unique identifier of the workspace to retrieve.
- **Type:** String
- **Mandatory:** No

### `WorkspaceName`

- **Description:** The name of the workspace to retrieve.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Get a list of Workspaces

```powershell
Get-FabricWorkspace 
```

### Example 2: Get a Workspace by name

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricWorkspace -WorkspaceName "My Workspace"
```

### Example 3: Get a Workspace by ID

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricWorkspace -WorkspaceId $workspace.id
```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set the global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Ensures only one filter (`WorkspaceId` or `WorkspaceName`) is provided.
2. Validates the authentication token using `Test-TokenExpired`.
3. Constructs the API URL and retrieves workspace details using paginated responses if needed.
4. Filters the response data based on the provided parameters.
5. Logs descriptive messages for debugging and error handling.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**
