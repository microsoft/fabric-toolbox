# Get-FabricSemanticModel

## Overview

The `Get-FabricSemanticModel` function retrieves SemanticModel details from a specified Microsoft Fabric workspace using either the provided SemanticModelId or SemanticModelName.

## Features

- Validates token expiration before making the API request.
- Supports retrieval by SemanticModel ID or name.
- Handles paginated API responses using continuation tokens.
- Provides error handling and descriptive logging.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the SemanticModel exists.
- **Type:** String
- **Mandatory:** Yes

### SemanticModelId

- **Description:** The unique identifier of the SemanticModel to retrieve.
- **Type:** String
- **Mandatory:** No

### SemanticModelName

- **Description:** The name of the SemanticModel to retrieve.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Get a list of Semantic Models

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricSemanticModel -WorkspaceId $workspace.id
```

### Example 2: Get a Semantic Model by name

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricSemanticModel -WorkspaceId $workspace.id -SemanticModelName "SM-12345"
```

### Example 3: Get a Semantic Model by ID

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricSemanticModel -WorkspaceId $workspace.id -SemanticModelId "754d670c-1df0-474e-b309-26505069dd5b"
```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set the global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Ensures only one filter (`SemanticModelId` or `SemanticModelName`) is provided.
2. Validates the authentication token using `Test-TokenExpired`.
3. Constructs the API URL and retrieves SemanticModel details using paginated responses if needed.
4. Filters the response data based on the provided parameters.
5. Logs descriptive messages for debugging and error handling.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**