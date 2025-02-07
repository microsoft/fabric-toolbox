# Get-FabricDashboard

## Overview
The `Get-FabricDashboard` function retrieves all dashboards from a specified Microsoft Fabric workspace. This function ensures token validity, handles paginated API responses, and returns a consolidated list of dashboards.

## Features
- Validates authentication token using the `Test-TokenExpired` function.
- Supports retrieval of all dashboards for a given workspace.
- Handles paginated responses via continuation tokens.
- Includes robust error handling and logging.

## Parameters

### `WorkspaceId` *(Mandatory)*
- **Description:** The ID of the workspace from which dashboards are retrieved.
- **Type:** String

## Usage Examples

### Example 1: Retrieve Dashboards from a Workspace
```powershell
Get-FabricDashboard -WorkspaceId "workspace-12345"
```
Retrieves all dashboards from the workspace with ID `workspace-12345`.

## Prerequisites
- A global `$FabricConfig` object with the following properties:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- The `Test-TokenExpired` function must be available to check token validity.

## Key Workflow
1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL for retrieving dashboards.
3. Sends API requests, handling paginated responses with continuation tokens.
4. Processes and consolidates the response data into a single list.
5. Returns the list of dashboards.

## Error Handling
- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` in case of any errors during execution.

## Author
**Tiago Balabuch**  

