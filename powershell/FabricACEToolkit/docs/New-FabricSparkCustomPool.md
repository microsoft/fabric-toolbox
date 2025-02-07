# New-FabricSparkCustomPool

## Overview

The `New-FabricSparkCustomPool` function creates a new Spark custom pool in a specified Microsoft Fabric workspace. This function facilitates setting up custom Spark pools with various configurations for optimizing data processing and analytics.

## Description

This function sends a POST request to the Microsoft Fabric API to create a new Spark custom pool in the given workspace. It supports multiple parameters for configuring the Spark pool, including node families, sizes, auto-scaling, and dynamic executor allocations. The function also includes token validation, API request construction, error handling, and logging.

## Features

- Ensures token validity before making API requests.
- Dynamically constructs the API URL based on provided parameters.
- Supports configuring Spark custom pools with options like node family, size, auto-scaling, and executor allocation.
- Handles responses and validates the response code.
- Logs errors in case of API request failure.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the Spark custom pool will be created.
- **Type:** String
- **Mandatory:** Yes

### SparkCustomPoolName

- **Description:** The name of the Spark custom pool to be created.
- **Type:** String
- **Mandatory:** Yes
- **Validation:** Only alphanumeric characters and underscores are allowed.

### NodeFamily

- **Description:** The family of nodes to be used in the Spark custom pool.
- **Type:** String
- **Mandatory:** Yes
- **Validation:** Must be `MemoryOptimized`.

### NodeSize

- **Description:** The size of the nodes to be used in the Spark custom pool.
- **Type:** String
- **Mandatory:** Yes
- **Validation:** Must be one of `Large`, `Medium`, `Small`, `XLarge`, `XXLarge`.

### AutoScaleEnabled

- **Description:** Specifies whether auto-scaling is enabled for the Spark custom pool.
- **Type:** Boolean
- **Mandatory:** Yes

### AutoScaleMinNodeCount

- **Description:** The minimum number of nodes for auto-scaling in the Spark custom pool.
- **Type:** Integer
- **Mandatory:** Yes

### AutoScaleMaxNodeCount

- **Description:** The maximum number of nodes for auto-scaling in the Spark custom pool.
- **Type:** Integer
- **Mandatory:** Yes

### DynamicExecutorAllocationEnabled

- **Description:** Specifies whether dynamic executor allocation is enabled for the Spark custom pool.
- **Type:** Boolean
- **Mandatory:** Yes

### DynamicExecutorAllocationMinExecutors

- **Description:** The minimum number of executors for dynamic executor allocation in the Spark custom pool.
- **Type:** Integer
- **Mandatory:** Yes

### DynamicExecutorAllocationMaxExecutors

- **Description:** The maximum number of executors for dynamic executor allocation in the Spark custom pool.
- **Type:** Integer
- **Mandatory:** Yes

## Usage Examples

### Example 1: Create a Spark Custom Pool

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
New-FabricSparkCustomPool `
-WorkspaceId $workspace.id `
-SparkCustomPoolName "MyPool" `
-NodeFamily MemoryOptimized `
-NodeSize Medium `
-AutoScaleEnabled $true `
-AutoScaleMinNodeCount 1 `
-AutoScaleMaxNodeCount 2 `
-DynamicExecutorAllocationEnabled $true `
-DynamicExecutorAllocationMinExecutors 1 `
-DynamicExecutorAllocationMaxExecutors 1 
```

## Prerequisites

- Ensure that `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`, is correctly configured with the required authentication details.
- Token validation should be handled using `Test-TokenExpired`.

## Key Workflow

1. Validates the token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl` and `WorkspaceId`.
3. Prepares the request body with Spark custom pool details.
4. Sends the POST request to the Microsoft Fabric API to create the Spark custom pool.
5. Handles API responses, including long-running operations and retries.

## Error Handling

- The function logs errors at different stages, such as validation failures, API response errors, and unexpected statuses.
- Comprehensive error handling is included to assist in debugging.

## Author

**Tiago Balabuch**