# Assign-FabricDomainWorkspaceById

## Overview
The `Assign-FabricDomainWorkspaceById` function assigns multiple workspaces to a specified domain in Microsoft Fabric. It securely interacts with the Fabric API, ensuring token validation and robust error handling.

## Features
- Validates the authentication token before initiating API requests.
- Allows batch assignment of workspaces using an array of workspace IDs.
- Handles API responses efficiently, including logging and error reporting.

## Parameters

### `DomainId` *(Required)*
- **Description:** The unique identifier of the domain where workspaces will be assigned.
- **Type:** String

### `WorkspaceIds` *(Required)*
- **Description:** An array of workspace IDs to be assigned to the specified domain.
- **Type:** Array of Strings

## Example Usage

### Example 1: Assign Workspaces by Ids to a Domain

```powershell
Assign-FabricDomainWorkspaceById -DomainId "domain12345" -WorkspaceIds @("workspace-12345", "workspace-67890", "workspace-02468")
```

Assigns the workspaces with IDs "ws1", "ws2", and "ws3" to the domain with ID "12345".

## Prerequisites
- The global configuration variable `$FabricConfig` must be set, containing:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.


## Key Workflow
1. **Token Validation:** Ensures that the authentication token is valid by invoking the `Test-TokenExpired` function.
2. **API Endpoint Construction:** Dynamically builds the API URL using the provided domain ID.
3. **Request Body Preparation:** Constructs the request payload with workspace IDs and converts it to JSON format.
4. **API Request Execution:** Sends a POST request to assign workspaces, logging any issues or unexpected responses.
5. **Response Validation:** Confirms that the API request was successful based on the status code.
6. **Error Handling:** Captures and logs errors, providing detailed diagnostic information.

## Error Handling
- Logs descriptive error messages if token validation or API requests fail.
- Handles unexpected response codes gracefully by logging error details.
- Returns `null` in case of errors.

## Author
**Tiago Balabuch**

