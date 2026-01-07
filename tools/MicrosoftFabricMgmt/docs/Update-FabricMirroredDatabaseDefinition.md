# Update-FabricMirroredDatabaseDefinition

## Overview

This function allows updating the content or metadata of a MirroredDatabase in a Microsoft Fabric workspace. The MirroredDatabase content can be provided as file paths, and metadata updates can optionally be enabled.

## Features

- Sends a POST request to update the MirroredDatabase content or metadata in a specified Microsoft Fabric workspace.
- Validates token expiration before making the API request.
- Handles API responses with detailed error logging.
- Supports encoding MirroredDatabase content as Base64.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the MirroredDatabase resides.
- **Type:** String
- **Mandatory:** Yes

### MirroredDatabaseId

- **Description:** The unique identifier of the MirroredDatabase to be updated.
- **Type:** String
- **Mandatory:** Yes

### MirroredDatabasePathDefinition

- **Description:** The file path to the MirroredDatabase content definition file. The content will be encoded as Base64 and sent in the request.
- **Type:** String
- **Mandatory:** Yes

### MirroredDatabasePathPlatformDefinition

- **Description:** (Optional) The file path to the MirroredDatabase's platform-specific definition file. The content will be encoded as Base64 and sent in the request.
- **Type:** String
- **Mandatory:** No

### UpdateMetadata

- **Description:** (Optional) A boolean flag indicating whether to update the MirroredDatabase's metadata. Default: `$false`.
- **Type:** Boolean
- **Mandatory:** No

## Usage Examples

### Example 1: Update MirroredDatabase Content

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$mirroredDatabase = Get-FabricMirroredDatabase -WorkspaceId $workspace.id -MirroredDatabaseName "WideWorldImportersDW"
Update-FabricMirroredDatabaseDefinition -WorkspaceId $workspace.id -MirroredDatabaseId $mirroredDatabase.id -MirroredDatabasePathDefinition "C:\temp\API\MirroredDatabases\MirroredDatabaseDefinition.json"

```

## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `MirroredDatabaseId`.
3. Sends a POST request to the Microsoft Fabric API with the encoded MirroredDatabase content.
4. Handles API responses:
   - `200`: MirroredDatabase updated successfully.
   - `202`: MirroredDatabase update accepted, but operation is in progress.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Provides robust error logging to assist in debugging issues.

## Author

**Tiago Balabuch**