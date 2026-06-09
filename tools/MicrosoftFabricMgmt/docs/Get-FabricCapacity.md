# Get-FabricCapacity

## Overview
The `Get-FabricCapacity` function retrieves detailed information about capacities in a Microsoft Fabric workspace. It simplifies interaction with the Fabric API, offering options to query by `capacityId` or `capacityName`.

## Features
- Handles token validation to ensure secure API access.
- Supports filtering by capacity ID or name.
- Automatically retrieves paginated data using continuation tokens.
- Provides error handling for robust operation.

## Parameters

### `capacityId` *(Optional)*
- **Description:** The unique identifier for the capacity.
- **Type:** String

### `capacityName` *(Optional)*
- **Description:** The display name of the capacity.
- **Type:** String

> **Note:** Only one parameter, `capacityId` or `capacityName`, should be specified at a time.

## Usage Examples

### Example 1: Retrieve Capacity by ID
```powershell
Get-FabricCapacity -capacityId "6b3297a9-84d0-4f51-99ac-919da2572ba4"
```
Fetches details of the capacity with the specified ID.

### Example 2: Retrieve Capacity by Name
```powershell
Get-FabricCapacity -capacityName "MyCapacity"
```
Fetches details of the capacity with the specified name.

### Example 3: List All Capacities
```powershell
Get-FabricCapacity
```
Returns a list of all capacities available in the workspace.

## Prerequisites
- Use the command `Set-FabricApiHeaders` to set global configuration variable `$FabricConfig` , containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow
1. Validates that only one input parameter (`capacityId` or `capacityName`) is provided.
2. Ensures the authentication token is valid.
3. Retrieves capacities via the Fabric API, handling paginated responses automatically.
4. Filters results based on provided criteria or returns all capacities if no filters are applied.

## Error Handling
- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author
**Tiago Balabuch**  

