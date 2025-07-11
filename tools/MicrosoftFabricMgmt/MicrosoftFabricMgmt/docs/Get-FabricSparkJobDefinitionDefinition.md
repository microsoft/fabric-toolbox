# Get-FabricSparkJobDefinitionDefinition

## Overview

Retrieves the definition of a SparkJobDefinition from a specified Microsoft Fabric workspace.

## Features

- Sends a POST request to retrieve the content or metadata of a specified SparkJobDefinition.
- Validates token expiration before making the API request.
- Handles API responses with detailed error logging.
- Supports different formats for the SparkJobDefinition definition.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the SparkJobDefinition exists.
- **Type:** String
- **Mandatory:** Yes

### SparkJobDefinitionId

- **Description:** The unique identifier of the SparkJobDefinition to retrieve the definition for.
- **Type:** String
- **Mandatory:** Yes

### SparkJobDefinitionFormat

- **Description:** The format in which to retrieve the SparkJobDefinition definition.
- **Type:** String
- **Optional:** Yes
- **Default Value:** "SparkJobDefinitionV1"

## Usage Examples

### Example 1: Retrieve SparkJobDefinition Definition in default format

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$sparkJobDefinition = Get-FabricSparkJobDefinition -WorkspaceId $workspace.id -SparkJobDefinitionName "SparkJobDefinition-67890"
```

## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `SparkJobDefinitionId`.
3. Sends a POST request to the Microsoft Fabric API to retrieve the definition.
4. Handles API responses:
   - `200`: SparkJobDefinition definition retrieved successfully.
   - `202`: SparkJobDefinition definition retrieval request accepted, but operation is in progress.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Provides robust error logging to assist in debugging issues.

## Author

**Tiago Balabuch**