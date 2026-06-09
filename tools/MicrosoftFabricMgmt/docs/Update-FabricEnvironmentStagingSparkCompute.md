# Update-FabricEnvironmentStagingSparkCompute

## Overview

The `Update-FabricEnvironmentStagingSparkCompute` function sends a PATCH request to the Microsoft Fabric API to update the Spark compute settings for a specified environment in the staging workspace.

## Features

- Validates token expiration before making the API request.
- Constructs and sends a PATCH request to update Spark compute configurations.
- Handles successful and error responses.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the environment exists.
- **Type:** String
- **Mandatory:** Yes

### EnvironmentId

- **Description:** The unique identifier of the environment where the Spark compute settings will be updated.
- **Type:** String
- **Mandatory:** Yes

### InstancePoolName

- **Description:** The name of the instance pool to be used for Spark compute.
- **Type:** String
- **Mandatory:** Yes

### InstancePoolType

- **Description:** The type of instance pool (either 'Workspace' or 'Capacity').
- **Type:** String
- **Mandatory:** Yes

### DriverCores

- **Description:** The number of cores to allocate to the driver.
- **Type:** Integer
- **Mandatory:** Yes

### DriverMemory

- **Description:** The amount of memory to allocate to the driver.
- **Type:** String
- **Mandatory:** Yes

### ExecutorCores

- **Description:** The number of cores to allocate to each executor.
- **Type:** Integer
- **Mandatory:** Yes

### ExecutorMemory

- **Description:** The amount of memory to allocate to each executor.
- **Type:** String
- **Mandatory:** Yes

### DynamicExecutorAllocationEnabled

- **Description:** Boolean flag to enable or disable dynamic executor allocation.
- **Type:** Boolean
- **Mandatory:** Yes

### DynamicExecutorAllocationMinExecutors

- **Description:** The minimum number of executors when dynamic allocation is enabled.
- **Type:** Integer
- **Mandatory:** Yes

### DynamicExecutorAllocationMaxExecutors

- **Description:** The maximum number of executors when dynamic allocation is enabled.
- **Type:** Integer
- **Mandatory:** Yes

### RuntimeVersion

- **Description:** The Spark runtime version to use.
- **Type:** String
- **Mandatory:** Yes

### SparkProperties

- **Description:** A hashtable of additional Spark properties to configure.
- **Type:** Hashtable
- **Mandatory:** Yes

## Usage Examples

### Example 1: Update the Spark compute settings for a specified environment

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$env = Get-FabricEnvironment -WorkspaceId $workspace.id -EnvironmentName "Env01"
$sparkPool = Get-FabricSparkCustomPool -WorkspaceId $workspace.id -SparkCustomPoolName "MyPool"
Update-FabricEnvironmentStagingSparkCompute `
-WorkspaceId $workspace.id `
-EnvironmentId $env.id `
-InstancePoolName $sparkPool.name `
-InstancePoolType Workspace `
-DriverCores 4 `
-DriverMemory "28g" `
-ExecutorCores 4 `
-ExecutorMemory "28g" `
-DynamicExecutorAllocationEnabled $true `
-DynamicExecutorAllocationMinExecutors 1 `
-DynamicExecutorAllocationMaxExecutors 1 `
-RuntimeVersion "1.3" `
-SparkProperties @{"spark.dynamicAllocation.executorAllocationRatio" = 1.1 }    

```

## Prerequisites

- Use the command `Set-FabricApiHeaders` to set global configuration variable `$FabricConfig`, containing:
  - `BaseUrl`: Base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `EnvironmentId`.
3. Builds the request body with Spark compute configurations (instance pool, driver and executor settings, dynamic allocation, runtime version, and Spark properties).
4. Sends a PATCH request to update the Spark compute settings.
5. Validates the API response and handles results accordingly.

## Error Handling

- Logs descriptive error messages if API requests fail or invalid input is detected.
- Returns `null` for any errors encountered during execution.

## Author

**Tiago Balabuch**  
