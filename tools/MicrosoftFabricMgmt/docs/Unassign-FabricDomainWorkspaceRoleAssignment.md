# Unassign-FabricDomainWorkspaceRoleAssignment

## Overview

The `Unassign-FabricDomainWorkspaceRoleAssignment` function performs bulk unassignment of roles for principals in a specific Fabric domain. It sends a POST request to the relevant API endpoint.

## Features

- Unassigns specified roles from principals in a Fabric domain.
- Validates the structure of principal IDs.
- Handles token validation to ensure secure API access.
- Provides detailed logging of API request and response handling.

## Parameters

### DomainId *(Required)*

- **Description:** The unique identifier of the Fabric domain where roles will be unassigned.
- **Type:** String

### DomainRole *(Required)*

- **Description:** The role to unassign from principals. Must be one of the following:
  - `Admins`
  - `Contributors`
- **Type:** String

### PrincipalIds *(Required)*

- **Description:** An array of principals to unassign roles from. Each principal must include:
  - `id`: The identifier of the principal.
  - `type`: The type of the principal (e.g., `User`, `Group`).
- **Type:** Array

## Usage Examples

### Example 1: Unassign of roles for principals in a specific Fabric domain.

```powershell
$domain = Get-FabricDomain -DomainName "API1"
$PrincipalIds = @( @{id = "999abb4a-5555-4ac0-9c2c-bd17036fd58c"; type = "User" },
    @{id = "9999495c-6666-447a-b4d3-2d8e963e6288"; type = "User" })
Unassign-FabricDomainWorkspaceRoleAssignment -DomainId $domain.id -DomainRole Admins -PrincipalIds $PrincipalIds
```

## Prerequisites

- The global `$FabricConfig` variable must be configured with:
  - `BaseUrl`: The Fabric API base URL.
  - `FabricHeaders`: Authentication headers for the API.
- The `Test-TokenExpired` function should be implemented to validate token expiration.

## Key Workflow

1. Validates the provided `DomainId`, `DomainRole`, and `PrincipalIds` parameters.
2. Ensures each principal in `PrincipalIds` contains valid `id` and `type` properties.
3. Ensures the authentication token is valid.
4. Constructs the API endpoint URL for bulk role unassignment.
5. Constructs the request body with the domain role and principals to unassign.
6. Sends a POST request to the Fabric API to perform the bulk unassignment.
7. Handles and logs API responses, including error handling for unexpected responses.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Handles unexpected response codes and returns detailed operation results or null in case of errors.

## Author

**Tiago Balabuch**
