# Unassign-FabricWorkspaceCapacity

## Overview

The `Unassign-FabricWorkspaceCapacity` function sends a POST request to unassign a workspace from its assigned capacity.

## Description

This function unassigns a specified workspace from its assigned capacity in Microsoft Fabric. It handles token validation, constructs the API request, and processes the API response.

## Features

- Validates authentication token using the `Test-TokenExpired` function.
- Constructs the API URL dynamically based on `WorkspaceId`.
- Supports unassigning a workspace from its specific capacity.
- Logs detailed steps for debugging and error handling.

## Parameters

### `WorkspaceId` *(Mandatory)*

- **Description:** The unique identifier of the workspace to be unassigned from its capacity.
- **Type:** String

## Usage Examples

### Example 1: Unassign a workspace from its capacity

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Unassign-FabricWorkspaceCapacity -WorkspaceId $workspace.id 
```

This example unassigns the workspace with ID `workspace123` from its assigned capacity.

## Prerequisites

- A global `$FabricConfig` object must be configured with the following properties:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- The `Test-TokenExpired` function must be available to check token validity.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL to unassign the workspace from its capacity.
3. Sends a POST request to the API.
4. Handles different status codes, including long-running operations.
5. Returns either the result of the operation or logs the error if the operation fails.

## Error Handling

- Logs error messages if the API request fails or if the operation encounters issues.
- The function includes detailed logging for each major step in the process.

## Author

**Tiago Balabuch**