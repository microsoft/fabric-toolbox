# Get-FabricTenantSettingOverridesCapacity

## Overview

The `Get-FabricTenantSettingOverridesCapacity` function retrieves capacity tenant settings overrides for a Fabric tenant by making a GET request to the appropriate API endpoint. It supports handling paginated API responses using continuation tokens.

## Features

- Validates token expiration before making the API request.
- Handles paginated API responses using continuation tokens.
- Provides error handling and descriptive logging.

## Parameters

This function does not require any parameters.

## Usage Examples

### Example 1: Retrieve all capacity tenant settings overrides

```powershell
Get-FabricTenantSettingOverridesCapacity
```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set the global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates token validity using `Test-TokenExpired`.
2. Initializes variables and constructs the base API endpoint URL.
3. Iteratively retrieves capacity tenant settings overrides using continuation tokens.
4. Logs descriptive messages for debugging and error handling.
5. Aggregates and returns the data.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**