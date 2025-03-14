# Upload-FabricEnvironmentStagingLibrary

## Overview
The `Upload-FabricEnvironmentStagingLibrary` function sends a POST request to the Microsoft Fabric API to upload a library to the specified environment staging area for the given workspace.

## Features
- Validates token expiration before making the API request.
- Constructs and sends a POST request to upload a library.
- Handles successful and error responses.

## Parameters

### WorkspaceId
- **Description:** The unique identifier of the workspace where the environment exists.
- **Type:** String
- **Mandatory:** Yes

### EnvironmentId
- **Description:** The unique identifier of the environment where the library will be uploaded.
- **Type:** String
- **Mandatory:** Yes

### Example 1: Cancels the publish operation for a specified environment

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$env = Get-FabricEnvironment -WorkspaceId $workspace.id -EnvironmentName "Env02"
Upload-FabricEnvironmentStagingLibrary -WorkspaceId $workspace.id -EnvironmentId $env.id
```

## Prerequisites
- Use the command `Set-FabricApiHeaders` to set global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow
1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `EnvironmentId`.
3. Constructs the request body for the library upload.
4. Sends a POST request to upload the library.
5. Validates the API response and handles results accordingly.

## Error Handling
- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author
**Tiago Balabuch**  

