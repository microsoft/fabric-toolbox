# Update-FabricWorkspaceRoleAssignment

## Overview

The `Update-FabricWorkspaceRoleAssignment` function updates the role assigned to a principal in a specified Microsoft Fabric workspace by sending a PATCH request to the Microsoft Fabric API.

## Features

- Validates the token using `Test-TokenExpired` before making the API request.
- Allows updates to the role of a principal in the workspace.
- Provides detailed logging for debugging and error handling.

## Parameters

### WorkspaceId *(Mandatory)*

- **Description:** The unique identifier of the workspace where the role assignment exists.
- **Type:** String

### WorkspaceRoleAssignmentId *(Mandatory)*

- **Description:** The unique identifier of the role assignment to be updated.
- **Type:** String

### WorkspaceRole *(Mandatory)*

- **Description:** The new role to assign to the principal. Must be one of the following:
  - Admin
  - Contributor
  - Member
  - Viewer
- **Type:** String

## Usage Examples

### Example 1: Update a Role Assignment

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricWorkspaceRoleAssignment -WorkspaceId $workspace.id
Update-FabricWorkspaceRoleAssignment `
-WorkspaceId $workspace.id `
-WorkspaceRoleAssignmentId "999999999-9999-9999-9999-9999999999" `
-WorkspaceRole Contributor
```

## Prerequisites

- The global `$FabricConfig` variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- The `Test-TokenExpired` function must be implemented to validate token expiry.

## Workflow

1. Validates the token using `Test-TokenExpired`.
2. Constructs the API URL based on `WorkspaceId` and `WorkspaceRoleAssignmentId`.
3. Builds the request body in JSON format with the `WorkspaceRole`.
4. Sends a PATCH request to the API endpoint with the constructed JSON body.
5. Handles API responses and logs messages for debugging or error handling.

## Error Handling

- Logs detailed error messages for invalid inputs or failed API requests.
- Returns `null` if the API response code is not `200`.

## Author

**Tiago Balabuch**