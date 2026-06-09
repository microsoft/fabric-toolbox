# Get-FabricKQLDashboardDefinition

## Overview

Retrieves the definition of a KQLDashboard from a specific workspace in Microsoft Fabric. This function supports synchronous and asynchronous operations and includes detailed logging and error handling.

## Features

- Fetches KQLDashboard content or metadata.
- Supports optional parameters for KQLDashboard ID and format.
- Handles long-running operations asynchronously.
- Validates token expiration before making API requests.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace from which the KQLDashboard definition is to be retrieved.
- **Type:** String
- **Mandatory:** Yes

### KQLDashboardId

- **Description:** The unique identifier of the KQLDashboard whose definition needs to be retrieved.
- **Type:** String
- **Mandatory:** No

### KQLDashboardFormat

- **Description:** Specifies the format of the KQLDashboard definition.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Get KQL Dashboard definition

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$kqlDashboard = Get-FabricKqlDashboard -WorkspaceId $workspace.id -KqlDashboardName "KQLDashboard-12345"
Get-FabricKqlDashboardDefinition -WorkspaceId $workspace.id -KqlDashboardId $kqlDashboard.id
```

## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and optionally `KQLDashboardId` and `KQLDashboardFormat`.
3. Sends a POST request to fetch the KQLDashboard definition.
4. Handles API responses:
   - `200`: Returns the dashboard definition.
   - `202`: Manages long-running operations to fetch the definition asynchronously.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs errors for invalid input or failed API requests.
- Returns detailed error messages to assist with troubleshooting.

## Author

**Tiago Balabuch**
