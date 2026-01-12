# Update-FabricNotebook

## Overview

The `Update-FabricNotebook` function updates the name and/or description of a specified Fabric Notebook by making a PATCH request to the API.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace containing the Notebook.
- **Type:** String
- **Mandatory:** Yes

### NotebookId

- **Description:** The unique identifier of the Notebook to be updated.
- **Type:** String
- **Mandatory:** Yes

### NotebookName

- **Description:** The new name for the Notebook.
- **Type:** String
- **Mandatory:** Yes

### NotebookDescription

- **Description:** An optional description for the Notebook.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Update a Notebook Name

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$notebook = Get-FabricNotebook -WorkspaceId $workspace.id -NotebookName "Notebook-12345"
Update-FabricNotebook -WorkspaceId $workspace.id -NotebookId $notebook.id -NotebookName "NewNotebookName"
```

### Example 2: Update a Notebook Name and Description

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$notebook = Get-FabricNotebook -WorkspaceId $workspace.id -NotebookName "Notebook-12345"
Update-FabricNotebook -WorkspaceId $workspace.id -NotebookId $notebook.id  -NotebookName "NewName" -NotebookDescription "Updated description"
```

## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `NotebookId`.
3. Constructs the JSON request body with optional description.
4. Sends a PATCH request to the Microsoft Fabric API.
5. Handles API responses:
   - `200`: Notebook updated successfully.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Provides robust error logging to assist in debugging issues.

## Author

**Tiago Balabuch**