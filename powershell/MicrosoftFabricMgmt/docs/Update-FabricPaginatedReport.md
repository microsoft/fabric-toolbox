# Update-FabricPaginatedReport

## Overview

The `Update-FabricPaginatedReport` function updates the name and/or description of a specified paginated report in a Microsoft Fabric workspace by making a PATCH request to the API.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace containing the paginated report.
- **Type:** String
- **Mandatory:** Yes

### PaginatedReportId

- **Description:** The unique identifier of the paginated report to be updated.
- **Type:** String
- **Mandatory:** Yes

### PaginatedReportName

- **Description:** The new name for the paginated report.
- **Type:** String
- **Mandatory:** Yes

### PaginatedReportDescription

- **Description:** An optional description for the paginated report.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Update a Paginated Report Name and Description

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$report = Get-FabricPaginatedReport -WorkspaceId $workspace.id -PaginatedReportName "Report-12345"
Update-FabricPaginatedReport -WorkspaceId $workspace.id -PaginatedReportId $report.id -PaginatedReportName "New Report Name" -PaginatedReportDescription "Updated description."
```

## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `PaginatedReportId`.
3. Constructs the JSON request body with optional description.
4. Sends a PATCH request to the Microsoft Fabric API.
5. Handles API responses:
   - `200`: Paginated report updated successfully.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Provides robust error logging to assist in debugging issues.

## Author

**Tiago Balabuch**
