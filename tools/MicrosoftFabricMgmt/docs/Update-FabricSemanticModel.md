# Update-FabricSemanticModel

## Overview

The `Update-FabricSemanticModel` function updates the name and/or description of an existing SemanticModel in a specified Microsoft Fabric workspace.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the SemanticModel exists.
- **Type:** String
- **Mandatory:** No

### SemanticModelId

- **Description:** The unique identifier of the SemanticModel to be updated.
- **Type:** String
- **Mandatory:** Yes

### SemanticModelName

- **Description:** The new name of the SemanticModel.
- **Type:** String
- **Mandatory:** Yes

### SemanticModelDescription

- **Description:** An optional new description for the SemanticModel.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Update a SemanticModel Name and Description

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$semanticModel = Get-FabricSemanticModel -WorkspaceId $workspace.id -SemanticModelName "SemanticModel-12345"
Update-FabricSemanticModel -WorkspaceId $workspace.id -SemanticModelId $semanticModel.id -SemanticModelName "Updated SemanticModel" -SemanticModelDescription "Updated description"
```

### Example 2: Update a SemanticModel Name Only

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$semanticModel = Get-FabricSemanticModel -WorkspaceId $workspace.id -SemanticModelName "SemanticModel-12345"
Update-FabricSemanticModel -WorkspaceId $workspace.id -SemanticModelId $semanticModel.id -SemanticModelName "UpdatedName"
```

## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `SemanticModelId`.
3. Constructs the JSON request body with optional description.
4. Sends a PATCH request to the Microsoft Fabric API.
5. Handles API responses:
   - `200`: SemanticModel updated successfully.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Provides robust error logging to assist in debugging issues.

## Author

**Tiago Balabuch**
