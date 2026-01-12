# Update-FabricKQLDatabase

## Overview

Updates the properties of a Fabric KQLDatabase by making a PATCH request to the Microsoft Fabric API.

## Features

- Updates the name and/or description of a specified KQLDatabase.
- Supports sending JSON-formatted updates.
- Handles long-running operations for asynchronous updates.
- Ensures robust token validation and error handling.

## Parameters

### KQLDatabaseId

- **Description:** The unique identifier of the KQLDatabase to be updated.
- **Type:** String
- **Mandatory:** Yes

### KQLDatabaseName

- **Description:** The new name for the KQLDatabase.
- **Type:** String
- **Mandatory:** Yes

### KQLDatabaseDescription

- **Description:** An optional description for the KQLDatabase.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Update a KQL Database

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$kqlDatabase = Get-FabricKqlDatabase -WorkspaceId $workspace.id -KqlDatabaseName "KQLDB-12345"
Update-FabricKqlDatabase -WorkspaceId $workspace.id -KqlDatabaseId $kqlDatabase.id -KqlDatabaseName "KQLDB-12345 Updated" -KQLDatabaseDescription "KQL Database Updated"


## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `KQLDatabaseId`.
3. Constructs the JSON request body with optional description.
4. Sends a PATCH request to the Microsoft Fabric API.
5. Handles API responses:
   - `200`: KQLDatabase updated successfully.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Provides robust error logging to assist in debugging issues.

## Author

**Tiago Balabuch**
