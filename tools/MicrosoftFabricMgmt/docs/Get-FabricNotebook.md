# Get-FabricNotebook

## Overview

The `Get-FabricNotebook` function retrieves Notebook details from a specified Microsoft Fabric workspace using either the provided NotebookId or NotebookName.

## Features

- Validates token expiration before making the API request.
- Supports retrieval by Notebook ID or name.
- Handles paginated API responses using continuation tokens.
- Provides error handling and descriptive logging.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the Notebook exists.
- **Type:** String
- **Mandatory:** Yes

### NotebookId

- **Description:** The unique identifier of the Notebook to retrieve.
- **Type:** String
- **Mandatory:** No

### NotebookName

- **Description:** The name of the Notebook to retrieve.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Get a list of Notebooks

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricNotebook -WorkspaceId $workspace.id
```

### Example 2: Get a Notebook by name

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricNotebook -WorkspaceId $workspace.id -NotebookName "Development"
```

### Example 3: Get a Notebook by ID

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricNotebook -WorkspaceId $workspace.id -NotebookId "12345-67890"
```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Ensures only one filter (`NotebookId` or `NotebookName`) is provided.
2. Validates the authentication token using `Test-TokenExpired`.
3. Constructs the API URL and retrieves Notebook details using paginated responses if needed.
4. Filters the response data based on the provided parameters.
5. Logs descriptive messages for debugging and error handling.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**
