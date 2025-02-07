# New-FabricSemanticModel

## Overview

The `New-FabricSemanticModel` function creates a new SemanticModel in a specified Microsoft Fabric workspace. This function facilitates integrating data and analytics by setting up a SemanticModel with options for providing descriptions and uploading definition files.

## Description

This function sends a POST request to the Microsoft Fabric API to create a new SemanticModel in the given workspace. It supports optional parameters for adding descriptions and defining paths for SemanticModel content. The function handles token validation, API request construction, and error handling.

## Features

- Ensures token validity before making API requests.
- Dynamically constructs the API URL based on provided parameters.
- Supports uploading SemanticModel content and platform definitions.
- Handles responses and validates the response code.
- Logs errors in case of API request failure.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the SemanticModel will be created.
- **Type:** String
- **Mandatory:** Yes

### SemanticModelName

- **Description:** The name of the SemanticModel to be created.
- **Type:** String
- **Mandatory:** Yes
- **Validation:** Only alphanumeric characters and underscores are allowed.

### SemanticModelDescription

- **Description:** An optional description for the SemanticModel.
- **Type:** String
- **Mandatory:** No

### SemanticModelPathDefinition

- **Description:** The required path to the folder containing all files for the Semantic Model definition to be uploaded.
- **Type:** String
- **Mandatory:** Yes

## Usage Examples

### Example 1: Create a SemanticModel

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
New-FabricSemanticModel -WorkspaceId $workspace.id -SemanticModelName "SemanticModel-123456" -SemanticModelPathDefinition "C:\temp\API\SemanticModel"

```

## Prerequisites

- Ensure that `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`, is correctly configured with the required authentication details.
- Token validation should be handled using `Test-TokenExpired`.

## Key Workflow

1. Validates the token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl` and `WorkspaceId`.
3. Prepares the request body with SemanticModel details and optional content.
4. Sends the POST request to the Microsoft Fabric API to create the SemanticModel.
5. Handles API responses, including long-running operations and retries.

## Error Handling

- The function logs errors at different stages, such as validation failures, API response errors, and unexpected statuses.
- Comprehensive error handling is included to assist in debugging.

## Author

**Tiago Balabuch**