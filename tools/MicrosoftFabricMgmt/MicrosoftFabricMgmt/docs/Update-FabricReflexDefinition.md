# Update-FabricReflexDefinition

## Overview

Updates the definition of an existing Reflex in a Microsoft Fabric workspace by sending a PATCH request to the Microsoft Fabric API.

## Features

- Sends a PATCH request to update the content or metadata of a specified Reflex.
- Validates token expiration before making the API request.
- Handles API responses with detailed error logging.
- Supports encoding Reflex content as Base64.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the Reflex exists.
- **Type:** String
- **Mandatory:** Yes

### ReflexId

- **Description:** The unique identifier of the Reflex to be updated.
- **Type:** String
- **Mandatory:** Yes

### ReflexPathDefinition

- **Description:** Path to the Reflex definition file to upload.
- **Type:** String
- **Mandatory:** Yes

### ReflexPathPlatformDefinition

- **Description:** (Optional) Path to the platform-specific definition file to upload.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Update Reflex Definition with a new JSON file

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$reflex = Get-FabricReflex -WorkspaceId $workspace.id -ReflexName "Reflex01"
Update-FabricReflexDefinition `
    -WorkspaceId $workspace.id `
    -ReflexId $reflex.id `
    -ReflexPathDefinition "C:\Path\To\ReflexDefinition.json"
```

## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `ReflexId`.
3. Sends a PATCH request to the Microsoft Fabric API with the encoded Reflex content.
4. Handles API responses:
   - `200`: Reflex updated successfully.
   - `202`: Reflex update accepted, but operation is in progress.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Provides robust error logging to assist in debugging issues.

## Author

**Tiago Balabuch**