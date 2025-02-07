# Update-FabricReportDefinition

## Overview

Updates the definition of an existing Report in a Microsoft Fabric workspace by sending a PATCH request to the Microsoft Fabric API.

## Features

- Sends a PATCH request to update the content or metadata of a specified Report.
- Validates token expiration before making the API request.
- Handles API responses with detailed error logging.
- Supports encoding Report content as Base64.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the Report exists.
- **Type:** String
- **Mandatory:** Yes

### ReportId

- **Description:** The unique identifier of the Report to be updated.
- **Type:** String
- **Mandatory:** Yes

### ReportPathDefinition

- **Description:** The required path to the folder containing all files for the Report definition to be uploaded.
- **Type:** String
- **Mandatory:** Yes

## Usage Examples

### Example 1: Update Report Definition with a new JSON file

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$report = Get-FabricReport -WorkspaceId $workspace.id -ReportName "Report-67890"
Update-FabricReportDefinition -WorkspaceId $workspace.id -ReportId $report.id -ReportPathDefinition "C:\temp\API\Report"
```

## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `ReportId`.
3. Sends a PATCH request to the Microsoft Fabric API with the encoded Report content.
4. Handles API responses:
   - `200`: Report definition updated successfully.
   - `202`: Report definition update accepted, but operation is in progress.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Provides robust error logging to assist in debugging issues.

## Author

**Tiago Balabuch**