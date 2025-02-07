# New-FabricDomain

## Overview

The `New-FabricDomain` function creates a new domain in Microsoft Fabric by interacting with the Fabric API. This function supports adding domains with optional descriptions and parent domain associations, ensuring seamless integration with existing structures.

## Features

- Handles token validation to ensure secure API access.
- Supports optional parameters for domain description and parent domain association.
- Provides detailed logging of API request and response handling.

## Parameters

### DomainName *(Required)*

- **Description:** The name of the domain to be created. Must only contain alphanumeric characters, underscores, and spaces.
- **Type:** String

### DomainDescription *(Optional)*

- **Description:** A description of the domain to be created.
- **Type:** String

### ParentDomainId *(Optional)*

- **Description:** The ID of the parent domain, if applicable.
- **Type:** String

## Usage Examples

### Example 1: Add a new domain

```powershell
New-FabricDomain -DomainName "API1" 
```

### Example 2: Add a new domain with description

```powershell
New-FabricDomain -DomainName "API2" -DomainDescription "API data domain"
```

### Example 3: Add a new domain with description and parent domain

```powershell
New-FabricDomain -DomainName "API3" -DomainDescription "API data domain" -ParentDomainId "2ef62c57-2e64-41fc-81c5-a80ad370172d"
```

### Example 4: Add a new domain parent domain

```powershell
New-FabricDomain -DomainName "API4" -ParentDomainId "2ef62c57-2e64-41fc-81c5-a80ad370172d"
```

## Prerequisites

- The global `$FabricConfig` variable must be configured with:
  - `BaseUrl`: The Fabric API base URL.
  - `FabricHeaders`: Authentication headers for the API.
- The `Test-TokenExpired` function should be implemented to validate token expiration.

## Key Workflow

1. Validates the provided `DomainName` parameter and optional parameters.
2. Ensures the authentication token is valid.
3. Constructs the API endpoint URL and request body based on input parameters.
4. Sends a POST request to the Fabric API to create the domain.
5. Handles and logs API responses, including long-running operations if applicable.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Handles unexpected response codes and returns detailed operation results or null in case of errors.

## Author

**Tiago Balabuch**
