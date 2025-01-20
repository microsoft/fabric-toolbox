# Update-FabricKQLDashboard

## Overview

Updates the properties of a specified Fabric KQLDashboard, such as its name and optional description, by making a PATCH request to the Fabric API.

## Features

- Supports updating the name of an existing KQLDashboard.
- Optionally updates the description of the KQLDashboard.
- Provides token validation to ensure secure API access.
- Implements robust error handling for API response validation.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace containing the KQLDashboard.
- **Type:** String
- **Mandatory:** Yes

### KQLDashboardId

- **Description:** The unique identifier of the KQLDashboard to update.
- **Type:** String
- **Mandatory:** Yes

### KQLDashboardName

- **Description:** The new name for the KQLDashboard.
- **Type:** String
- **Mandatory:** Yes
- **Validation:** Only allows alphanumeric characters, spaces, and underscores.

### KQLDashboardDescription

- **Description:** An optional new description for the KQLDashboard.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Update a KQL Dashboard

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$kqlDashboard = Get-FabricKqlDashboard -WorkspaceId $workspace.id -KqlDashboardName "KQLDashboard-12345"
Update-FabricKqlDashboard -WorkspaceId $workspace.id -KqlDashboardId $kqlDashboard.id -KqlDashboardName "KQLDashboard-12345 Updated" -KQLDashboardDescription "KQL Dashboard Updated"
```

## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `KQLDashboardId`.
3. Builds the request body with the new `displayName` and optional `description`.
4. Sends a PATCH request to the Microsoft Fabric API.
5. Validates the API response code:
   - `200`: Indicates successful update.
   - Other codes: Logs errors for unexpected responses.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Provides robust error logging to assist in debugging issues.

## Author

**Tiago Balabuch**
