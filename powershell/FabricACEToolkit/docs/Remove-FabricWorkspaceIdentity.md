# Remove-FabricWorkspaceIdentity

## Overview

Deprovisions the Managed Identity for a specified Fabric workspace.

## Features

- Sends a POST request to deprovision the Managed Identity.
- Validates token expiration before making the API request.
- Logs detailed messages for debugging and error handling.

## Parameters

### WorkspaceId *(Mandatory)*

- **Description:** The unique identifier of the workspace from which the identity will be removed.
- **Type:** String

## Usage Examples

### Example 1: Deprovisioning Managed Identity from a Workspace

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Remove-FabricWorkspaceIdentity -WorkspaceId $workspace.id 
```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set the global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token's validity using `Test-TokenExpired`.
2. Constructs the API URL for the POST request using the provided `WorkspaceId`.
3. Sends the POST request to deprovision the Managed Identity.
4. Logs detailed responses and errors for debugging purposes.

## Error Handling

- Logs descriptive error messages if the API request fails or invalid input is detected.
- Returns `null` if an error occurs during execution.

## Author

**Tiago Balabuch**