# Assign-FabricDomainWorkspaceRoleAssignment

## Overview

The `Assign-FabricDomainWorkspaceRoleAssignment` function allows bulk assignment of roles to principals within a specified domain in Microsoft Fabric. The function validates input, ensures token validity, and interacts with the Fabric API to execute the assignments.

## Features

- Supports role assignment for two types of roles: `Admins` and `Contributors`.
- Ensures all principals have valid `id` and `type` properties.
- Validates token expiration before making API requests.
- Logs detailed information about the API request, response, and errors.

## Parameters

### `DomainId` *(Required)*

- **Description:** The unique identifier of the Fabric domain where roles will be assigned.
- **Type:** String

### `DomainRole` *(Required)*

- **Description:** The role to assign to the principals. Accepted values:
  - `Admins`
  - `Contributors`
- **Type:** String

### `PrincipalIds` *(Required)*

- **Description:** An array of objects representing principals. Each principal must include:
  - `id`: The unique identifier of the principal.
  - `type`: The type of the principal (e.g., `User`, `Group`).
- **Type:** Array of objects

## Usage Examples

### Example 1: Assigns the `Admins` role to the specified principals in the domain with ID "12345".

```powershell
Assign-FabricDomainWorkspaceRoleAssignment `
    -DomainId "domain12345" `
    -DomainRole "Admins" `
    -PrincipalIds @(@{id = "user1"; type = "User"}, @{id = "group1"; type = "Group"})
```

## Prerequisites

- The global `$FabricConfig` variable must be configured with:
  - `BaseUrl`: The Fabric API base URL.
  - `FabricHeaders`: Authentication headers for the API.
- The `Test-TokenExpired` function should be implemented to validate token expiration.
- The `Write-Message` helper function must be available for consistent logging.

## Key Workflow

1. **Input Validation:** Ensures each principal object contains `id` and `type` properties.
2. **Token Validation:** Calls `Test-TokenExpired` to confirm the token is valid.
3. **API URL Construction:** Dynamically creates the API endpoint using the domain ID.
4. **Request Body Preparation:** Formats the `DomainRole` and `PrincipalIds` into JSON.
5. **API Request Execution:** Sends a POST request to the API endpoint for role assignment.
6. **Response Handling:**
   - Logs and verifies the response status code.
   - Handles unexpected response codes and logs error details.
7. **Error Handling:** Catches and logs exceptions with detailed error messages.

This example assigns the Admins role to two principals: a user with ID user1 and a group with ID group1, in the domain with ID 12345.

## Error Handling

- Logs unexpected API responses with error messages and codes.
- Catches and displays detailed error messages for debugging.

## Author

**Tiago Balabuch**
