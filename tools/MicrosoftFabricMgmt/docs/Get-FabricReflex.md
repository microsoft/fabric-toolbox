# Get-FabricReflex

## Overview

The `Get-FabricReflex` function retrieves Reflex details from a specified Microsoft Fabric workspace using either the provided ReflexId or ReflexName.

## Features

- Validates token expiration before making the API request.
- Supports retrieval by Reflex ID or name.
- Handles paginated API responses using continuation tokens.
- Provides error handling and descriptive logging.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the Reflex exists.
- **Type:** String
- **Mandatory:** Yes

### ReflexId

- **Description:** The unique identifier of the Reflex to retrieve.
- **Type:** String
- **Mandatory:** No

### ReflexName

- **Description:** The name of the Reflex to retrieve.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Get a list of Reflexes

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricReflex -WorkspaceId $workspace.id
```

### Example 2: Get a Reflex by name

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricReflex -WorkspaceId $workspace.id -ReflexName "My Reflex"
```

### Example 3: Get a Reflex by ID

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricReflex -WorkspaceId $workspace.id -ReflexId "Reflex-67890"
```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set the global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Ensures only one filter (`ReflexId` or `ReflexName`) is provided.
2. Validates the authentication token using `Test-TokenExpired`.
3. Constructs the API URL and retrieves Reflex details using paginated responses if needed.
4. Filters the response data based on the provided parameters.
5. Logs descriptive messages for debugging and error handling.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**