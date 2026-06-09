# Assign-FabricWorkspaceCapacity

## Overview

The `Assign-FabricWorkspaceCapacity` function sends a POST request to assign a workspace to a specific capacity.

## Description

This function assigns a specified workspace to a given capacity in Microsoft Fabric. It handles token validation, constructs the API request, and processes the API response.

## Features

- Validates authentication token using the `Test-TokenExpired` function.
- Constructs the API URL dynamically based on `WorkspaceId`.
- Supports assigning a workspace to a specific capacity.
- Logs detailed steps for debugging and error handling.

## Parameters

### `WorkspaceId` *(Mandatory)*

- **Description:** The unique identifier of the workspace to be assigned.
- **Type:** String

### `CapacityId` *(Mandatory)*

- **Description:** The unique identifier of the capacity to which the workspace should be assigned.
- **Type:** String

## Usage Examples

### Example 1: Assign a workspace to a capacity

```powershell
$capacity = Get-FabricCapacity -capacityName "capacity-45678"
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Assign-FabricWorkspaceCapacity -WorkspaceId $workspace.id -CapacityId $capacity.id
```

## Prerequisites

- A global `$FabricConfig` object must be configured with the following properties:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- The `Test-TokenExpired` function must be available to check token validity.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL to assign the workspace to the capacity.
3. Sends a POST request to the API with the required request body.
4. Handles different status codes, including long-running operations.
5. Returns either the result of the operation or logs the error if the operation fails.

## Error Handling

- Logs error messages if the API request fails or if the operation encounters issues.
- The function includes detailed logging for each major step in the process.

## Author

**Tiago Balabuch**