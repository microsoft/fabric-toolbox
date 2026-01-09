# Unassign-FabricDomainWorkspace

## Overview

The `Unassign-FabricDomainWorkspace` function allows you to unassign specific workspaces from a given Fabric domain or unassign all workspaces if no workspace IDs are specified. It makes a POST request to the relevant API endpoint for this operation.

## Features

- Unassigns specified workspaces or all workspaces from a Fabric domain.
- Handles token validation to ensure secure API access.
- Provides detailed logging of API request and response handling.

## Parameters

### DomainId *(Required)*

- **Description:** The unique identifier of the Fabric domain.
- **Type:** String

### WorkspaceIds *(Optional)*

- **Description:** An array of workspace IDs to unassign. If not provided, all workspaces will be unassigned.
- **Type:** Array

## Usage Examples

### Example 1: Unassign workspaces from a specified domain.

```powershell
Unassign-FabricDomainWorkspace -DomainId "12345" -WorkspaceIds @("workspace1", "workspace2")
```

## Prerequisites

- The global `$FabricConfig` variable must be configured with:
  - `BaseUrl`: The Fabric API base URL.
  - `FabricHeaders`: Authentication headers for the API.
- The `Test-TokenExpired` function should be implemented to validate token expiration.

## Key Workflow

1. Validates the provided `DomainId` parameter and optional `WorkspaceIds`.
2. Ensures the authentication token is valid.
3. Constructs the API endpoint URL based on whether workspace IDs are provided.
4. Constructs the request body if workspace IDs are specified.
5. Sends a POST request to the Fabric API to unassign the specified workspaces or all workspaces.
6. Handles and logs API responses, including error handling for unexpected responses.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Handles unexpected response codes and returns detailed operation results or null in case of errors.

## Author

**Tiago Balabuch**
