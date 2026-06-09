# New-FabricKQLDashboard

## Overview

Creates a new KQLDashboard in a specified Microsoft Fabric workspace by sending a POST request to the Microsoft Fabric API. This function supports optional parameters for description and path definitions for the KQLDashboard content.

## Features

- Creates a KQLDashboard with a specified name and optional description.
- Supports uploading KQLDashboard content and platform-specific definitions.
- Handles long-running operations for asynchronous provisioning.
- Ensures robust token validation and error handling.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the KQLDashboard will be created.
- **Type:** String
- **Mandatory:** Yes

### KQLDashboardName

- **Description:** The name of the KQLDashboard to be created.
- **Type:** String
- **Mandatory:** Yes

### KQLDashboardDescription

- **Description:** An optional description for the KQLDashboard.
- **Type:** String
- **Mandatory:** No

### KQLDashboardPathDefinition

- **Description:** An optional path to the KQLDashboard definition file (e.g., `.ipynb`) to upload.
- **Type:** String
- **Mandatory:** No

### KQLDashboardPathPlatformDefinition

- **Description:** An optional path to the platform-specific definition file (e.g., `.platform`) to upload.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Add a new KQL Dashboard

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
New-FabricKqlDashboard -WorkspaceId $workspace.id -KqlDashboardName "KQLDashboard-12345"
```

### Example 2: Add a new KQL Dashboard with Description

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
New-FabricKqlDashboard -WorkspaceId $workspace.id -KqlDashboardName "KQLDashboard-67890" -KQLDashboardDescription "KQL Dashboard"
```

## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl` and `WorkspaceId`.
3. Builds the request body with optional content and platform definitions.
4. Sends a POST request to the Microsoft Fabric API.
5. Handles API responses:
   - `201`: Dashboard created successfully.
   - `202`: Dashboard creation accepted, and provisioning proceeds asynchronously.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Provides robust error logging to assist in debugging issues.

## Author

**Tiago Balabuch**
