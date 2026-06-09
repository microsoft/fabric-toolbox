# Get-FabricSQLEndpoint

## Overview

The `Get-FabricSQLEndpoint` function retrieves SQL Endpoints from a specified workspace in Fabric. It supports filtering by SQL Endpoint ID or SQL Endpoint Name. If both filters are provided, an error message is returned. The function handles token validation, API requests with continuation tokens, and processes the response to return the desired SQL Endpoint(s).

## Features

- Validates token expiration before making the API request.
- Handles paginated API responses using continuation tokens.
- Provides error handling and descriptive logging.

## Parameters

### WorkspaceId

- **Description:** The ID of the workspace from which to retrieve SQL Endpoints.
- **Type:** String
- **Mandatory:** Yes

### SQLEndpointId

- **Description:** The ID of the SQL Endpoint to retrieve. Optional, but cannot be used together with `SQLEndpointName`.
- **Type:** String
- **Mandatory:** No

### SQLEndpointName

- **Description:** The name of the SQL Endpoint to retrieve. Optional, but cannot be used together with `SQLEndpointId`.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Retrieve a list of SQL Endpoint

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace123"
Get-FabricSqlEndpoint -WorkspaceId $workspace.id

```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set the global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates token validity using `Test-TokenExpired`.
2. Constructs the API URL and retrieves SQL Endpoints using paginated responses if needed.
3. Logs descriptive messages for debugging and error handling.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**