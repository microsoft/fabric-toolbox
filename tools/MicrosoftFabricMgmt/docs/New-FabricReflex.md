# New-FabricReflex

## Overview

The `New-FabricReflex` function creates a new Reflex within a specified Microsoft Fabric workspace. This function streamlines Reflex creation by supporting descriptions and path definitions for enhanced functionality.

## Description

This function sends a POST request to the Microsoft Fabric API to create a Reflex in the specified workspace. It validates token authentication, constructs the necessary API request, and handles responses, including long-running operations.

## Features

- Ensures token validity before making API requests.
- Dynamically constructs the API URL based on provided parameters.
- Supports uploading Reflex definitions and platform-specific files.
- Handles long-running operations and retries.
- Logs errors for better debugging and transparency.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the Reflex will be created.
- **Type:** String
- **Mandatory:** Yes

### ReflexName

- **Description:** The name of the Reflex to be created.
- **Type:** String
- **Mandatory:** Yes
- **Validation:** Only alphanumeric characters, spaces, and underscores are allowed.

### ReflexDescription

- **Description:** An optional description for the Reflex.
- **Type:** String
- **Mandatory:** No

### ReflexPathDefinition

- **Description:** An optional path to the Reflex definition file to upload.
- **Type:** String
- **Mandatory:** No

### ReflexPathPlatformDefinition

- **Description:** An optional path to the platform-specific definition file to upload.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Create a Reflex without additional content

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
New-FabricReflex -WorkspaceId $workspace.id -ReflexName "Reflex01"
```

### Example 2: Create a Reflex with a description

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
New-FabricReflex -WorkspaceId $workspace.id -ReflexName "Reflex02" -ReflexDescription "Description of Reflex"
```

### Example 3: Create a Reflex with a content file

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
New-FabricReflex `
    -WorkspaceId $workspace.id `
    -ReflexName "Reflex03" `
    -ReflexDescription "Description of Reflex" `
    -ReflexPathDefinition "C:\temp\Reflex\ReflexEntities.json"
```

## Prerequisites

- Ensure that `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`, is correctly set with the required authentication details.
- Token validation is handled using `Test-TokenExpired`.

## Key Workflow

1. Validates the token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl` and `WorkspaceId`.
3. Prepares the request body with Reflex details and optional content.
4. Sends the POST request to the Microsoft Fabric API to create the Reflex.
5. Handles API responses, including long-running operations and retries.

## Error Handling

- Logs errors at various stages, such as validation failures, API response errors, and unexpected statuses.
- Comprehensive error handling aids in debugging and ensures robustness.

## Author

**Tiago Balabuch**