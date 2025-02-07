# Get-FabricMLExperiment

## Overview
The `Get-FabricMLExperiment` function retrieves ML Experiment details from a specified Microsoft Fabric workspace using either the provided MLExperimentId or MLExperimentName.

## Features
- Validates token expiration before making the API request.
- Supports retrieval by ML Experiment ID or name.
- Handles paginated API responses using continuation tokens.
- Provides detailed error handling and logging for debugging.

## Parameters

### WorkspaceId
- **Description:** The unique identifier of the workspace where the ML Experiment exists.
- **Type:** String
- **Mandatory:** Yes

### MLExperimentId
- **Description:** The unique identifier of the ML Experiment to retrieve.
- **Type:** String
- **Mandatory:** No

### MLExperimentName
- **Description:** The name of the ML Experiment to retrieve.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Retrieve an ML Experiment by ID

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricMLExperiment -WorkspaceId $workspace.id -MLExperimentId "MLexperiment-67890"
```

This example retrieves the ML Experiment details for the experiment with ID `MLexperiment-67890` in the workspace with ID `workspace-12345`.

### Example 2: Retrieve an ML Experiment by Name

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricMLExperiment -WorkspaceId $workspace.id -MLExperimentName "MLexperiment-12345"
```

This example retrieves the ML Experiment details for the experiment named `MLexperiment-12345` in the workspace with ID `workspace-12345`.

### Example 3: Retrieve All ML Experiments in a Workspace

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
Get-FabricMLExperiment -WorkspaceId $workspace.id
```

This example retrieves all ML Experiments in the workspace with ID `workspace-12345`.

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set the global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Ensures only one filter (`MLExperimentId` or `MLExperimentName`) is provided.
2. Validates the authentication token using `Test-TokenExpired`.
3. Constructs the API URL and retrieves ML Experiment details using paginated responses if needed.
4. Filters the response data based on the provided parameters.
5. Logs descriptive messages for debugging and error handling.

## Error Handling

- Logs detailed error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**