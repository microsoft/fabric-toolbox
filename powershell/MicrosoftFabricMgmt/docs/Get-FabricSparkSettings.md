# Get-FabricSparkSettings

## Overview

The `Get-FabricSparkSettings` function retrieves Spark settings from a specified Microsoft Fabric workspace. It handles token validation, constructs the API URL, makes the API request, and processes the response.

## Features

- Validates token expiration before making the API request.
- Handles paginated API responses using continuation tokens.
- Provides error handling and descriptive logging.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace from which to retrieve Spark settings.
- **Type:** String
- **Mandatory:** Yes

## Usage Examples

### Example 1: Retrieve Spark settings for a workspace

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricSparkSettings -WorkspaceId $workspace.id
```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set the global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates token validity using `Test-TokenExpired`.
2. Constructs the API URL and retrieves Spark settings using paginated responses if needed.
3. Logs descriptive messages for debugging and error handling.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**