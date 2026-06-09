# Get-FabricDataPipeline

## Overview
The `Get-FabricDataPipeline` function retrieves all data pipelines from a specified workspace using either the provided DataPipelineId or DataPipelineName. It validates the token, constructs the API URL, sends the API request, and processes the response.

## Parameters

### `WorkspaceId` *(Mandatory)*
- **Description:** The unique identifier of the workspace where the Data Pipeline exists.
- **Type:** String

### `DataPipelineId` *(Mandatory)*
- **Description:** The unique identifier of the Data Pipeline to retrieve.
- **Type:** String

### `DataPipelineName` *(Optional)*
- **Description:** The display name of the Data Pipeline. 
- **Type:** String

> **Note:** Only one parameter, `DataPipelineId` or `DataPipelineName`, should be specified at a time.

## Usage Examples

### Example 1: Retrieve Data Pipeline by ID
```powershell
Get-FabricDataPipeline -WorkspaceId "workspace-12345" -DataPipelineId "datapipeline-67890"
```
Retrieves the Data Pipeline details for the Data Pipeline with ID `datapipeline-67890` in the workspace with ID `workspace-12345`.

### Example 2: Retrieve Data Pipeline by Name
```powershell
Get-FabricDataPipeline -WorkspaceId "workspace-12345" -DataPipelineName "My Data Pipeline"
```
Retrieves the Data Pipeline details for the Data Pipeline named `My Data Pipeline` in the workspace with ID `workspace-12345`.

### Example 3: List all Data Pipeline in the workspace
```powershell
Get-FabricDataPipeline -WorkspaceId "workspace-12345"
```
Returns a list of all Data Pipelines available in the workspace.

## Prerequisites
- Use the command `Set-FabricApiHeaders` to set global configuration variable `$FabricConfig` , containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow
1. Validates that only one input parameter (`DataPipelineId` or `DataPipelineName`) is provided.
2. Ensures the authentication token is valid.
3. Retrieves capacities via the Fabric API, handling paginated responses automatically.
4. Filters results based on provided criteria or returns all capacities if no filters are applied.
   
## Notes
- Requires a `$FabricConfig` global configuration object, including `BaseUrl` and `FabricHeaders`.
- Calls the `Test-TokenExpired` function to ensure token validity before making the API request.

## Author
**Author**: Tiago Balabuch  

