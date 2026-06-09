# Update-FabricKQLQuerysetDefinition

## Overview

Updates the definition of a KQLQueryset in a Microsoft Fabric workspace by sending a POST request to the Microsoft Fabric API.

## Features

- Sends a POST request to update the content or metadata of a specified KQLQueryset.
- Validates token expiration before making the API request.
- Handles API responses with detailed error logging.
- Supports encoding KQLQueryset content as Base64.

## Parameters

### WorkspaceId

- **Description:** The ID of the workspace containing the KQLQueryset to update.
- **Type:** String
- **Mandatory:** Yes

### KQLQuerysetId

- **Description:** The ID of the KQLQueryset to be updated.
- **Type:** String
- **Mandatory:** Yes

### KQLQuerysetPathDefinition

- **Description:** The file path to the KQLQueryset content definition file. The content will be encoded as Base64.
- **Type:** String
- **Mandatory:** Yes

### KQLQuerysetPathPlatformDefinition

- **Description:** (Optional) The file path to the KQLQueryset's platform-specific definition file.
- **Type:** String
- **Mandatory:** No

### KQLQuerysetPathSchemaDefinition

- **Description:** (Optional) The file path to the KQLQueryset's schema definition file.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Update KQL Database Content

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$KQLQueryset = Get-FabricKQLQueryset -WorkspaceId $workspace.id -KQLQuerysetName "KQLDB-12345"
Update-FabricKQLQuerysetDefinition `
-WorkspaceId $workspace.id `
-KQLQuerysetId $KQLQueryset.id `
-KQLQuerysetPathDefinition "C:\temp\API\KQLQueryset\KQLQueryset-definition.json" `
-KQLQuerysetPathSchemaDefinition "C:\temp\API\KQLQueryset\DatabaseSchema.kql"`
```

## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `KQLQuerysetId`.
3. Sends a POST request to the Microsoft Fabric API with the encoded KQLQueryset content.
4. Handles API responses:
   - `200`: KQLQueryset updated successfully.
   - `202`: KQLQueryset update accepted, but operation is in progress.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Provides robust error logging to assist in debugging issues.

## Author

**Tiago Balabuch**
