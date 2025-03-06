# Update-FabricMLExperiment

## Overview

Updates an existing ML Experiment in a specified Microsoft Fabric workspace.

## Features

- Sends a PATCH request to update the ML Experiment.
- Supports updating the ML Experiment name and description.
- Validates token expiration before making the API request.
- Logs detailed messages for debugging and error handling.

## Parameters

### WorkspaceId *(Mandatory)*

- **Description:** The ID of the workspace containing the ML Experiment to update.
- **Type:** String

### MLExperimentId *(Mandatory)*

- **Description:** The ID of the ML Experiment to update.
- **Type:** String

### MLExperimentName *(Mandatory)*

- **Description:** The new name of the ML Experiment.
- **Type:** String
- **Validation:** Must contain only alphanumeric characters or underscores.

### MLExperimentDescription *(Optional)*

- **Description:** The new description for the ML Experiment.
- **Type:** String

## Usage Examples

### Example 1: Updating an ML Experiment

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Update-FabricMLExperiment -WorkspaceId $workspace.id -MLExperimentId "experiment-67890" -MLExperimentName "Updated ML Experiment" -MLExperimentDescription "Updated description"
```

This example updates the ML Experiment with ID `experiment-67890` in the workspace with name `workspace-12345`, setting a new name and description.

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set the global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates that all required parameters are provided.
2. Ensures the authentication token is valid.
3. Constructs the API URL and request body based on provided input.
4. Sends a PATCH request to update the ML Experiment.
5. Handles errors gracefully, logging descriptive messages for debugging.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**
