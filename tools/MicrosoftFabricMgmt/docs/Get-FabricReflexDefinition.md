# Get-FabricReflexDefinition

## Overview

Retrieves the definition of a Reflex from a specified Microsoft Fabric workspace. This function supports fetching Reflex definitions in various formats and handles long-running asynchronous operations when necessary.

## Features

- Fetches the content or metadata of a specific Reflex in a workspace.
- Handles long-running operations with detailed logging.
- Includes robust error handling and token validation.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the Reflex exists.
- **Type:** String
- **Mandatory:** Yes

### ReflexId

- **Description:** The unique identifier of the Reflex whose definition needs to be retrieved.
- **Type:** String
- **Mandatory:** No

### ReflexFormat

- **Description:** Specifies the format of the Reflex definition to retrieve. This parameter is optional.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Retrieve a Reflex definition

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$reflex = Get-FabricReflex -WorkspaceId $workspace.id -ReflexName "Reflex01"
Get-FabricReflexDefinition -WorkspaceId $workspace.id -ReflexId $reflex.id
```

## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Microsoft Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.
- Long-running operations are handled by `Get-FabricLongRunningOperation` and `Get-FabricLongRunningOperationResult`.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and optionally `ReflexId`.
3. Sends a POST request to the Microsoft Fabric API.
4. Handles API responses:
   - `200`: Retrieves and returns the Reflex definition.
   - `202`: Handles asynchronous operation and fetches the definition upon completion.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Supports debugging with detailed information about long-running operations, including `OperationId`, `Location`, and `Retry-After` values.

## Author

**Tiago Balabuch**
