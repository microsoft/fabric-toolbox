# Set-FabricApiHeaders

## Overview

The `Set-FabricApiHeaders` function configures the Fabric API headers by logging into a specified Azure tenant, retrieving an access token, and updating the global configuration for subsequent API requests. It supports both service principal and user-based authentication methods.

## Features

- Logs into Azure using a tenant ID.
- Retrieves and configures the Fabric API access token.
- Supports service principal and user-based authentication.
- Updates token expiration metadata for better session management.
- Provides detailed logging and error handling.

## Parameters

### TenantId

- **Description:** The Azure tenant ID for which the access token is requested.
- **Type:** String
- **Mandatory:** Yes

### AppId

- **Description:** The Azure app ID for the service principal.
- **Type:** String
- **Mandatory:** No

### AppSecret

- **Description:** The Azure app secret for the service principal.
- **Type:** SecureString
- **Mandatory:** No

## Usage Examples

### Example 1: Use service principal for authentication

```powershell
$tenantId = "999999999-99999-99999-9999-999999999999"
$appId = "888888888-88888-88888-8888-888888888888"
$appSecret = "your-app-secret"
$secureAppSecret = $appSecret | ConvertTo-SecureString -AsPlainText -Force

Set-FabricApiHeaders -TenantId $tenantId -AppId $appId -AppSecret $secureAppSecret
```

### Example 2: Use current user authentication

```powershell
Set-FabricApiHeaders -TenantId "your-tenant-id"
```

## Prerequisites

- The `$FabricConfig` global object must include:
  - `ResourceUrl`: The base API resource URL.
- Azure PowerShell module must be installed.
- Required permissions to authenticate with the specified Azure tenant.

## Key Workflow

1. Validates input parameters.
2. Logs into Azure using either service principal or current user.
3. Retrieves an access token for the Fabric API.
4. Sets the token and headers in the global configuration.
5. Updates token expiration metadata.

## Error Handling

- Logs detailed error messages for authentication and API failures.
- Throws exceptions for invalid input or runtime errors.

## Author

**Tiago Balabuch**
