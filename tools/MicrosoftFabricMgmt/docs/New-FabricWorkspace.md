# New-FabricWorkspace

## Overview

The `New-FabricWorkspace` function creates a new workspace within a specified Microsoft Fabric platform. This function simplifies the setup of a new workspace by allowing for optional descriptions and capacity configurations.

## Description

This function sends a POST request to the Microsoft Fabric API to create a new workspace. It handles token validation, API request construction, and response handling.

## Features

- Ensures token validity before making API requests.
- Dynamically constructs the API URL based on provided parameters.
- Supports adding an optional description for the workspace.
- Handles both immediate creation responses and long-running operation scenarios.
- Logs errors in case of API request failure.

## Parameters

### WorkspaceName

- **Description:** The display name of the workspace to be created. Must only contain alphanumeric characters, spaces, and underscores.
- **Type:** String
- **Mandatory:** Yes
- **Validation:** Only alphanumeric characters, spaces, and underscores are allowed.

### WorkspaceDescription

- **Description:** An optional description for the workspace.
- **Type:** String
- **Mandatory:** No

### CapacityId

- **Description:** An optional identifier for the capacity associated with the workspace.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Create a workspace

```powershell
New-FabricWorkspace -WorkspaceName "workspace-12345"
```

### Example 2: Create a workspace with a description

```powershell
New-FabricWorkspace -WorkspaceName "workspace-12345" -WorkspaceDescription "Description of the new workspace"
```

### Example 3: Create a workspace with capacity

```powershell
$capacity = Get-FabricCapacity -capacityName "capacity-12345"
New-FabricWorkspace -WorkspaceName "workspace-12345" $capacity.id
```

## Prerequisites

- Ensure that `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`, is correctly configured with the required authentication details.
- Token validation should be handled using `Test-TokenExpired`.

## Key Workflow

1. Validates the token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`.
3. Prepares the request body with workspace details, description (optional), and capacity (optional).
4. Sends the POST request to the Microsoft Fabric API to create the workspace.
5. Handles API responses, including long-running operations and retries.

## Error Handling

- The function logs errors at different stages, such as validation failures, API response errors, and unexpected statuses.
- Comprehensive error handling is included to assist in debugging.

## Author

**Tiago Balabuch**