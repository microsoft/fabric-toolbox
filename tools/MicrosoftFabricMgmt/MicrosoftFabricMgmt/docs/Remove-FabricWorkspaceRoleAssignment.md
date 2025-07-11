# Remove-FabricWorkspaceRoleAssignment

## Overview

Deletes a specific role assignment from a Fabric workspace by making a DELETE request to the API.

## Features

- Sends a DELETE request to remove a role assignment.
- Validates token expiration before making the API request.
- Logs detailed messages for debugging and error handling.

## Parameters

### WorkspaceId *(Mandatory)*

- **Description:** The unique identifier of the workspace.
- **Type:** String

### WorkspaceRoleAssignmentId *(Mandatory)*

- **Description:** The unique identifier of the role assignment to be removed.
- **Type:** String

## Usage Examples

### Example 1: Removing a Role Assignment from a Workspace

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345" 
Remove-FabricWorkspaceRoleAssignment -WorkspaceId $workspace.id -WorkspaceRoleAssignmentId "99999999-9999-9999-9999-99999999999"
```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set the global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token's validity using `Test-TokenExpired`.
2. Constructs the API URL for the DELETE request using the provided `WorkspaceId` and `WorkspaceRoleAssignmentId`.
3. Sends the DELETE request to remove the specified role assignment.
4. Logs detailed responses and errors for debugging purposes.

## Error Handling

- Logs descriptive error messages if the API request fails or invalid input is detected.
- Returns `null` if an error occurs during execution.

## Author

**Tiago Balabuch**