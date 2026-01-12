# Get-FabricNotebookDefinition

## Overview

The `Get-FabricNotebookDefinition` function retrieves the definition of a notebook from a specific workspace in Microsoft Fabric.

## Description

This function fetches the notebook's content or metadata from a workspace. It supports retrieving notebook definitions in the Jupyter Notebook (`ipynb`) format. Handles both synchronous and asynchronous operations, with detailed logging and error handling.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace from which the notebook definition is to be retrieved.
- **Type:** String
- **Mandatory:** Yes

### NotebookId

- **Description:** (Optional) The unique identifier of the notebook whose definition needs to be retrieved.
- **Type:** String
- **Mandatory:** No

### NotebookFormat

- **Description:** Specifies the format of the notebook definition. Currently, only 'ipynb' is supported.
- **Type:** String
- **Mandatory:** No
- **Default:** 'ipynb'

## Examples

### Example 1: Retrieve a Notebook Definition

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$notebook = Get-FabricNotebook -WorkspaceId $workspace.id -NotebookName "Notebook03"
Get-FabricNotebookDefinition -WorkspaceId $workspace.id -NotebookId $notebook.id
```

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, `NotebookId`, and `NotebookFormat` (if provided).
3. Sends a POST request to retrieve the Notebook definition.
4. Handles both immediate responses and long-running operations.
5. Validates the API response and processes the definition.

## Error Handling

- Logs descriptive error messages for failed API requests or invalid inputs.
- Returns `null` for any errors encountered during execution.
- Handles long-running operations and retries if necessary.

## Author

**Tiago Balabuch**