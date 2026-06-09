# Get-FabricTenantSetting

## Overview

The `Get-FabricTenantSetting` function retrieves tenant settings for a Fabric environment by making a GET request to the appropriate API endpoint. Optionally, it filters the results by the `SettingTitle` parameter.

## Features

- Validates token expiration before making the API request.
- Handles API responses and processes them for tenant settings retrieval.
- Provides error handling and descriptive logging.

## Parameters

### SettingTitle

- **Description:** (Optional) The title of a specific tenant setting to filter the results.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Retrieve all tenant settings

```powershell
Get-FabricTenantSetting
```

### Example 2: Retrieve a specific tenant setting by title

```powershell
Get-FabricTenantSetting -SettingTitle "SomeSetting"
```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set the global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates token validity using `Test-TokenExpired`.
2. Constructs the API URL and retrieves tenant settings.
3. Filters the response data based on the provided `SettingTitle` parameter.
4. Logs descriptive messages for debugging and error handling.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**