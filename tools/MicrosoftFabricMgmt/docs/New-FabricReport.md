# New-FabricReport

## Overview

The `New-FabricReport` function creates a new report within a specified Microsoft Fabric workspace. This function facilitates integrating data and analytics by setting up a report with options for providing descriptions and uploading report content.

## Description

This function sends a POST request to the Microsoft Fabric API to create a new report in the given workspace. It supports optional parameters for adding descriptions and defining paths for report content. The function handles token validation, API request construction, and error handling.

## Features

- Ensures token validity before making API requests.
- Dynamically constructs the API URL based on provided parameters.
- Supports uploading report content and platform definitions.
- Handles responses and validates the response code.
- Logs errors in case of API request failure.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the report will be created.
- **Type:** String
- **Mandatory:** Yes

### ReportName

- **Description:** The name of the report to be created.
- **Type:** String
- **Mandatory:** Yes
- **Validation:** Only alphanumeric characters and underscores are allowed.

### ReportDescription

- **Description:** An optional description for the report.
- **Type:** String
- **Mandatory:** No

### ReportPathDefinition

- **Description:** The required path to the folder containing all files for the Report definition to be uploaded.
- **Type:** String
- **Mandatory:** Yes

## Usage Examples

### Example 1: Create a report

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
New-FabricReport -WorkspaceId $workspace.id -ReportName "Report01"
```

### Example 2: Create a report with a description

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
New-FabricReport -WorkspaceId $workspace.id -ReportName "Report02" -ReportDescription "Report Description" -ReportPathDefinition "C:\temp\API\Report"
```

## Prerequisites

- Ensure that `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`, is correctly configured with the required authentication details.
- Token validation should be handled using `Test-TokenExpired`.

## Key Workflow

1. Validates the token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl` and `WorkspaceId`.
3. Prepares the request body with report details and optional content.
4. Sends the POST request to the Microsoft Fabric API to create the report.
5. Handles API responses, including long-running operations and retries.

## Error Handling

- The function logs errors at different stages, such as validation failures, API response errors, and unexpected statuses.
- Comprehensive error handling is included to assist in debugging.

## Author

**Tiago Balabuch**