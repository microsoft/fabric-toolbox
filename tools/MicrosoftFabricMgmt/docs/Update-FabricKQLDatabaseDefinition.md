# Update-FabricKQLDatabaseDefinition

## Overview

Updates the definition of a KQLDatabase in a Microsoft Fabric workspace by sending a POST request to the Microsoft Fabric API.

## Features

- Sends a POST request to update the content or metadata of a specified KQLDatabase.
- Validates token expiration before making the API request.
- Handles API responses with detailed error logging.
- Supports encoding KQLDatabase content as Base64.

## Parameters

### WorkspaceId

- **Description:** The ID of the workspace containing the KQLDatabase to update.
- **Type:** String
- **Mandatory:** Yes

### KQLDatabaseId

- **Description:** The ID of the KQLDatabase to be updated.
- **Type:** String
- **Mandatory:** Yes

### KQLDatabasePathDefinition

- **Description:** The file path to the KQLDatabase content definition file. The content will be encoded as Base64.
- **Type:** String
- **Mandatory:** Yes

### KQLDatabasePathPlatformDefinition

- **Description:** (Optional) The file path to the KQLDatabase's platform-specific definition file.
- **Type:** String
- **Mandatory:** No

### KQLDatabasePathSchemaDefinition

- **Description:** (Optional) The file path to the KQLDatabase's schema definition file.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Update KQL KQL Queryset Content

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$kqlDatabase = Get-FabricKqlDatabase -WorkspaceId $workspace.id -KqlDatabaseName "KQLDB-12345"
Update-FabricKqlDatabaseDefinition `
-WorkspaceId $workspace.id `
-KqlDatabaseId $kqlDatabase.id `
-KqlDatabasePathDefinition "C:\temp\API\KQLDatabase\KQLDatabase-definition.json" `
-KQLDatabasePathSchemaDefinition "C:\temp\API\KQLDatabase\DatabaseSchema.kql"`
```

## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `KQLDatabaseId`.
3. Sends a POST request to the Microsoft Fabric API with the encoded KQLDatabase content.
4. Handles API responses:
   - `200`: KQLDatabase updated successfully.
   - `202`: KQLDatabase update accepted, but operation is in progress.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Provides robust error logging to assist in debugging issues.

## Author

**Tiago Balabuch**
