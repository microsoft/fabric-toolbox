# Update-FabricSemanticModelDefinition

## Overview

Updates the definition of an existing SemanticModel in a Microsoft Fabric workspace by sending a PATCH request to the Microsoft Fabric API.

## Features

- Sends a PATCH request to update the content or metadata of a specified SemanticModel.
- Validates token expiration before making the API request.
- Handles API responses with detailed error logging.
- Supports encoding SemanticModel content as Base64.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the SemanticModel exists.
- **Type:** String
- **Mandatory:** Yes

### SemanticModelId

- **Description:** The unique identifier of the SemanticModel to be updated.
- **Type:** String
- **Mandatory:** Yes

### SemanticModelPathDefinition

- **Description:** The required path to the folder containing all files for the SemanticModel definition to be uploaded.
- **Type:** String
- **Mandatory:** Yes

## Usage Examples

### Example 1: Update SemanticModel Definition with a new JSON file

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$semanticModel = Get-FabricSemanticModel -WorkspaceId $workspace.id -SemanticModelName "SemanticModel-67890"
Update-FabricSemanticModelDefinition -WorkspaceId $workspace.id -SemanticModelId $semanticModel.id -SemanticModelPathDefinition "C:\temp\API\SemanticModel\Updated"

```

## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `SemanticModelId`.
3. Sends a PATCH request to the Microsoft Fabric API with the encoded SemanticModel content.
4. Handles API responses:
   - `200`: SemanticModel definition updated successfully.
   - `202`: SemanticModel definition update accepted, but operation is in progress.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Provides robust error logging to assist in debugging issues.

## Author

**Tiago Balabuch**