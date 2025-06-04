# Update-FabricSparkJobDefinition

## Overview

The `Update-FabricSparkJobDefinition` function updates an existing SparkJobDefinition in a specified Microsoft Fabric workspace.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the SparkJobDefinition exists.
- **Type:** String
- **Mandatory:** No

### SparkJobDefinitionId

- **Description:** The unique identifier of the SparkJobDefinition to be updated.
- **Type:** String
- **Mandatory:** Yes

### SparkJobDefinitionName

- **Description:** The new name of the SparkJobDefinition.
- **Type:** String
- **Mandatory:** Yes

### SparkJobDefinitionDescription

- **Description:** An optional new description for the SparkJobDefinition.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Update a SparkJobDefinition Name and Description

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$sparkJobDefinition = Get-FabricSparkJobDefinition -WorkspaceId $workspace.id -SparkJobDefinitionName "SparkJobDefinition02"
Update-FabricSparkJobDefinition -WorkspaceId $workspace.id -SparkJobDefinitionId $sparkJobDefinition.id -SparkJobDefinitionName "SparkJobDefinition02 Updated" -SparkJobDefinitionDescription "Spark Job Definition Updated"
```

## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `SparkJobDefinitionId`.
3. Constructs the JSON request body with optional description.
4. Sends a PATCH request to the Microsoft Fabric API.
5. Handles API responses:
   - `200`: SparkJobDefinition updated successfully.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Provides robust error logging to assist in debugging issues.

## Author

**Tiago Balabuch**