# Get-FabricDatamart

## Overview
The `Get-FabricDatamart` function retrieves all datamarts  from a specified Microsoft Fabric workspace. This function ensures token validity, handles paginated API responses, and returns a consolidated list of datamarts .

## Features
- Validates authentication token using the `Test-TokenExpired` function.
- Supports retrieval of all datamarts  for a given workspace.
- Handles paginated responses via continuation tokens.
- Includes robust error handling and logging.

## Parameters

### `WorkspaceId` *(Mandatory)*
- **Description:** The ID of the workspace from which datamarts  are retrieved.
- **Type:** String

## Usage Examples

### Example 1: Retrieve datamarts  from a Workspace
```powershell
Get-FabricDatamart -WorkspaceId "workspace-12345"
```
Retrieves all datamarts  from the workspace with ID `workspace-12345`.

## Prerequisites
- A global `$FabricConfig` object with the following properties:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- The `Test-TokenExpired` function must be available to check token validity.

## Key Workflow
1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL for retrieving datamarts .
3. Sends API requests, handling paginated responses with continuation tokens.
4. Processes and consolidates the response data into a single list.
5. Returns the list of datamarts.

## Error Handling
- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` in case of any errors during execution.

## Notes
- The function uses `System.Web.HttpUtility` to URL-encode continuation tokens.
- Continuation tokens are updated dynamically to fetch all paginated data.

## Author
**Tiago Balabuch**  

