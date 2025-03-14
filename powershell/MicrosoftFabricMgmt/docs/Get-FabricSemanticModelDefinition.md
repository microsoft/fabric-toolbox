# Get-FabricSemanticModelDefinition

## Overview

The `Get-FabricSemanticModelDefinition` function retrieves the definition of a SemanticModel from a specific workspace in Microsoft Fabric.

## Description

This function fetches the definition of a SemanticModel from a workspace using the provided `SemanticModelId`. It handles token validation, constructs the API URL, makes the API request, and processes the response.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the SemanticModel exists.
- **Type:** String
- **Mandatory:** Yes

### SemanticModelId

- **Description:** The unique identifier of the SemanticModel to retrieve the definition for.
- **Type:** String
- **Mandatory:** No

### SemanticModelFormat

- **Description:** The format in which to retrieve the SemanticModel definition. 
- **Type:** String
- **Mandatory:** No

## Examples

### Example 1: Retrieve the SemanticModel Definition

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$semanticModel = Get-FabricSemanticModel -WorkspaceId $workspace.id -SemanticModelName "SemanticModel-67890"
Get-FabricSemanticModelDefinition -WorkspaceId $workspace.id -SemanticModelId $semanticModel.id
```

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `SemanticModelId`.
3. Sends a POST request to retrieve the SemanticModel definition.
4. Handles both immediate responses and long-running operations.
5. Validates the API response and processes the definition.

## Error Handling

- Logs descriptive error messages for failed API requests or invalid inputs.
- Returns `null` for any errors encountered during execution.
- Handles long-running operations and retries if necessary.

## Author

**Tiago Balabuch**