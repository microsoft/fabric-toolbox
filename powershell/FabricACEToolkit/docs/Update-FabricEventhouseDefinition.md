# Update-FabricEventhouseDefinition

## Overview

This function sends a PATCH request to the Microsoft Fabric API to update the definition of an existing Eventhouse in the specified workspace.

## Features

- Sends a PATCH request to update the Eventhouse definition.
- Supports optional parameters for Eventhouse definition and platform-specific definition.
- Handles both successful and error responses.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the Eventhouse exists.
- **Type:** String
- **Mandatory:** Yes

### EventhouseId

- **Description:** The unique identifier of the Eventhouse to be updated.
- **Type:** String
- **Mandatory:** Yes

### EventhousePathDefinition

- **Description:** An optional path to the Eventhouse definition file to upload.
- **Type:** String
- **Mandatory:** Yes

### EventhousePathPlatformDefinition

- **Description:** An optional path to the platform-specific definition file to upload.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Cancels the publish operation for a specified environment

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$eventhouse = Get-FabricEventhouse -WorkspaceId $workspace.id -EventhouseName "eventhouse-67890"
Update-FabricEventhouseDefinition -WorkspaceId $workspace.id -EventhouseId $eventhouse.id -EventhousePathDefinition "C:\temp\API\eventhouse.json" 
```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `EventhouseId`.
3. Sends a PATCH request to update the Eventhouse definition.
4. Handles API responses to check for success or errors.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**
