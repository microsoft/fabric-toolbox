# Set-FabricApiHeaders

## Overview

The `Set-FabricApiHeaders` function facilitates interaction with the Microsoft Fabric API by setting API headers with a valid token for a specified Azure tenant. It manages authentication and ensures proper configuration for subsequent API requests.

## Features

- Logs in to the specified Azure tenant and retrieves an access token.
- Configures headers for Fabric API requests.
- Updates global token metadata, including expiration time and tenant ID.
- Handles errors gracefully and provides descriptive logging.

## Parameters

### `TenantId` *(Required)*

- **Description:** The Azure tenant ID for which the access token is requested.
- **Type:** String

## Usage Examples

### Example: Configure Headers for a Specific Tenant

```powershell
Set-FabricApiHeaders -TenantId "xxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Logs in to Azure with the specified tenant ID, retrieves an access token, and configures the Fabric API headers.

## Prerequisites

- Azure PowerShell module Az.account must be installed and available.
- Ensure the following commands are functional:
  - `Connect-AzAccount`
  - `Get-AzAccessToken`

## Key Workflow

1. Connects to the specified Azure tenant using `Connect-AzAccount`.
2. Retrieves an access token for the Fabric API using `Get-AzAccessToken`.
3. Extracts the token and sets it as an authorization header in `$FabricConfig`.
4. Updates token expiration time and global tenant ID in `$FabricConfig`.

## Error Handling

- Logs detailed error messages if the function fails at any step.
- Throws an error if configuration cannot be completed due to invalid tenant or API settings.

## Notes

- Use `Is-TokenExpired` to validate token expiration before making API calls.
- Ensure proper permissions and configurations for Azure authentication.

## Author

**Tiago Balabuch**  

