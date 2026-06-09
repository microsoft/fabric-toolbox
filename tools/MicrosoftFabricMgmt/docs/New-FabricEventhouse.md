# New-FabricEventhouse

## Overview

The `New-FabricEventhouse` function creates a new Eventhouse in a specified Microsoft Fabric workspace by sending a POST request to the Microsoft Fabric API. It allows optional parameters to provide a description or upload definition files for the Eventhouse.

## Features

- Ensures token validity before making API requests.
- Constructs a customizable request body based on provided parameters.
- Supports uploading Eventhouse and platform-specific definition files.
- Handles responses, including long-running operations.

## Usage Examples

### Example 1: Add a new Eventhouse

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "WS API"
New-FabricEventhouse -WorkspaceId $workspace.id -EventhouseName "eventhouse-12345"
```

### Example 2: Add a new Eventhouse with description

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "WS API"
New-FabricEventhouse -WorkspaceId $workspace.id -EventhouseName "eventhouse-67890" -EventhouseDescription "EH Events" 
```

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the Eventhouse will be created.
- **Type:** String
- **Mandatory:** Yes

### EventhouseName

- **Description:** The name of the Eventhouse to be created.
- **Type:** String
- **Mandatory:** Yes

### EventhouseDescription

- **Description:** An optional description for the Eventhouse.
- **Type:** String
- **Mandatory:** No

### EventhousePathDefinition

- **Description:** An optional file path to the Eventhouse definition file to upload. The file content is encoded in Base64 for inclusion in the API request.
- **Type:** String
- **Mandatory:** No

### EventhousePathPlatformDefinition

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
3. Builds a request body with optional Eventhouse and platform definition files (encoded in Base64).
4. Sends a POST request to the API endpoint.
5. Handles both immediate responses (success or failure) and long-running operations.

## Error Handling

- Logs descriptive error messages for invalid inputs or failed API requests.
- Returns `null` for any errors encountered during execution.

## Notes

- Long-running operations are supported via `Get-FabricLongRunningOperation` and `Get-FabricLongRunningOperationResult` helper functions.
- For successful operations, returns details of the created Eventhouse.

## Author

**Tiago Balabuch**  
