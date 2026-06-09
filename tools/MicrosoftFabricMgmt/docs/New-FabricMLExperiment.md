# New-FabricMLExperiment

## Overview

The `New-FabricMLExperiment` function creates a new ML Experiment in a specified Microsoft Fabric workspace by sending a POST request to the Microsoft Fabric API. It supports optional parameters for providing a description of the ML Experiment.

## Features

- Validates token expiration before making the API request.
- Supports optional descriptions for the ML Experiment.
- Handles API responses, including long-running operations.
- Provides descriptive logging and error handling.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the ML Experiment will be created.
- **Type:** String
- **Mandatory:** Yes

### MLExperimentName

- **Description:** The name of the ML Experiment to be created.
- **Type:** String
- **Mandatory:** Yes

### MLExperimentDescription

- **Description:** An optional description for the ML Experiment.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Create an ML Experiment with a description

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
New-FabricMLExperiment -WorkspaceId $workspace.id -MLExperimentName "MLExperiment-12345" -MLExperimentDescription "Description of the new ML Experiment"
```

This example creates a new ML Experiment named "MLExperiment-12345" in the workspace with name "workspace-12345" with the provided description.

### Example 2: Create an ML Experiment without a description

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
New-FabricMLExperiment -WorkspaceId $workspace.id -MLExperimentName "MLExperiment-67890"
```

This example creates a new ML Experiment named "MLExperiment-67890" in the workspace with name "workspace-12345" without providing a description.

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL for creating an ML Experiment.
3. Builds the request body with the provided parameters.
4. Sends a POST request to the Microsoft Fabric API.
5. Handles API responses, including long-running operations.
6. Logs descriptive messages for debugging and error handling.

## Error Handling

- Logs detailed error messages if the API request fails or invalid input is detected.
- Handles unexpected API response codes and provides guidance for resolution.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**
