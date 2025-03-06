# Get-FabricWorkspaceRoleAssignment

## Overview

The `Get-FabricWorkspaceRoleAssignment` function retrieves role assignments for a specified Fabric workspace.

## Features

- Validates token expiration before making the API request.
- Supports retrieval of all role assignments or a specific role assignment by `WorkspaceRoleAssignmentId`.
- Handles paginated API responses using continuation tokens.
- Provides error handling and descriptive logging.

## Parameters

### `WorkspaceId`

- **Description:** The unique identifier of the workspace to fetch role assignments for.
- **Type:** String
- **Mandatory:** Yes

### `WorkspaceRoleAssignmentId`

- **Description:** (Optional) The unique identifier of a specific role assignment to retrieve.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Get all role assignments for a workspace

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricWorkspaceRoleAssignment -WorkspaceId $workspace.id

```

### Example 2: Get a specific role assignment by ID

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricWorkspaceRoleAssignment -WorkspaceId $workspace.id -WorkspaceRoleAssignmentId "9999999999-9999-9999-9999-9999999999"
```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set the global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Ensures token validity using `Test-TokenExpired`.
2. Constructs the API URL to fetch role assignments.
3. Retrieves role assignments using paginated responses if necessary.
4. Filters the response data based on the provided parameters.
5. Logs descriptive messages for debugging and error handling.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**