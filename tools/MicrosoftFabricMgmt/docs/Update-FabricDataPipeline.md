# Update-FabricDataPipeline

## Overview

The `Update-FabricDataPipeline` function updates an existing DataPipeline in a specified Microsoft Fabric workspace. It sends a PATCH request to the Microsoft Fabric API with updated details of the DataPipeline.

## Parameters

### `-WorkspaceId` (Mandatory)
- **Type**: `string`
- **Description**: The unique identifier of the workspace containing the DataPipeline to be updated.
- **Example:** `"workspace-12345"`

### `-DataPipelineId` (Mandatory)
- **Type**: `string`
- **Description**: The unique identifier of the DataPipeline to be updated.
- **Example:** `"pipeline-67890"`

### `-DataPipelineName` (Mandatory)
- **Type**: `string`
- **Description**: The new name of the DataPipeline.
- **Validation**: Must only contain alphanumeric characters, underscores, and spaces.
- **Example:** `"My DataPipeline"`

### `-DataPipelineDescription`
- **Type**: `string`
- **Description**: An optional updated description for the DataPipeline.

## Example Usage

### Example 1: Update a DataPipeline with a new name
```powershell
Update-FabricDataPipeline -WorkspaceId "workspace-12345" -DataPipelineId "pipeline-67890" -DataPipelineName "Updated Pipeline Name"
```
This example updates the DataPipeline with ID `pipeline-67890` in workspace `workspace-12345` to have the name `Updated Pipeline Name`.

### Example 2: Update a DataPipeline with a new name and description
```powershell
Update-FabricDataPipeline -WorkspaceId "workspace-12345" -DataPipelineId "pipeline-67890" -DataPipelineName "Updated Pipeline Name" -DataPipelineDescription "This is the updated description."
```
This example updates the DataPipeline with ID `pipeline-67890` in workspace `workspace-12345` with a new name and description.

## Prerequisites
- Use the command `Set-FabricApiHeaders` to set global configuration variable `$FabricConfig` , containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. **Validate Token:** Ensures the Fabric token is valid using the `Test-TokenExpired` function.
2. **Construct API URL:** Builds the API endpoint URL based on the `WorkspaceId` and `DataPipelineId`.
3. **Invoke API Call:** Sends a PATCH request to the Fabric API.
4. **Handle Response:**
   - **200 OK:** Confirms successful update.
   - **Error Codes:** Logs and handles unexpected response codes.
5. **Error Handling:** Captures and logs any exceptions during the operation.

## Author
- **Name**: Tiago Balabuch
