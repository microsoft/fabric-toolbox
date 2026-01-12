# Get-FabricEventstreamDefinition

## Overview

The `Get-FabricEventstreamDefinition` function retrieves the definition of an Eventstream from a specified Microsoft Fabric workspace using the provided Eventstream ID. It supports token validation, API URL construction, and response handling.

## Features

- Validates token expiration before making the API request.
- Constructs and sends an API request to retrieve the Eventstream definition.
- Handles long-running operations for retrieving the definition.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the Eventstream exists.
- **Type:** String
- **Mandatory:** Yes

### EventstreamId

- **Description:** The unique identifier of the Eventstream to retrieve the definition for.
- **Type:** String
- **Mandatory:** Optional

### EventstreamFormat

- **Description:** The format in which to retrieve the Eventstream definition.
- **Type:** String
- **Mandatory:** Optional

## Usage Examples

### Example 1: Retrieve an Eventstream Definition

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$Eventstream = Get-FabricEventstream -WorkspaceId $workspace.id -EventstreamName "Eventstream-67890"
Get-FabricEventstreamDefinition -WorkspaceId $workspace.id -EventstreamId $Eventstream.id 
```

This example retrieves the definition of the Eventstream with ID `Eventstream-67890` in the workspace with ID `workspace-12345`.

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, `EventstreamId`, and `EventstreamFormat` (if provided).
3. Sends a POST request to retrieve the Eventstream definition.
4. Handles both immediate responses and long-running operations.
5. Validates the API response and processes the definition.

## Error Handling

- Logs descriptive error messages for failed API requests or invalid inputs.
- Returns `null` for any errors encountered during execution.
- Handles long-running operations and retries if necessary.

## Author

**Tiago Balabuch**  
