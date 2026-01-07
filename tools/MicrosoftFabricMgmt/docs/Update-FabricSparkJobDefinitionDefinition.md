# Update-FabricSparkJobDefinitionDefinition

## Overview

Updates the definition of an existing SparkJobDefinition in a specified Microsoft Fabric workspace by sending a PATCH request to the Microsoft Fabric API.

## Features

- Sends a PATCH request to update the content or metadata of a specified SparkJobDefinition.
- Validates token expiration before making the API request.
- Handles API responses with detailed error logging.
- Supports encoding SparkJobDefinition and platform-specific definition as Base64.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the SparkJobDefinition exists.
- **Type:** String
- **Mandatory:** Yes

### SparkJobDefinitionId

- **Description:** The unique identifier of the SparkJobDefinition to be updated.
- **Type:** String
- **Mandatory:** Yes

### SparkJobDefinitionPathDefinition

- **Description:** The required path to the SparkJobDefinition definition file to upload.
- **Type:** String
- **Mandatory:** Yes

### SparkJobDefinitionPathPlatformDefinition

- **Description:** An optional path to the platform-specific definition file to upload.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Update SparkJobDefinition Definition with a new JSON file

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$sparkJobDefinition = Get-FabricSparkJobDefinition -WorkspaceId $workspace.id -SparkJobDefinitionName "SparkJobDefinition01"
Update-FabricSparkJobDefinitionDefinition `
-WorkspaceId $workspace.id `
-SparkJobDefinitionId $sparkJobDefinition.id `
-SparkJobDefinitionPathDefinition "C:\temp\API\SparkJobDefinition\Definition.json"
```

## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `SparkJobDefinitionId`.
3. Sends a PATCH request to the Microsoft Fabric API with the encoded SparkJobDefinition content.
4. Handles API responses:
   - `200`: SparkJobDefinition definition updated successfully.
   - `202`: SparkJobDefinition definition update accepted, but operation is in progress.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Provides robust error logging to assist in debugging issues.

## Author

**Tiago Balabuch**