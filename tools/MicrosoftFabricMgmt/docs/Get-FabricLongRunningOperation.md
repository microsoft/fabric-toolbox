# Get-FabricLongRunningOperation

## Overview

The `Get-FabricLongRunningOperation` function monitors the status of a long-running operation in Microsoft Fabric by periodically polling the operation status until it reaches a terminal state (Succeeded or Failed).

## Features

- Supports monitoring using an operation ID or a location header.
- Allows customizable polling intervals.
- Provides descriptive error handling and logging.

## Parameters

### operationId

- **Description:** The unique identifier of the long-running operation to be monitored.
- **Type:** String
- **Mandatory:** No

### location

- **Description:** The location header URL for the long-running operation.
- **Type:** String
- **Mandatory:** No

### retryAfter

- **Description:** The interval (in seconds) to wait between polling requests. Defaults to 5 seconds.
- **Type:** Integer
- **Mandatory:** No

## Usage Examples

### Example 1: Monitor an operation by ID

```powershell
Get-FabricLongRunningOperation -operationId "12345-abcd-67890-efgh" -retryAfter 10

# Polls the status of the operation every 10 seconds until it completes.
```

### Example 2: Monitor an operation using the location header

```powershell
Get-FabricLongRunningOperation -location "https://api.fabric.microsoft.com/v1/operations/12345-abcd"

# Uses the location header URL to monitor the operation.
```

## Prerequisites

- Use the `$FabricConfig` global object, which must include:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Ensure valid authentication headers are set.

## Key Workflow

1. Constructs the API URL based on `operationId` or `location`.
2. Waits for the specified interval (`retryAfter`) before polling.
3. Sends a GET request to retrieve the operation status.
4. Continues polling until the operation reaches a terminal state.
5. Logs descriptive messages for debugging and error handling.
6. Returns the operation result.

## Error Handling

- Logs detailed error messages if API requests fail.
- Throws exceptions for invalid input or HTTP errors.

## Author

**Tiago Balabuch**
