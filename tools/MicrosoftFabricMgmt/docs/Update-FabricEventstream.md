# Update-FabricEventstream

## Overview

The `Update-FabricEventstream` function updates an existing Eventstream in a specified Microsoft Fabric workspace by sending a PATCH request to the Microsoft Fabric API. It allows modifications to the Eventstream's name and description.

## Features

- Validates the token using `Test-TokenExpired` before making the API request.
- Allows updates to the Eventstream's name (mandatory) and description (optional).
- Provides detailed logging for debugging and error handling.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the Eventstream exists.
- **Type:** String
- **Mandatory:** Yes

### EventstreamId

- **Description:** The unique identifier of the Eventstream to be updated.
- **Type:** String
- **Mandatory:** Yes

### EventstreamName

- **Description:** The new name for the Eventstream.
- **Type:** String
- **Mandatory:** Yes
- **Validation:** Only allows alphanumeric characters, spaces, and underscores.

### EventstreamDescription

- **Description:** The new description for the Eventstream.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Cancels the publish operation for a specified environment

```powershell
Update-FabricEventstream `
    -WorkspaceId "workspace-12345" `
    -EventstreamId "Eventstream-67890" `
    -EventstreamName "Updated Eventstream" `
    -EventstreamDescription "Updated description"
```

This example updates the Eventstream with ID `Eventstream-67890` in the workspace `workspace-12345` with a new name and description.

## Prerequisites

- The global `$FabricConfig` variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- The `Test-TokenExpired` function must be implemented to validate token expiry.

## Workflow

1. Validates the token using `Test-TokenExpired`.
2. Constructs the API URL based on `WorkspaceId` and `EventstreamId`.
3. Builds the request body in JSON format, including mandatory and optional parameters.
4. Sends a PATCH request to the API endpoint with the constructed JSON body.
5. Handles API responses and logs messages for debugging or error handling.

## Error Handling

- Logs detailed error messages for invalid inputs or failed API requests.
- Returns `null` if the API response code is not `200`.

## Author

**Tiago Balabuch**