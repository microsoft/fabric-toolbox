# Get-FabricKQLDatabaseDefinition

## Overview

Retrieves the definition of a KQLDatabase from a specified Microsoft Fabric workspace. This function supports fetching KQLDatabase definitions in the KQLDatabase format and handles long-running asynchronous operations when necessary.

## Features

- Fetches the content or metadata of a specific KQLDatabase in a workspace.
- Handles long-running operations with detailed logging.
- Includes robust error handling and token validation.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace from which the KQLDatabase definition is to be retrieved.
- **Type:** String
- **Mandatory:** Yes

### KQLDatabaseId

- **Description:** The unique identifier of the KQLDatabase whose definition needs to be retrieved.
- **Type:** String
- **Mandatory:** No

### KQLDatabaseFormat

- **Description:** Specifies the format of the KQLDatabase definition. Currently, only 'ipynb' is supported.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Update a KQL database definition

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
  - `BaseUrl`: The base API endpoint for Microsoft Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.
- Long-running operations are handled by `Get-FabricLongRunningOperation` and `Get-FabricLongRunningOperationResult`.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and optionally `KQLDatabaseId`.
3. Sends a POST request to the Microsoft Fabric API.
4. Handles API responses:
   - `200`: Retrieves and returns the KQLDatabase definition.
   - `202`: Handles asynchronous operation and fetches the definition upon completion.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Supports debugging with detailed information about long-running operations, including `OperationId`, `Location`, and `Retry-After` values.

## Author

**Tiago Balabuch**
