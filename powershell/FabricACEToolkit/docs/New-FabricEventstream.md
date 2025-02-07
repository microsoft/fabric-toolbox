# New-FabricEventstream

## Overview

The `New-FabricEventstream` function creates a new Eventstream in a specified Microsoft Fabric workspace by sending a POST request to the Microsoft Fabric API. It allows optional parameters to provide a description or upload definition files for the Eventstream.

## Features

- Ensures token validity before making API requests.
- Constructs a customizable request body based on provided parameters.
- Supports uploading Eventstream and platform-specific definition files.
- Handles responses, including long-running operations.

## Usage Examples

### Example 1: Add a new Eventstream

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "WS API"
New-FabricEventstream -WorkspaceId $workspace.id -EventstreamName "Eventstream-12345"
```

### Example 2: Add a new Eventstream with description

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "WS API"
New-FabricEventstream -WorkspaceId $workspace.id -EventstreamName "Eventstream-67890" -EventstreamDescription "EH Events" 
```

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the Eventstream will be created.
- **Type:** String
- **Mandatory:** Yes

### EventstreamName

- **Description:** The name of the Eventstream to be created.
- **Type:** String
- **Mandatory:** Yes

### EventstreamDescription

- **Description:** An optional description for the Eventstream.
- **Type:** String
- **Mandatory:** No

### EventstreamPathDefinition

- **Description:** An optional file path to the Eventstream definition file to upload. The file content is encoded in Base64 for inclusion in the API request.
- **Type:** String
- **Mandatory:** No

### EventstreamPathPlatformDefinition

- **Description:** An optional file path to the platform-specific definition file to upload. The file content is encoded in Base64 for inclusion in the API request.
- **Type:** String
- **Mandatory:** No

## Prerequisites

- Use the `Set-FabricApiHeaders` command to configure the global `$FabricConfig` variable, which must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- The `Test-TokenExpired` helper function ensures that the token is valid.

## Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl` and `WorkspaceId`.
3. Builds a request body with optional Eventstream and platform definition files (encoded in Base64).
4. Sends a POST request to the API endpoint.
5. Handles both immediate responses (success or failure) and long-running operations.

## Error Handling

- Logs descriptive error messages for invalid inputs or failed API requests.
- Returns `null` for any errors encountered during execution.

## Notes

- Long-running operations are supported via `Get-FabricLongRunningOperation` and `Get-FabricLongRunningOperationResult` helper functions.
- For successful operations, returns details of the created Eventstream.

## Author

**Tiago Balabuch**  
