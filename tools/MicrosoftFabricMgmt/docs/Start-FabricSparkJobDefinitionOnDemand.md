# Start-FabricSparkJobDefinitionOnDemand

## Overview

The `Start-FabricSparkJobDefinitionOnDemand` function initiates a Spark Job Definition on demand within a specified workspace. It constructs the appropriate API endpoint URL and makes a POST request to start the job. The function can optionally wait for the job to complete based on the 'waitForCompletion' parameter.

## Features

- Ensures token validity before making API requests.
- Constructs the API URL dynamically based on provided parameters.
- Supports initiating Spark jobs with customizable job types.
- Handles responses, including long-running operations.

## Parameters

### WorkspaceId

- **Description:** The ID of the workspace where the Spark Job Definition is located.
- **Type:** String
- **Mandatory:** Yes

### SparkJobDefinitionId

- **Description:** The ID of the Spark Job Definition to be started.
- **Type:** String
- **Mandatory:** Yes

### JobType

- **Description:** The type of job to be started. Defaults to "sparkjob".
- **Type:** String
- **Mandatory:** No
- **Default Value:** "sparkjob"

### waitForCompletion

- **Description:** Optional flag to indicate whether to wait for the job to complete.
- **Type:** Boolean
- **Mandatory:** No
- **Default Value:** $false

## Usage Examples

### Example 1: Start a Spark Job Definition on demand and wait for completion

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$sparkJobDefinition = Get-FabricSparkJobDefinition -WorkspaceId $workspace.id -SparkJobDefinitionName "SparkJobDefinition01"
Start-FabricSparkJobDefinitionOnDemand -WorkspaceId $workspace.id -SparkJobDefinitionId $sparkJobDefinition.id -waitForCompletion $true
```

### Example 2: Start a Spark Job Definition on demand without waiting for completion

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$sparkJobDefinition = Get-FabricSparkJobDefinition -WorkspaceId $workspace.id -SparkJobDefinitionName "SparkJobDefinition01"
Start-FabricSparkJobDefinitionOnDemand -WorkspaceId $workspace.id -SparkJobDefinitionId $sparkJobDefinition.id -waitForCompletion $false
```

## Prerequisites

- Ensure that the necessary authentication tokens are valid before running this function.
- The function logs detailed messages for debugging and informational purposes.

## Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `SparkJobDefinitionId`.
3. Makes a POST request to the API endpoint.
4. Handles both immediate responses (success or failure) and long-running operations.

## Error Handling

- Logs descriptive error messages for invalid inputs or failed API requests.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**
