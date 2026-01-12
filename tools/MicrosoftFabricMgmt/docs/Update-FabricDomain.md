# Update-FabricDomain

## Overview

The `Update-FabricDomain` function modifies a specified domain in Microsoft Fabric using the provided parameters.

## Features

- Updates the domain name, description, and contributors' scope.
- Ensures the token is valid before making API requests.
- Provides detailed logging of the API request and response handling.
- Supports optional parameters for domain description and contributors' scope.

## Parameters

### DomainId *(Required)*

- **Description:** The unique identifier of the domain to be updated.
- **Type:** String

### DomainName *(Required)*

- **Description:** The new name for the domain. Must be alphanumeric.
- **Type:** String

### DomainDescription *(Optional)*

- **Description:** A new description for the domain.
- **Type:** String

### DomainContributorsScope *(Optional)*

- **Description:** The contributors' scope for the domain. Accepted values:
  - `AdminsOnly`
  - `AllTenant`
  - `SpecificUsersAndGroups`
- **Type:** String

## Usage Examples

### Example 1: Update a domain

```powershell
$domain = Get-FabricDomain -DomainName "API4"
Update-FabricDomain -DomainId $domain.id -DomainName "API Updated" -DomainDescription "API data domain updated"
```

## Prerequisites

- The global `$FabricConfig` variable must be configured with:
  - `BaseUrl`: The Fabric API base URL.
  - `FabricHeaders`: Authentication headers for the API.
- The `Test-TokenExpired` function should be implemented to validate token expiration.

## Key Workflow

1. Ensures the provided `DomainId`, `DomainName`, and other optional parameters are valid.
2. Validates token validity before proceeding with the API request.
3. Constructs the API endpoint URL for domain update.
4. Builds the request body based on the provided parameters.
5. Sends a PATCH request to the Fabric API to perform the domain update.
6. Handles and logs API responses, including error handling for unexpected responses.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Handles unexpected response codes and returns `null` in case of errors.

## Author

**Tiago Balabuch**  

