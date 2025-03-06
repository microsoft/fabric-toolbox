# Update-FabricSparkSettings

## Overview

The `Update-FabricSparkSettings` function updates an existing Spark custom pool in a specified Microsoft Fabric workspace.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the Spark custom pool exists.
- **Type:** String
- **Mandatory:** Yes

### SparkSettingsId

- **Description:** The unique identifier of the Spark custom pool to be updated.
- **Type:** String
- **Mandatory:** Yes

### InstancePoolName

- **Description:** The new name of the Spark custom pool.
- **Type:** String
- **Mandatory:** Yes

### NodeFamily

- **Description:** The family of nodes to be used in the Spark custom pool. This must be 'MemoryOptimized'.
- **Type:** String
- **Mandatory:** Yes

### NodeSize

- **Description:** The size of the nodes to be used in the Spark custom pool. Options include 'Large', 'Medium', 'Small', 'XLarge', 'XXLarge'.
- **Type:** String
- **Mandatory:** Yes

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

### Example 1: Update a Spark custom pool with full configuration

```powershell
Update-FabricSparkSettings -WorkspaceId "workspace-12345" -SparkSettingsId "pool-67890" -InstancePoolName "Updated Spark Pool" -NodeFamily "MemoryOptimized" -NodeSize "Large" -AutoScaleEnabled $true -AutoScaleMinNodeCount 1 -AutoScaleMaxNodeCount 10 -DynamicExecutorAllocationEnabled $true -DynamicExecutorAllocationMinExecutors 1 -DynamicExecutorAllocationMaxExecutors 10
```

## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, and `SparkSettingsId`.
3. Constructs the JSON request body with all the necessary configurations.
4. Sends a PATCH request to the Microsoft Fabric API.
5. Handles API responses:
   - `200`: Spark custom pool updated successfully.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Provides robust error logging to assist in debugging issues.

## Author

**Tiago Balabuch**