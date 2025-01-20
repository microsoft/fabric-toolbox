# New-FabricNotebook

## Overview

The `New-FabricNotebook` function creates a new notebook within a specified Microsoft Fabric workspace. This function facilitates integrating data and analytics by setting up a notebook with options for providing descriptions and uploading notebook content.

## Description

This function sends a POST request to the Microsoft Fabric API to create a new notebook in the given workspace. It supports optional parameters for adding descriptions and defining paths for notebook content. The function handles token validation, API request construction, and error handling.

## Features

- Ensures token validity before making API requests.
- Dynamically constructs the API URL based on provided parameters.
- Supports uploading notebook content and platform definitions.
- Handles responses and validates the response code.
- Logs errors in case of API request failure.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the notebook will be created.
- **Type:** String
- **Mandatory:** Yes

### NotebookName

- **Description:** The name of the notebook to be created.
- **Type:** String
- **Mandatory:** Yes
- **Validation:** Only alphanumeric characters and underscores are allowed.

### NotebookDescription

- **Description:** An optional description for the notebook.
- **Type:** String
- **Mandatory:** No

### NotebookPathDefinition

- **Description:** An optional path to the notebook definition file (e.g., .ipynb file) to upload.
- **Type:** String
- **Mandatory:** No

### NotebookPathPlatformDefinition

- **Description:** An optional path to the platform-specific definition file (e.g., .platform file) to upload.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Create a notebook without additional content

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
New-FabricNotebook -WorkspaceId $workspace.id -NotebookName "Notebook01"
```

### Example 2: Create a notebook with a description 

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
New-FabricNotebook -WorkspaceId $workspace.id -NotebookName "Notebook02" -NotebookDescription "Notebook"
```

### Example 3: Create a notebook with a content file

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
New-FabricNotebook `
-WorkspaceId $workspace.id `
-NotebookName "Notebook03" `
-NotebookDescription "Notebook Description" `
-NotebookPathDefinition "C:\temp\API\Notebook\SimpleExample.ipynb"
```

## Prerequisites

- Ensure that `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`, is correctly configured with the required authentication details.
- Token validation should be handled using `Test-TokenExpired`.

## Key Workflow

1. Validates the token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl` and `WorkspaceId`.
3. Prepares the request body with notebook details and optional content.
4. Sends the POST request to the Microsoft Fabric API to create the notebook.
5. Handles API responses, including long-running operations and retries.

## Error Handling

- The function logs errors at different stages, such as validation failures, API response errors, and unexpected statuses.
- Comprehensive error handling is included to assist in debugging.

## Author

**Tiago Balabuch**