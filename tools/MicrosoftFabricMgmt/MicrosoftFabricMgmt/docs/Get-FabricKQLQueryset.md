# Get-FabricKQLQueryset

## Overview

Retrieves a KQLQueryset or a list of KQLQuerysets from a specified Microsoft Fabric workspace by sending a GET request to the Microsoft Fabric API. This function supports filtering results by `KQLQuerysetName` or `KQLQuerysetId`.

## Features

- Fetches details of all KQLQuerysets in a specified workspace.
- Supports filtering by `KQLQuerysetName` or `KQLQuerysetId`.
- Handles pagination using continuation tokens for retrieving large datasets.
- Ensures robust token validation and error handling.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace to query KQLQuerysets.
- **Type:** String
- **Mandatory:** Yes

### KQLQuerysetId

- **Description:** The unique identifier of the specific KQLQueryset to retrieve.
- **Type:** String
- **Mandatory:** No

### KQLQuerysetName

- **Description:** The name of the KQLQueryset to retrieve.
- **Type:** String
- **Mandatory:** No
- **Validation:** Must contain only alphanumeric characters, underscores, or spaces.

## Usage Examples

### Example 1: Get a list of KQL Database list

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricKQLQueryset -WorkspaceId $workspace.id
```

### Example 2: Get a KQL Database by name

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricKQLQueryset -WorkspaceId $workspace.id -KQLQuerysetName "KQLDB-12345"
```

### Example 3: Get a KQL Database by id

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricKQLQueryset -WorkspaceId $workspace.id -KQLQuerysetId "63caa83a-e8e7-414c-9272-2091156da26b"
```

## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates input parameters to ensure only one of `KQLQuerysetId` or `KQLQuerysetName` is provided.
2. Ensures the authentication token is valid using `Test-TokenExpired`.
3. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and optional `continuationToken`.
4. Sends a GET request to the Microsoft Fabric API.
5. Handles API responses:
   - Adds data from the response to the result set.
   - Continues fetching data if a continuation token is provided.
6. Filters the results based on the provided `KQLQuerysetId` or `KQLQuerysetName`.
7. Returns the matched KQLQueryset(s) or logs a warning if no match is found.

## Error Handling

- Validates the input parameters to avoid ambiguous queries.
- Logs detailed error messages for invalid responses or API failures.
- Captures and logs exceptions during API calls for debugging.

## Author

**Tiago Balabuch**
