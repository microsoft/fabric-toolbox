
# Remove-FabricEventhouse

## Overview

The `Remove-FabricEventhouse` function deletes an Eventhouse from a specified Microsoft Fabric workspace by sending a DELETE request to the Microsoft Fabric API. It uses the `WorkspaceId` and `EventhouseId` to identify the Eventhouse to be removed.

## Features

- Ensures token validity before making API requests.
- Constructs and sends a DELETE request to the appropriate API endpoint.
- Logs descriptive messages for debugging and error tracking.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace from which the Eventhouse will be removed.
- **Type:** String
- **Mandatory:** Yes

### EventhouseId

- **Description:** The unique identifier of the Eventhouse to be removed.
- **Type:** String
- **Mandatory:** Yes

### Example 1: Removes an Eventhouse

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$eventhouse = Get-FabricEventhouse -WorkspaceId $workspace.id -EventhouseName "eventhouse-12345"
Remove-FabricEventhouse -WorkspaceId $workspace.id -EventhouseId $eventhouse.id 
```

## Prerequisites

- The global `$FabricConfig` variable must be set up with:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- The `Test-TokenExpired` helper function ensures token validity before execution.

## Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `EventhouseId`.
3. Sends a DELETE request to the API endpoint.
4. Handles API responses and logs any errors or success messages.

## Error Handling

- Logs descriptive error messages for invalid inputs or failed API requests.
- Returns `null` for unexpected response codes or errors.

## Author

**Tiago Balabuch**  
