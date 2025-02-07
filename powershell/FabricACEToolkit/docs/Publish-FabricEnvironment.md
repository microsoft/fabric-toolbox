# Publish-FabricEnvironment

## Overview

The `Publish-FabricEnvironment` function interacts with the Microsoft Fabric API to publish a staging environment in a specified workspace. It ensures the authentication token is valid, constructs the API request, and handles both immediate and long-running operations gracefully.

## Features

- Publishes a staging environment in a Microsoft Fabric workspace.
- Validates the authentication token before initiating API calls.
- Handles both synchronous and asynchronous (long-running) operations.
- Logs detailed messages for debugging and error handling.

## Parameters

### WorkspaceId *(Required)*

- **Description:** The unique identifier of the workspace containing the staging environment.
- **Type:** String

### EnvironmentId *(Required)*

- **Description:** The unique identifier of the staging environment to be published.
- **Type:** String

## Usage Examples

### Example 1: Publish a staging environment

```powershell
## Publish staging environment
Publish-FabricEnvironment -WorkspaceId "workspace-12345" -EnvironmentId "environment-67890"
```

## Prerequisites

- The global `$FabricConfig` object must be configured with:
  - `BaseUrl`: The Fabric API base URL.
  - `FabricHeaders`: Authentication headers for the API.
- The `Test-TokenExpired` function should be implemented to validate token expiration.

## Key Workflow

1. **Validate Token:** Ensures the authentication token is valid using `Test-TokenExpired`.
2. **Construct API URL:** Builds the endpoint URL using `BaseUrl`, `WorkspaceId`, and `EnvironmentId`.
3. **Submit API Request:** Sends a POST request to publish the staging environment.
4. **Handle Response:**
   - For status code `200`: Logs and returns the publish details.
   - For status code `202`: Initiates polling to track the progress of the long-running operation.
5. **Handle Long-Running Operations:** Tracks the operation status and fetches the result upon completion.
6. **Error Handling:** Logs errors and returns `null` if an unexpected response occurs.

## Error Handling

- Captures and logs any errors encountered during the API request.
- Handles API response codes and logs unexpected responses with detailed error messages.

## Author

**Tiago Balabuch**