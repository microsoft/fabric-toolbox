# Update-FabricWorkspace

## Overview

The `Update-FabricWorkspace` function updates an existing workspace in a specified Microsoft Fabric by sending a PATCH request to the Microsoft Fabric API. It allows modifications to the workspace's name and description.

## Features

- Validates the token using `Test-TokenExpired` before making the API request.
- Allows updates to the workspace's name (mandatory) and description (optional).
- Provides detailed logging for debugging and error handling.

## Parameters

### WorkspaceId *(Mandatory)*

- **Description:** The unique identifier of the workspace to be updated.
- **Type:** String

### WorkspaceName *(Mandatory)*

- **Description:** The new name for the workspace.
- **Type:** String
- **Validation:** Only allows alphanumeric characters, spaces, and underscores.

### WorkspaceDescription *(Optional)*

- **Description:** The new description for the workspace.
- **Type:** String

## Usage Examples

### Example 1: Update a Workspace Name

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345" 
Update-FabricWorkspace -WorkspaceId $workspace.id -WorkspaceName "workspace-12345 UPDATED"
```

### Example 2: Update a Workspace Name and Description

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345" 
Update-FabricWorkspace -WorkspaceId $workspace.id -WorkspaceName "workspace-12345 UPDATED" -WorkspaceDescription "Updated description"
```

## Prerequisites

- The global `$FabricConfig` variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- The `Test-TokenExpired` function must be implemented to validate token expiry.

## Workflow

1. Validates the token using `Test-TokenExpired`.
2. Constructs the API URL based on `WorkspaceId`.
3. Builds the request body in JSON format, including mandatory and optional parameters.
4. Sends a PATCH request to the API endpoint with the constructed JSON body.
5. Handles API responses and logs messages for debugging or error handling.

## Error Handling

- Logs detailed error messages for invalid inputs or failed API requests.
- Returns `null` if the API response code is not `200`.

## Author

**Tiago Balabuch**