# Remove-FabricNotebook

## Overview

Deletes a Notebook from a specified workspace in Microsoft Fabric.

## Features

- Sends a DELETE request to remove the Notebook.
- Validates token expiration before making the API request.
- Logs detailed messages for debugging and error handling.

## Parameters

### WorkspaceId *(Mandatory)*

- **Description:** The unique identifier of the workspace containing the Notebook to delete.
- **Type:** String

### NotebookId *(Mandatory)*

- **Description:** The unique identifier of the Notebook to be deleted.
- **Type:** String

## Usage Examples

### Example 1: Removing a Notebook

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Remove-FabricNotebook -WorkspaceId $workspace.id -NotebookId "notebook-67890"
```

This example removes the Notebook with ID `notebook-67890` from the workspace with name `workspace-12345`.

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set the global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token's validity using `Test-TokenExpired`.
2. Constructs the API URL for the DELETE request using the provided parameters.
3. Sends the DELETE request to remove the specified Notebook.
4. Logs detailed responses and errors for debugging purposes.

## Error Handling

- Logs descriptive error messages if the API request fails or invalid input is detected.
- Returns `null` if an error occurs during execution.

## Author

**Tiago Balabuch**