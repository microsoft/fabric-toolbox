# Remove-FabricSemanticModel

## Overview

Deletes a SemanticModel from a specified workspace in Microsoft Fabric.

## Features

- Sends a DELETE request to remove the SemanticModel.
- Validates token expiration before making the API request.
- Logs detailed messages for debugging and error handling.

## Parameters

### WorkspaceId *(Mandatory)*

- **Description:** The unique identifier of the workspace containing the SemanticModel to delete.
- **Type:** String

### SemanticModelId *(Mandatory)*

- **Description:** The unique identifier of the SemanticModel to be deleted.
- **Type:** String

## Usage Examples

### Example 1: Removing a SemanticModel

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$semanticModel = Get-FabricSemanticModel -WorkspaceId $workspace.id -SemanticModelName "SemanticModel-67890"
Remove-FabricSemanticModel -WorkspaceId $workspace.id -SemanticModelId $semanticModel.id
```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set the global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token's validity using `Test-TokenExpired`.
2. Constructs the API URL for the DELETE request using the provided parameters.
3. Sends the DELETE request to remove the specified SemanticModel.
4. Logs detailed responses and errors for debugging purposes.

## Error Handling

- Logs descriptive error messages if the API request fails or invalid input is detected.
- Returns `null` if an error occurs during execution.

## Author

**Tiago Balabuch**