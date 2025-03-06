# Update-FabricReflex

## Overview

The `Update-FabricReflex` function updates an existing Reflex in a specified Microsoft Fabric workspace by making a PATCH request to the API.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the Reflex exists.
- **Type:** String
- **Mandatory:** Yes

### ReflexId

- **Description:** The unique identifier of the Reflex to be updated.
- **Type:** String
- **Mandatory:** Yes

### ReflexName

- **Description:** The new name of the Reflex.
- **Type:** String
- **Mandatory:** Yes

### ReflexDescription

- **Description:** An optional new description for the Reflex.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Update a Reflex Name

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$reflex = Get-FabricReflex -WorkspaceId $workspace.id -ReflexName "Reflex-67890"
Update-FabricReflex -WorkspaceId $workspace.id -ReflexId $reflex.id -ReflexName "Updated Reflex"
```

### Example 2: Update a Reflex Name and Description

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$reflex = Get-FabricReflex -WorkspaceId $workspace.id -ReflexName "Reflex-67890"
Update-FabricReflex -WorkspaceId $workspace.id -ReflexId $reflex.id -ReflexName "Updated Reflex" -ReflexDescription "Updated description"
```

## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `ReflexId`.
3. Constructs the JSON request body with optional description.
4. Sends a PATCH request to the Microsoft Fabric API.
5. Handles API responses:
   - `200`: Reflex updated successfully.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Provides robust error logging to assist in debugging issues.

## Author

**Tiago Balabuch**
