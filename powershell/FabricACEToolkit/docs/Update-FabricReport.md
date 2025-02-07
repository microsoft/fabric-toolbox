# Update-FabricReport

## Overview

The `Update-FabricReport` function updates the name and/or description of an existing Fabric Report by making a PATCH request to the API.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the Report exists.
- **Type:** String
- **Mandatory:** No

### ReportId

- **Description:** The unique identifier of the Report to be updated.
- **Type:** String
- **Mandatory:** Yes

### ReportName

- **Description:** The new name of the Report.
- **Type:** String
- **Mandatory:** Yes

### ReportDescription

- **Description:** An optional new description for the Report.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Update a Report Name

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$report = Get-FabricReport -WorkspaceId $workspace.id -ReportName "Report-12345"
Update-FabricReport -WorkspaceId $workspace.id -ReportId $report.id -ReportName "UpdatedReportName"
```

### Example 2: Update a Report Name and Description

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$report = Get-FabricReport -WorkspaceId $workspace.id -ReportName "Report-12345"
Update-FabricReport -WorkspaceId $workspace.id -ReportId $report.id  -ReportName "UpdatedName" -ReportDescription "Updated description"
```

## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `ReportId`.
3. Constructs the JSON request body with optional description.
4. Sends a PATCH request to the Microsoft Fabric API.
5. Handles API responses:
   - `200`: Report updated successfully.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Provides robust error logging to assist in debugging issues.

## Author

**Tiago Balabuch**