# Update-FabricMLModel

## Overview

Updates an existing ML Model in a specified Microsoft Fabric workspace.

## Features

- Sends a PATCH request to update the ML Model.
- Supports updating the ML Model name and description.
- Validates token expiration before making the API request.
- Logs detailed messages for debugging and error handling.

## Parameters

### WorkspaceId *(Mandatory)*

- **Description:** The ID of the workspace containing the ML Model to update.
- **Type:** String

### MLModelId *(Mandatory)*

- **Description:** The ID of the ML Model to update.
- **Type:** String

### MLModelName *(Mandatory)*

- **Description:** The new name of the ML Model.
- **Type:** String
- **Validation:** Must contain only alphanumeric characters or underscores.

### MLModelDescription *(Optional)*

- **Description:** The new description for the ML Model.
- **Type:** String

## Usage Examples

### Example 1: Updating an ML Model

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Update-FabricMLModel -WorkspaceId $workspace.id -MLModelId "Model-67890" -MLModelName "Updated ML Model" -MLModelDescription "Updated description"
```

This example updates the ML Model with ID `Model-67890` in the workspace with name `workspace-12345`, setting a new name and description.

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set the global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates that all required parameters are provided.
2. Ensures the authentication token is valid.
3. Constructs the API URL and request body based on provided input.
4. Sends a PATCH request to update the ML Model.
5. Handles errors gracefully, logging descriptive messages for debugging.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**
