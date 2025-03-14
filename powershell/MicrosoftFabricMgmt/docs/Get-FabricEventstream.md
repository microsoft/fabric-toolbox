# Get-FabricEventstream

## Overview
The `Get-FabricEventstream` function retrieves Eventstream details from a specified Microsoft Fabric workspace using either the provided EventstreamId or EventstreamName.

## Features
- Validates token expiration before making the API request.
- Supports retrieval by Eventstream ID or name.
- Handles paginated API responses using continuation tokens.
- Provides error handling and descriptive logging.

## Parameters

### WorkspaceId
- **Description:** The unique identifier of the workspace where the Eventstream exists.
- **Type:** String
- **Mandatory:** Yes

### EventstreamId
- **Description:** The unique identifier of the Eventstream to retrieve.
- **Type:** String
- **Mandatory:** No

### EventstreamName
- **Description:** The name of the Eventstream to retrieve.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Get a list of Eventstreams

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricEventstream -WorkspaceId $workspace.id 
```

### Example 2: Get a Eventstreams by name

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricEventstream -WorkspaceId $workspace.id -EventstreamName "Eventstream-12345" 
```

### Example 2: Get a Eventstreams by id

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricEventstream -WorkspaceId $workspace.id -EventstreamId "66ba709c-6531-4658-b189-68c7639b1ad8" 
```

## Prerequisites
- Use the command `Set-FabricApiHeaders` to set global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow
1. Ensures only one filter (`EventstreamId` or `EventstreamName`) is provided.
2. Validates the authentication token using `Test-TokenExpired`.
3. Constructs the API URL and retrieves Eventstream details using paginated responses if needed.
4. Filters the response data based on the provided parameters.
5. Logs descriptive messages for debugging and error handling.

## Error Handling
- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**  
