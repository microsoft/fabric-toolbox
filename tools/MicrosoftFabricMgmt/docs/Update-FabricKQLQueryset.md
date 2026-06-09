# Update-FabricKQLQueryset

## Overview

Updates the properties of a Fabric KQLQueryset by making a PATCH request to the Microsoft Fabric API.

## Features

- Updates the name and/or description of a specified KQLQueryset.
- Supports sending JSON-formatted updates.
- Handles long-running operations for asynchronous updates.
- Ensures robust token validation and error handling.

## Parameters

### KQLQuerysetId

- **Description:** The unique identifier of the KQLQueryset to be updated.
- **Type:** String
- **Mandatory:** Yes

### KQLQuerysetName

- **Description:** The new name for the KQLQueryset.
- **Type:** String
- **Mandatory:** Yes

### KQLQuerysetDescription

- **Description:** An optional description for the KQLQueryset.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Update a KQL Queryset

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$KQLQueryset = Get-FabricKQLQueryset -WorkspaceId $workspace.id -KQLQuerysetName "KQLDB-12345"
Update-FabricKQLQueryset -WorkspaceId $workspace.id -KQLQuerysetId $KQLQueryset.id -KQLQuerysetName "KQLDB-12345 Updated" -KQLQuerysetDescription "KQL Database Updated"


## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `KQLQuerysetId`.
3. Constructs the JSON request body with optional description.
4. Sends a PATCH request to the Microsoft Fabric API.
5. Handles API responses:
   - `200`: KQLQueryset updated successfully.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Provides robust error logging to assist in debugging issues.

## Author

**Tiago Balabuch**
