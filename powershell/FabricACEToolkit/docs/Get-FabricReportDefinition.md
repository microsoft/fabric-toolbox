# Get-FabricReportDefinition

## Overview

The `Get-FabricReportDefinition` function retrieves the definition of a report from a specific workspace in Microsoft Fabric.

## Description

This function fetches the report's content or metadata from a workspace. It supports retrieving report definitions in various formats, handling both synchronous and asynchronous operations, with detailed logging and error handling.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the report exists.
- **Type:** String
- **Mandatory:** Yes

### ReportId

- **Description:** The unique identifier of the report whose definition needs to be retrieved.
- **Type:** String
- **Mandatory:** No

### ReportFormat

- **Description:** Specifies the format of the report definition. This parameter is optional.
- **Type:** String
- **Mandatory:** No

## Examples

### Example 1: Retrieve a Report Definition

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$report = Get-FabricReport -WorkspaceId $workspace.id -ReportName "Report-12345"
Get-FabricReportDefinition -WorkspaceId $workspace.id -ReportId $report.id 
```

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, `ReportId`, and `ReportFormat` (if provided).
3. Sends a POST request to retrieve the report definition.
4. Handles both immediate responses and long-running operations.
5. Validates the API response and processes the definition.

## Error Handling

- Logs descriptive error messages for failed API requests or invalid inputs.
- Returns `null` for any errors encountered during execution.
- Handles long-running operations and retries if necessary.

## Author

**Tiago Balabuch**

