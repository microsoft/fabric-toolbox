# Update-FabricKQLDashboardDefinition

## Overview

Updates the content or metadata of a KQLDashboard in a Microsoft Fabric workspace by submitting file definitions in Base64 format. This allows you to modify the dashboard's functionality or platform-specific configurations.

## Features

- Supports updating the primary definition file of a KQLDashboard.
- Optionally updates platform-specific definition files.
- Handles Base64 encoding of file contents for secure API submission.
- Provides support for asynchronous operations with long-running task management.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace containing the KQLDashboard.
- **Type:** String
- **Mandatory:** Yes

### KQLDashboardId

- **Description:** The unique identifier of the KQLDashboard to update.
- **Type:** String
- **Mandatory:** Yes

### KQLDashboardPathDefinition

- **Description:** The file path to the KQLDashboard content definition file. This file will be encoded in Base64 format before submission.
- **Type:** String
- **Mandatory:** Yes

### KQLDashboardPathPlatformDefinition

- **Description:** The file path to the KQLDashboard's platform-specific definition file. This file is optional and will also be encoded in Base64 format if provided.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Update Dashboard Definition

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$kqlDashboard = Get-FabricKqlDashboard -WorkspaceId $workspace.id -KqlDashboardName "KQLDashboard-67890" 
Update-FabricKqlDashboardDefinition -WorkspaceId $workspace.id -KqlDashboardId $kqlDashboard.id -KqlDashboardPathDefinition "C:\temp\API\kqldashboard.json"
```
Updates the KQLDashboard content definition for the specified workspace and dashboard.

## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Microsoft Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.
- Files specified in `KQLDashboardPathDefinition` and `KQLDashboardPathPlatformDefinition` must exist and contain valid content.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `KQLDashboardId`.
3. Encodes the file contents to Base64 for secure transmission.
4. Constructs the request body to include the encoded file contents.
5. Submits a POST request to the API endpoint.
6. Handles the response for synchronous and asynchronous operations.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Provides robust error logging to assist in debugging issues.

## Author

**Tiago Balabuch**
