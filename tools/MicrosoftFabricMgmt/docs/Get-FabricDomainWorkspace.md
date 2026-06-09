# Get-FabricDomainWorkspace

## Overview

The Get-FabricDomainWorkspace function retrieves the workspaces associated with a specific domain in Microsoft Fabric. It leverages the Fabric API to provide detailed information about workspaces for a given domain ID.

## Features

- Validates authentication token before making API requests.
- Constructs and calls the Fabric API endpoint to retrieve workspaces.
- Handles API response validation and logs errors effectively.

## Parameters

### DomainId *(Required)*

- **Description:** The ID of the domain for which to retrieve workspaces.
- **Type:** String

## Usage Examples

### Example 1: Get a list workspaces associated to the domains

```powershell
$domain = Get-FabricDomain -DomainName "API3"
Get-FabricDomainWorkspace -DomainId $domain.id
```

## Prerequisites

- The global `$FabricConfig` variable must be configured with:
  - `BaseUrl`: The Fabric API base URL.
  - `FabricHeaders`: Authentication headers for the API.
- The `Test-TokenExpired` function should be implemented to validate token expiration.

## Key Workflow

1. Validates the provided DomainId parameter.
2. Ensures the authentication token is valid.
3. Constructs the API endpoint URL based on the DomainId.
4. Retrieves workspace data via the Fabric API.
5. Handles and logs API responses, including empty or error cases.

## Error Handling

- Logs detailed error messages if API requests fail or invalid input is detected.
- Returns null for any errors encountered during execution.

## Author

**Tiago Balabuch**  
