# Get-FabricDomain

## Overview

The `Get-FabricDomain` function retrieves domain information from Microsoft Fabric. It provides flexible filtering options by domain ID, domain name, or non-empty domains.

## Features

- Supports filtering by `DomainId`, `DomainName`, or only returning domains containing workspaces (`NonEmptyDomainsOnly`).
- Ensures token validity before making API requests.
- Provides detailed logging of API requests, responses, and errors.

## Parameters

### `DomainId` *(Optional)*

- **Description:** The unique identifier of the domain to retrieve.
- **Type:** String

### `DomainName` *(Optional)*

- **Description:** The display name of the domain to retrieve.
- **Type:** String

### `NonEmptyDomainsOnly` *(Optional)*

- **Description:** Filters the results to return only domains containing workspaces if set to `$true`.
- **Type:** Boolean
- **Default Value:** `$false`

## Usage Examples

### Example 1: Get a list of domains

```powershell
Get-FabricDomain 
```

### Example 2: Get a domain by Id

```powershell
Get-FabricDomain -DomainId "2ef62c57-2e64-41fc-81c5-a80ad370172d"
```

### Example 3: Get a domain by Name

```powershell
Get-FabricDomain -DomainName "API1"
```

## Prerequisites

- The global `$FabricConfig` variable must be configured with:
  - `BaseUrl`: The Fabric API base URL.
  - `FabricHeaders`: Authentication headers for the API.
- The `Test-TokenExpired` function should be implemented to validate token expiration.

## Key Workflow

1. **Input Validation:** Ensures only one of `DomainId` or `DomainName` is provided.
2. **Token Validation:** Calls `Test-TokenExpired` to ensure the token is valid.
3. **API URL Construction:** Dynamically builds the endpoint URL, including the `nonEmptyOnly` filter if required.
4. **API Request Execution:** Sends a GET request to the API endpoint.
5. **Response Handling:**
   - Validates the response status code.
   - Filters the results based on `DomainId` or `DomainName` if provided.
6. **Error Handling:** Catches and logs exceptions with detailed error messages.

## Author

**Tiago Balabuch**  
