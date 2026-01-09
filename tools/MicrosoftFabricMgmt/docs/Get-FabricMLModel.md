# Get-FabricMLModel

## Overview
The `Get-FabricMLModel` function retrieves ML Model details from a specified Microsoft Fabric workspace using either the provided MLModelId or MLModelName.

## Features
- Validates token expiration before making the API request.
- Supports retrieval by ML Model ID or name.
- Handles paginated API responses using continuation tokens.
- Provides detailed error handling and logging for debugging.

## Parameters

### WorkspaceId
- **Description:** The unique identifier of the workspace where the ML Model exists.
- **Type:** String
- **Mandatory:** Yes

### MLModelId
- **Description:** The unique identifier of the ML Model to retrieve.
- **Type:** String
- **Mandatory:** No

### MLModelName
- **Description:** The name of the ML Model to retrieve.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Retrieve an ML Model by ID

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricMLModel -WorkspaceId $workspace.id -MLModelId "MLModel-67890"
```

This example retrieves the ML Model details for the experiment with ID `MLModel-67890` in the workspace with ID `workspace-12345`.

### Example 2: Retrieve an ML Model by Name

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricMLModel -WorkspaceId $workspace.id -MLModelName "MLModel-12345"
```

This example retrieves the ML Model details for the experiment named `MLModel-12345` in the workspace with ID `workspace-12345`.

### Example 3: Retrieve All ML Models in a Workspace

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricMLModel -WorkspaceId $workspace.id
```

This example retrieves all ML Models in the workspace with ID `workspace-12345`.

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set the global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Ensures only one filter (`MLModelId` or `MLModelName`) is provided.
2. Validates the authentication token using `Test-TokenExpired`.
3. Constructs the API URL and retrieves ML Model details using paginated responses if needed.
4. Filters the response data based on the provided parameters.
5. Logs descriptive messages for debugging and error handling.

## Error Handling

- Logs detailed error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**