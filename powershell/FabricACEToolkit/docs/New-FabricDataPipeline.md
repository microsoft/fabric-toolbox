# New-FabricDataPipeline

## Overview
The `New-FabricDataPipeline` function creates a new DataPipeline in a specified Microsoft Fabric workspace.

## Features
- Handles token validation to ensure secure API access.
- Supports Long Running Operations.
- Provides error handling for robust operation.

## Parameters

### `WorkspaceId` (Mandatory)
- **Type:** `string`
- **Description:** The unique identifier of the workspace where the DataPipeline will be created.
- **Example:** `"workspace-12345"`

### `DataPipelineName` (Mandatory)
- **Type:** `string`
- **Description:** The name of the DataPipeline to be created.
- **Validation:** Alphanumeric, spaces, and underscores.
- **Example:** `"New DataPipeline"`

### `DataPipelineDescription` (Optional)
- **Type:** `string`
- **Description:** A description of the DataPipeline to be created.
- **Example:** `"Pipeline for data ingestion and transformation"`

## Example Usage

### Example 1: Create a DataPipeline with a description
```powershell
New-FabricDataPipeline -WorkspaceId "workspace-12345" -DataPipelineName "New DataPipeline" -DataPipelineDescription "Pipeline for ingestion"
```

### Example 2: Create a DataPipeline without a description
```powershell
New-FabricDataPipeline -WorkspaceId "workspace-12345" -DataPipelineName "New DataPipeline"
```
This example creates a DataPipeline named "AnalyticsPipeline" in the workspace with ID "workspace-67890" and assigns it a description.

## Prerequisites
- Use the command `Set-FabricApiHeaders` to set global configuration variable `$FabricConfig` , containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.
- Long-Running Operations: Utilizes `Get-FabricLongRunningOperation` and `Get-FabricLongRunningOperationResult` for tracking status

## Key Workflow

1. Validate Token: Ensures the Fabric token is valid using the Test-TokenExpired function.
2. Construct API URL: Builds the API endpoint URL based on the WorkspaceId.
3. Prepare Request Body: Creates a JSON payload with the provided parameters.
4. Invoke API Call: Sends a POST request to the Fabric API to create the DataPipeline.
5. Handle Response:
   1. 201 Created: DataPipeline successfully created.
   2. 202 Accepted: Creation request accepted; handles long-running operations.
   3. Error Codes: Logs and handles unexpected response codes.
6. Return: Outputs the response from the API, including metadata about the created DataPipeline

## Error Handling
- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author
**Tiago Balabuch**  

