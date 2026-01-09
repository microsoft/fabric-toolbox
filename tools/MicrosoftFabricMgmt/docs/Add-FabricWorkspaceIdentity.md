# Add-FabricWorkspaceIdentity

## Overview

The `Add-FabricWorkspaceIdentity` function provisions an identity for a specified workspace by making an API call. This helps manage workspace access and security in Microsoft Fabric.

## Description

This function sends a POST request to the Microsoft Fabric API to provision an identity for a specific workspace. It handles token validation, constructs the API URL, processes the API request, and handles long-running operations.

## Features

- Ensures token validity using `Test-TokenExpired` before making the API request.
- Dynamically constructs the API URL based on provided `WorkspaceId`.
- Handles the response, including long-running operations and retries.
- Logs errors for debugging and error handling.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace for which the identity will be provisioned.
- **Type:** String
- **Mandatory:** Yes

## Usage Examples

### Example 1: Provision a Workspace Identity

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Add-FabricWorkspaceIdentity -WorkspaceId $workspace.id 
```

This example provisions a Managed Identity for the workspace with ID `workspace123`.

## Prerequisites

- Ensure that `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`, is correctly configured with the required authentication details.
- Token validation should be handled using `Test-TokenExpired`.

## Key Workflow

1. Validates the token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl` and `WorkspaceId`.
3. Sends a POST request to the Microsoft Fabric API.
4. Handles API responses, including long-running operations and retries.

## Error Handling

- Logs detailed error messages for API request failures.
- Throws an exception if the API request fails unexpectedly.

## Author

**Tiago Balabuch**