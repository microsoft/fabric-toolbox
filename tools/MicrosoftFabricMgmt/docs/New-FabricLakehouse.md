# New-FabricLakehouse

## Overview

The `New-FabricLakehouse` function creates a new Lakehouse within a specified Microsoft Fabric workspace. This function facilitates the integration of data storage and analytics by setting up a Lakehouse, with options to enable schemas and provide descriptions.

## Description

This function sends a POST request to the Microsoft Fabric API to create a new Lakehouse in the given workspace. It supports optional parameters for adding descriptions and enabling schemas for organizing data within the Lakehouse. The function handles token validation, API request construction, and error handling.

## Features

- Ensures token validity before making API requests.
- Constructs the API URL dynamically based on provided parameters.
- Handles responses and validates the response code.
- Logs errors in case of API request failure.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the Lakehouse will be created.
- **Type:** String
- **Mandatory:** Yes

### LakehouseName

- **Description:** The name of the Lakehouse to be created.
- **Type:** String
- **Mandatory:** Yes
- **Validation:** Only alphanumeric and underscores allowed.

### LakehouseDescription

- **Description:** An optional description for the Lakehouse.
- **Type:** String
- **Mandatory:** No

### LakehouseEnableSchemas

- **Description:** An optional parameter to enable schemas in the Lakehouse.
- **Type:** Boolean
- **Mandatory:** No
- **Default:** `false`

## Usage Examples

### Example 1: Create a Lakehouse without schemas

```powershell
New-FabricLakehouse -WorkspaceId "workspace-12345" -LakehouseName "Lakehouse-12345"
```

### Example 2: Create a Lakehouse with schemas and description

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
New-FabricLakehouse -WorkspaceId $workspace.id -LakehouseName "Lakehouse-12345" -LakehouseEnableSchemas $true

```

## Prerequisites

- Ensure that `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`, is correctly configured with the required authentication details.
- Token validation should be handled using `Test-TokenExpired`.

## Key Workflow

1. Validates the token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl` and `WorkspaceId`.
3. Prepares the request body with the Lakehouse details.
4. Sends the POST request to the Microsoft Fabric API to create the Lakehouse.
5. Handles API responses, including long-running operations and retries.

## Error Handling

- The function logs errors at different stages, such as validation failures, API response errors, and unexpected statuses.
- Comprehensive error handling is included to assist in debugging.

## Author

**Tiago Balabuch**
