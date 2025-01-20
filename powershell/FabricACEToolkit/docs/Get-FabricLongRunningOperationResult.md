# Get-FabricLongRunningOperationResult

## Overview

The `Get-FabricLongRunningOperationResult` function retrieves the result of a completed long-running operation from the Microsoft Fabric API. This function is typically used after confirming that the operation has successfully completed.

## Features

- Fetches the result of a completed long-running operation.
- Validates the response and provides detailed logging.
- Ensures error handling for API requests.

## Parameters

### operationId

- **Description:** The unique identifier of the completed long-running operation whose result you want to retrieve.
- **Type:** String
- **Mandatory:** Yes

## Usage Examples

### Example 1: Retrieve the result of a completed operation

```powershell
Get-FabricLongRunningOperationResult -operationId "12345-abcd-67890-efgh"

# Fetches the result of the specified operation ID.
```

## Prerequisites

- Use the `$FabricConfig` global object, which must include:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Ensure the operation has completed before calling this function.

## Key Workflow

1. Constructs the API URL based on the `operationId`.
2. Sends a GET request to fetch the operation result.
3. Validates the response and logs messages for debugging.
4. Returns the operation result or logs errors if any issues occur.

## Error Handling

- Logs detailed error messages if API requests fail.
- Throws exceptions for invalid input or HTTP errors.

## Author

**Tiago Balabuch**
