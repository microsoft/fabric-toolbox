# Get-FabricPaginatedReport

## Overview

The `Get-FabricPaginatedReport` function retrieves paginated report details from a specified Microsoft Fabric workspace using either the provided PaginatedReportId or PaginatedReportName.

## Features

- Validates token expiration before making the API request.
- Supports retrieval by paginated report ID or name.
- Handles paginated API responses using continuation tokens.
- Provides error handling and descriptive logging.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the paginated reports exist.
- **Type:** String
- **Mandatory:** Yes

### PaginatedReportId

- **Description:** The unique identifier of the paginated report to retrieve.
- **Type:** String
- **Mandatory:** No

### PaginatedReportName

- **Description:** The name of the paginated report to retrieve.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Get a list of paginated reports

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricPaginatedReport -WorkspaceId $workspace.id
```

### Example 2: Get a paginated report by name

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricPaginatedReport -WorkspaceId $workspace.id -PaginatedReportName "My Paginated Report"
```

### Example 3: Get a paginated report by ID

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricPaginatedReport -WorkspaceId $workspace.id -PaginatedReportId "report-67890"
```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Ensures only one filter (`PaginatedReportId` or `PaginatedReportName`) is provided.
2. Validates the authentication token using `Test-TokenExpired`.
3. Constructs the API URL and retrieves paginated report details using paginated responses if needed.
4. Filters the response data based on the provided parameters.
5. Logs descriptive messages for debugging and error handling.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**