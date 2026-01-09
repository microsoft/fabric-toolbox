# Update-FabricEventhouse

## Overview

The `Update-FabricEventhouse` function updates an existing Eventhouse in a specified Microsoft Fabric workspace by sending a PATCH request to the Microsoft Fabric API. It allows modifications to the Eventhouse's name and description.

## Features

- Validates the token using `Test-TokenExpired` before making the API request.
- Allows updates to the Eventhouse's name (mandatory) and description (optional).
- Provides detailed logging for debugging and error handling.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the Eventhouse exists.
- **Type:** String
- **Mandatory:** Yes

### EventhouseId

- **Description:** The unique identifier of the Eventhouse to be updated.
- **Type:** String
- **Mandatory:** Yes

### EventhouseName

- **Description:** The new name for the Eventhouse.
- **Type:** String
- **Mandatory:** Yes
- **Validation:** Only allows alphanumeric characters, spaces, and underscores.

### EventhouseDescription

- **Description:** The new description for the Eventhouse.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Cancels the publish operation for a specified environment

```powershell
Update-FabricEventhouse `
    -WorkspaceId "workspace-12345" `
    -EventhouseId "eventhouse-67890" `
    -EventhouseName "Updated Eventhouse" `
    -EventhouseDescription "Updated description"
```

This example updates the Eventhouse with ID `eventhouse-67890` in the workspace `workspace-12345` with a new name and description.

## Prerequisites

- The global `$FabricConfig` variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- The `Test-TokenExpired` function must be implemented to validate token expiry.

## Workflow

1. Validates the token using `Test-TokenExpired`.
2. Constructs the API URL based on `WorkspaceId` and `EventhouseId`.
3. Builds the request body in JSON format, including mandatory and optional parameters.
4. Sends a PATCH request to the API endpoint with the constructed JSON body.
5. Handles API responses and logs messages for debugging or error handling.

## Error Handling

- Logs detailed error messages for invalid inputs or failed API requests.
- Returns `null` if the API response code is not `200`.

## Author

**Tiago Balabuch**  

