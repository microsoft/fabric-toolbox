# Update-FabricNotebookDefinition

## Overview

Updates the definition of a notebook in a Microsoft Fabric workspace by sending a POST request to the Microsoft Fabric API.

## Features

- Sends a POST request to update the content or metadata of a specified notebook.
- Validates token expiration before making the API request.
- Handles API responses with detailed error logging.
- Supports encoding notebook content as Base64.

## Parameters

### WorkspaceId

- **Description:** The ID of the workspace containing the notebook to update.
- **Type:** String
- **Mandatory:** Yes

### NotebookId

- **Description:** The ID of the notebook to be updated.
- **Type:** String
- **Mandatory:** Yes

### NotebookPathDefinition

- **Description:** The file path to the notebook content definition file. The content will be encoded as Base64.
- **Type:** String
- **Mandatory:** Yes

### NotebookPathPlatformDefinition

- **Description:** (Optional) The file path to the notebook's platform-specific definition file.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Update Notebook Definition with a new ipynb file

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$notebook = Get-FabricNotebook -WorkspaceId $workspace.id -NotebookName "Notebook01"
Update-FabricNotebookDefinition `
    -WorkspaceId $workspace.id `
    -NotebookId $notebook.id `
    -NotebookPathDefinition "C:\temp\API\Notebook\SimpleExample.ipynb" 
```

### Example 2: Update Notebook Definition with a new ipynb file and a new platform file

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$notebook = Get-FabricNotebook -WorkspaceId $workspace.id -NotebookName "Notebook01"
Update-FabricNotebookDefinition `
    -WorkspaceId $workspace.id `
    -NotebookId $notebook.id `
    -NotebookPathDefinition "C:\temp\API\Notebook\SimpleExample.ipynb" `
    -NotebookPathPlatformDefinition "C:\temp\API\Notebook\.platform" 
```

## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `NotebookId`.
3. Sends a POST request to the Microsoft Fabric API with the encoded notebook content.
4. Handles API responses:
   - `200`: Notebook updated successfully.
   - `202`: Notebook update accepted, but operation is in progress.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Provides robust error logging to assist in debugging issues.

## Author

**Tiago Balabuch**