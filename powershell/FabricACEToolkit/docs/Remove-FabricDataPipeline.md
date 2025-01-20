# Remove-FabricDataPipeline

## Overview

The `Remove-FabricDataPipeline` function deletes a specified DataPipeline from a Microsoft Fabric workspace. It sends a DELETE request to the Fabric API to perform the operation.

## Parameters

### `WorkspaceId` (Mandatory)
- **Type:** `string`
- **Description:** The unique identifier of the workspace where the DataPipeline resides.
- **Example:** `"workspace-12345"`

### `DataPipelineId` (Mandatory)
- **Type:** `string`
- **Description:** The unique identifier of the DataPipeline to be removed.
- **Example:** `"pipeline-67890"`

## Example Usage

### Example 1: Remove a DataPipeline
```powershell
Remove-FabricDataPipeline -WorkspaceId "workspace-12345" -DataPipelineId "pipeline-67890"
```
This example deletes the DataPipeline with ID `pipeline-67890` from the workspace with ID `workspace-12345`.

## Prerequisites
- Use the command `Set-FabricApiHeaders` to set global configuration variable `$FabricConfig` , containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. **Validate Token:** Ensures the Fabric token is valid using the `Test-TokenExpired` function.
2. **Construct API URL:** Builds the API endpoint URL based on the `WorkspaceId` and `DataPipelineId`.
3. **Invoke API Call:** Sends a DELETE request to the Fabric API.
4. **Handle Response:**
   - **200 OK:** Confirms successful deletion.
   - **Error Codes:** Logs and handles unexpected response codes.
5. **Error Handling:** Captures and logs any exceptions during the operation.

## Prerequisites
- Use the command `Set-FabricApiHeaders` to set global configuration variable `$FabricConfig` , containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Notes
- Deleting a DataPipeline is irreversible. Use with caution.

## Author

**Author:** Tiago Balabuch