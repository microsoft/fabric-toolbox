# Assign-FabricDomainWorkspaceByPrincipal

## Overview

The `Assign-FabricDomainWorkspaceByPrincipal` function assigns workspaces to a domain in Microsoft Fabric using an array of principal IDs and their associated types. It validates the provided input, ensures token validity, and interacts with the Fabric API to perform the assignment.

## Features

- Accepts a structured array of principal IDs and types for assigning domain workspaces.
- Handles long-running operations with detailed logging.
- Validates the structure of principal objects to ensure correctness.
- Provides robust error handling and detailed logging at every step.

## Parameters

### `DomainId` *(Required)*

- **Description:** The unique identifier of the domain where workspaces will be assigned.
- **Type:** String

### `PrincipalIds` *(Required)*

- **Description:** An array of objects representing principals, each containing:
  - `id`: The unique identifier of the principal.
  - `type`: The type of principal (e.g., "User").
- **Type:** Array of Objects

## Usage Examples

### Example 1: Assign Workspaces by Capacity to a Domain

```powershell
$PrincipalIds = @( @{id = "813abb4a-414c-4ac0-9c2c-bd17036fd58c"; type = "User" },
    @{id = "b5b9495c-685a-447a-b4d3-2d8e963e6288"; type = "User" })

$domain = Get-FabricDomain -DomainName "domain123"
Assign-FabricDomainWorkspaceByPrincipal -DomainId $domain.id -PrincipalIds $PrincipalIds
```

Assigns workspaces to the domain with ID domain123 based on the specified capacity IDs.

## Prerequisites

- A global `$FabricConfig` object with the following properties:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- The `Test-TokenExpired` function must be available to check token validity.

## Key Workflow

1. **Input Validation:** Ensures each principal object contains the `id` and `type` keys.
2. **Token Validation:** Confirms token validity via `Test-TokenExpired`.
3. **API Endpoint Construction:** Dynamically generates the endpoint URL using the domain ID.
4. **Request Body Preparation:** Formats the `PrincipalIds` into the appropriate JSON structure.
5. **API Request Execution:** Sends a POST request to assign workspaces by principals, with detailed logging of responses.
6. **Response Handling:**
   - Logs successful operations or tracks long-running operations via `Get-FabricLongRunningOperation`.
   - Handles unexpected response codes gracefully, logging relevant details.
7. **Error Handling:** Captures and logs error details for troubleshooting.

## Error Handling

- Validates the structure of `PrincipalIds` and throws detailed errors for invalid inputs.
- Logs unexpected status codes or API failures with error details.
- Returns structured error information for failed API requests or operations.

## Author

**Tiago Balabuch**

