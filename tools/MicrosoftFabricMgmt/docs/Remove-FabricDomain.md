# Remove-FabricDomain

## Overview

The `Remove-FabricDomain` function removes a specified domain from Microsoft Fabric by making a DELETE request to the relevant API endpoint.

## Features

- Deletes a domain using its unique identifier.
- Handles token validation to ensure secure API access.
- Provides detailed logging of API request and response handling.

## Parameters

### DomainId *(Required)*

- **Description:** The unique identifier of the domain to be deleted.
- **Type:** String

## Usage Examples
### Example 1: Remove a domain

```powershell
$domain = Get-FabricDomain -DomainName "API Updated"
Remove-FabricDomain -DomainId $domain.id
```

## Prerequisites

- The global `$FabricConfig` variable must be configured with:
  - `BaseUrl`: The Fabric API base URL.
  - `FabricHeaders`: Authentication headers for the API.
- The `Test-TokenExpired` function should be implemented to validate token expiration.

## Key Workflow

1. Validates the provided `DomainId` parameter.
2. Ensures the authentication token is valid.
3. Constructs the API endpoint URL for deleting the domain.
4. Sends a DELETE request to the Fabric API to remove the domain.
5. Handles and logs API responses, including error handling for unexpected responses.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Handles unexpected response codes and returns detailed operation results or null in case of errors.

## Author

**Tiago Balabuch**
