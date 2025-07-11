# Remove-FabricMLExperiment

## Overview

Deletes an ML Experiment from a specified workspace in Microsoft Fabric.

## Features

- Sends a DELETE request to remove the ML Experiment.
- Validates token expiration before making the API request.
- Logs detailed messages for debugging and error handling.

## Parameters

### WorkspaceId *(Mandatory)*

- **Description:** The unique identifier of the workspace containing the ML Experiment to delete.
- **Type:** String

### MLExperimentId *(Mandatory)*

- **Description:** The unique identifier of the ML Experiment to be deleted.
- **Type:** String

## Usage Examples

### Example 1: Removing an ML Experiment

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Remove-FabricMLExperiment -WorkspaceId $workspace.id -MLExperimentId "experiment-67890"
```

This example removes the ML Experiment with ID `experiment-67890` from the workspace with name `workspace-12345`.

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set the global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token's validity using `Test-TokenExpired`.
2. Constructs the API URL for the DELETE request using the provided parameters.
3. Sends the DELETE request to remove the specified ML Experiment.
4. Logs detailed responses and errors for debugging purposes.

## Error Handling

- Logs descriptive error messages if the API request fails or invalid input is detected.
- Returns `null` if an error occurs during execution.

## Author

**Tiago Balabuch**
