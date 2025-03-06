# Get-FabricReport

## Overview

The `Get-FabricReport` function retrieves Report details from a specified Microsoft Fabric workspace using either the provided ReportId or ReportName.

## Features

- Validates token expiration before making the API request.
- Supports retrieval by Report ID or name.
- Handles paginated API responses using continuation tokens.
- Provides error handling and descriptive logging.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the Report exists.
- **Type:** String
- **Mandatory:** Yes

### ReportId

- **Description:** The unique identifier of the Report to retrieve.
- **Type:** String
- **Mandatory:** No

### ReportName

- **Description:** The name of the Report to retrieve.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Get a list of Reports

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricReport -WorkspaceId $workspace.id
```

### Example 2: Get a Report by name

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricReport -WorkspaceId $workspace.id -ReportName "My Report"
```

### Example 3: Get a Report by ID

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricReport -WorkspaceId $workspace.id -ReportId "12345-67890"
```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set the global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Ensures only one filter (`ReportId` or `ReportName`) is provided.
2. Validates the authentication token using `Test-TokenExpired`.
3. Constructs the API URL and retrieves Report details using paginated responses if needed.
4. Filters the response data based on the provided parameters.
5. Logs descriptive messages for debugging and error handling.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**