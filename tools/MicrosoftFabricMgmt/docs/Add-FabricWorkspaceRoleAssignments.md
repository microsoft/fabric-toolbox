# Add-FabricWorkspaceRoleAssignments

## Overview

The `Add-FabricWorkspaceRoleAssignments` function assigns a role (e.g., Admin, Contributor, Member, Viewer) to a principal (e.g., User, Group, ServicePrincipal) in a Fabric workspace by making a POST request to the API.

## Description

This function sends a POST request to the Microsoft Fabric API to assign a specified role to a given principal within a workspace. It handles token validation, constructs the API URL, processes the API request, and handles the response, including error scenarios.

## Features

- Ensures token validity using `Test-TokenExpired` before making the API request.
- Dynamically constructs the API URL based on provided `WorkspaceId`.
- Supports assigning roles to various types of principals (Group, ServicePrincipal, ServicePrincipalProfile, User).
- Logs errors for debugging and error handling.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace.
- **Type:** String
- **Mandatory:** Yes

### PrincipalId

- **Description:** The unique identifier of the principal (User, Group, etc.) to assign the role.
- **Type:** String
- **Mandatory:** Yes

### PrincipalType

- **Description:** The type of the principal. Allowed values: Group, ServicePrincipal, ServicePrincipalProfile, User.
- **Type:** String
- **Mandatory:** Yes

### WorkspaceRole

- **Description:** The role to assign to the principal. Allowed values: Admin, Contributor, Member, Viewer.
- **Type:** String
- **Mandatory:** Yes

## Usage Examples

### Example 1: Assign a Role to a Principal. The `PrincipalId` must be an EntraID.

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Add-FabricWorkspaceRoleAssignment `
-WorkspaceId $workspace.id `
-PrincipalId "111111111-11111-1111-1111-11111111111" `
-PrincipalType User `
-WorkspaceRole Viewer
```

## Prerequisites

- Ensure that `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`, is correctly configured with the required authentication details.
- Token validation should be handled using `Test-TokenExpired`.

## Key Workflow

1. Validates the token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl` and `WorkspaceId`.
3. Prepares the request body with principal and role details.
4. Sends a POST request to the Microsoft Fabric API.
5. Handles API responses, including success and error handling.

## Error Handling

- Logs detailed error messages for API request failures.
- Throws an exception if the API request fails unexpectedly.

## Author

**Tiago Balabuch**