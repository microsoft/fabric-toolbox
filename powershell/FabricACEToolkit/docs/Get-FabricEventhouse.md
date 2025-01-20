# Get-FabricEventhouse

## Overview
The `Get-FabricEventhouse` function retrieves Eventhouse details from a specified Microsoft Fabric workspace using either the provided EventhouseId or EventhouseName.

## Features
- Validates token expiration before making the API request.
- Supports retrieval by Eventhouse ID or name.
- Handles paginated API responses using continuation tokens.
- Provides error handling and descriptive logging.

## Parameters

### WorkspaceId
- **Description:** The unique identifier of the workspace where the Eventhouse exists.
- **Type:** String
- **Mandatory:** Yes

### EventhouseId
- **Description:** The unique identifier of the Eventhouse to retrieve.
- **Type:** String
- **Mandatory:** No

### EventhouseName
- **Description:** The name of the Eventhouse to retrieve.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Get a list of Eventhouses

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricEventhouse -WorkspaceId $workspace.id 
```

### Example 2: Get a Eventhouses by name

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricEventhouse -WorkspaceId $workspace.id -EventhouseName "eventhouse-12345" 
```

### Example 2: Get a Eventhouses by id

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricEventhouse -WorkspaceId $workspace.id -EventhouseId "66ba709c-6531-4658-b189-68c7639b1ad8" 
```

## Prerequisites
- Use the command `Set-FabricApiHeaders` to set global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow
1. Ensures only one filter (`EventhouseId` or `EventhouseName`) is provided.
2. Validates the authentication token using `Test-TokenExpired`.
3. Constructs the API URL and retrieves Eventhouse details using paginated responses if needed.
4. Filters the response data based on the provided parameters.
5. Logs descriptive messages for debugging and error handling.

## Error Handling
- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**  
