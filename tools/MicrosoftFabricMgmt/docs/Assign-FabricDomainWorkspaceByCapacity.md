# Assign-FabricDomainWorkspaceByCapacity

## Overview
The `Assign-FabricDomainWorkspaceByCapacity` function assigns workspaces to a domain based on specified capacity IDs within Microsoft Fabric. It validates token expiration, constructs the API request, handles long-running operations, and logs detailed steps.

## Features

- Validates authentication token using the `Test-TokenExpired` function.
- Supports assigning workspaces by capacities to a domain.
- Handles long-running operations and returns the final status.
- Provides robust logging for debugging and error handling.

## Parameters

### `DomainId` *(Mandatory)*
- **Description:** The ID of the domain where workspaces will be assigned.
- **Type:** String

### `CapacitiesIds` *(Mandatory)*
- **Description:** An array of capacity IDs to assign workspaces.
- **Type:** Array

## Usage Examples

### Example 1: Assign Workspaces by Capacity to a Domain

```powershell
Assign-FabricDomainWorkspaceByCapacity -DomainId "domain123" -CapacitiesIds @("capacity1", "capacity2")
```

Assigns workspaces to the domain with ID domain123 based on the specified capacity IDs.

## Prerequisites
- A global `$FabricConfig` object with the following properties:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- The `Test-TokenExpired` function must be available to check token validity.
  
## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL to assign workspaces by capacities
3. Sends a POST request to the API with the required request body.
4. Handles different status codes, including long-running operations.
5. Returns either the result of the operation or logs the error if the operation fails.

## Error Handling

- Logs error messages if the API request fails or if the operation encounters issues.
- In case of long-running operations, it checks the status and handles the operation result.

## Notes

- The function includes detailed logging for each major step in the process.
- Long-running operations are handled with the `Get-FabricLongRunningOperation` and `Get-FabricLongRunningOperationResult` functions.

## Author
**Tiago Balabuch**  