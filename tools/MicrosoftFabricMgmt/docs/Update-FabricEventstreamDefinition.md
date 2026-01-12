# Update-FabricEventstreamDefinition

## Overview

This function sends a PATCH request to the Microsoft Fabric API to update the definition of an existing Eventstream in the specified workspace.

## Features

- Sends a PATCH request to update the Eventstream definition.
- Supports optional parameters for Eventstream definition and platform-specific definition.
- Handles both successful and error responses.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the Eventstream exists.
- **Type:** String
- **Mandatory:** Yes

### EventstreamId

- **Description:** The unique identifier of the Eventstream to be updated.
- **Type:** String
- **Mandatory:** Yes

### EventstreamPathDefinition

- **Description:** An optional path to the Eventstream definition file to upload.
- **Type:** String
- **Mandatory:** Yes

### EventstreamPathPlatformDefinition

- **Description:** An optional path to the platform-specific definition file to upload.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Cancels the publish operation for a specified environment

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$Eventstream = Get-FabricEventstream -WorkspaceId $workspace.id -EventstreamName "Eventstream-67890"
Update-FabricEventstreamDefinition -WorkspaceId $workspace.id -EventstreamId $Eventstream.id -EventstreamPathDefinition "C:\temp\API\Eventstream.json" 
```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `EventstreamId`.
3. Sends a PATCH request to update the Eventstream definition.
4. Handles API responses to check for success or errors.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**
