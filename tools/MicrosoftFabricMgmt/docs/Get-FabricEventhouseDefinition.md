# Get-FabricEventhouseDefinition

## Overview

The `Get-FabricEventhouseDefinition` function retrieves the definition of an Eventhouse from a specified Microsoft Fabric workspace using the provided Eventhouse ID. It supports token validation, API URL construction, and response handling.

## Features

- Validates token expiration before making the API request.
- Constructs and sends an API request to retrieve the Eventhouse definition.
- Handles long-running operations for retrieving the definition.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the Eventhouse exists.
- **Type:** String
- **Mandatory:** Yes

### EventhouseId

- **Description:** The unique identifier of the Eventhouse to retrieve the definition for.
- **Type:** String
- **Mandatory:** Optional

### EventhouseFormat

- **Description:** The format in which to retrieve the Eventhouse definition.
- **Type:** String
- **Mandatory:** Optional

## Usage Examples

### Example 1: Retrieve an Eventhouse Definition

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$eventhouse = Get-FabricEventhouse -WorkspaceId $workspace.id -EventhouseName "eventhouse-67890"
Get-FabricEventhouseDefinition -WorkspaceId $workspace.id -EventhouseId $eventhouse.id 
```

This example retrieves the definition of the Eventhouse with ID `eventhouse-67890` in the workspace with ID `workspace-12345`.

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, `EventhouseId`, and `EventhouseFormat` (if provided).
3. Sends a POST request to retrieve the Eventhouse definition.
4. Handles both immediate responses and long-running operations.
5. Validates the API response and processes the definition.

## Error Handling

- Logs descriptive error messages for failed API requests or invalid inputs.
- Returns `null` for any errors encountered during execution.
- Handles long-running operations and retries if necessary.

## Author

**Tiago Balabuch**  
