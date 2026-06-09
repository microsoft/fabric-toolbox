# Get-FabricSparkJobDefinition

## Overview

The `Get-FabricSparkJobDefinition` function retrieves SparkJobDefinition details from a specified Microsoft Fabric workspace using either the provided SparkJobDefinitionId or SparkJobDefinitionName.

## Features

- Validates token expiration before making the API request.
- Supports retrieval by SparkJobDefinition ID or name.
- Handles paginated API responses using continuation tokens.
- Provides error handling and descriptive logging.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the SparkJobDefinition exists.
- **Type:** String
- **Mandatory:** Yes

### SparkJobDefinitionId

- **Description:** The unique identifier of the SparkJobDefinition to retrieve.
- **Type:** String
- **Mandatory:** No

### SparkJobDefinitionName

- **Description:** The name of the SparkJobDefinition to retrieve.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Get a list of Spark Job Definitions

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricSparkJobDefinition -WorkspaceId $workspace.id
```

### Example 2: Get a Spark Job Definition by name

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricSparkJobDefinition -WorkspaceId $workspace.id -SparkJobDefinitionName "My SparkJobDefinition"
```

### Example 3: Get a Spark Job Definition by ID

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricSparkJobDefinition -WorkspaceId $workspace.id -SparkJobDefinitionId "1ebac6a4-c531-4b8c-a421-4057325db497"
```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set the global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Ensures only one filter (`SparkJobDefinitionId` or `SparkJobDefinitionName`) is provided.
2. Validates the authentication token using `Test-TokenExpired`.
3. Constructs the API URL and retrieves SparkJobDefinition details using paginated responses if needed.
4. Filters the response data based on the provided parameters.
5. Logs descriptive messages for debugging and error handling.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**