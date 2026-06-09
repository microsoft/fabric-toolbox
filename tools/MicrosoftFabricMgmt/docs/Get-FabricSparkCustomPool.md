# Get-FabricSparkCustomPool

## Overview

The `Get-FabricSparkCustomPool` function retrieves all Spark custom pools from a specified workspace in Microsoft Fabric. It handles token validation, constructs the API URL, makes the API request, and processes the response. The function supports filtering by SparkCustomPoolId or SparkCustomPoolName, but not both simultaneously.

## Features

- Validates token expiration before making the API request.
- Handles paginated API responses using continuation tokens.
- Supports filtering by SparkCustomPoolId or SparkCustomPoolName.
- Provides error handling and descriptive logging.

## Parameters

### WorkspaceId

- **Description:** The ID of the workspace from which to retrieve Spark custom pools.
- **Type:** String
- **Mandatory:** Yes

### SparkCustomPoolId

- **Description:** The ID of the specific Spark custom pool to retrieve.
- **Type:** String
- **Mandatory:** No

### SparkCustomPoolName

- **Description:** The name of the specific Spark custom pool to retrieve.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Get all Spark custom pools

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricSparkCustomPool -WorkspaceId $workspace.id
```

### Example 2: Get a specific Spark custom pool by ID

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricSparkCustomPool -WorkspaceId $workspace.id -SparkCustomPoolId "992a9753-fb26-4dbe-8433-ccd571a2b6f2"
```

### Example 3: Get a specific Spark custom pool by name

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricSparkCustomPool -WorkspaceId $workspace.id -SparkCustomPoolName "MyPool"
```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set the global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Ensures only one filter (`SparkCustomPoolId` or `SparkCustomPoolName`) is provided.
2. Validates the authentication token using `Test-TokenExpired`.
3. Constructs the API URL and retrieves Spark custom pool details using paginated responses if needed.
4. Filters the response data based on the provided parameters.
5. Logs descriptive messages for debugging and error handling.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**