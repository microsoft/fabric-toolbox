# Remove-FabricEventstream

## Overview

The `Remove-FabricEventstream` function deletes an Eventstream from a specified Microsoft Fabric workspace by sending a DELETE request to the Microsoft Fabric API. It uses the `WorkspaceId` and `EventstreamId` to identify the Eventstream to be removed.

## Features

- Ensures token validity before making API requests.
- Constructs and sends a DELETE request to the appropriate API endpoint.
- Logs descriptive messages for debugging and error tracking.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace from which the Eventstream will be removed.
- **Type:** String
- **Mandatory:** Yes

### EventstreamId

- **Description:** The unique identifier of the Eventstream to be removed.
- **Type:** String
- **Mandatory:** Yes

### Example 1: Removes an Eventstream

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$env = Get-FabricEventstream -WorkspaceId $workspace.id -EventstreamName "Eventstream-12345"
Remove-FabricEventstream -WorkspaceId $workspace.id -EventstreamId $Eventstream.id 
```

## Prerequisites

- The global `$FabricConfig` variable must be set up with:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- The `Test-TokenExpired` helper function ensures token validity before execution.

## Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `EventstreamId`.
3. Sends a DELETE request to the API endpoint.
4. Handles API responses and logs any errors or success messages.

## Error Handling

- Logs descriptive error messages for invalid inputs or failed API requests.
- Returns `null` for unexpected response codes or errors.

## Author

**Tiago Balabuch**  
