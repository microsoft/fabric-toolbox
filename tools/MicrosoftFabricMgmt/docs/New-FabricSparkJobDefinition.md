# New-FabricSparkJobDefinition

## Overview

The `New-FabricSparkJobDefinition` function creates a new SparkJobDefinition within a specified Microsoft Fabric workspace. This function facilitates integrating data and analytics by setting up a Spark job with options for providing descriptions and uploading job definitions.

## Description

This function sends a POST request to the Microsoft Fabric API to create a new SparkJobDefinition in the given workspace. It supports optional parameters for adding descriptions, Spark job definitions, and platform-specific definitions. The function handles token validation, API request construction, and error handling.

## Features

- Ensures token validity before making API requests.
- Dynamically constructs the API URL based on provided parameters.
- Supports uploading Spark job definitions and platform definitions.
- Handles responses and validates the response code.
- Logs errors in case of API request failure.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the SparkJobDefinition will be created.
- **Type:** String
- **Mandatory:** Yes

### SparkJobDefinitionName

- **Description:** The name of the SparkJobDefinition to be created.
- **Type:** String
- **Mandatory:** Yes
- **Validation:** Only alphanumeric characters and underscores are allowed.

### SparkJobDefinitionDescription

- **Description:** An optional description for the SparkJobDefinition.
- **Type:** String
- **Mandatory:** No

### SparkJobDefinitionPathDefinition

- **Description:** An optional path to the SparkJobDefinition definition file to upload.
- **Type:** String
- **Mandatory:** No

### SparkJobDefinitionPathPlatformDefinition

- **Description:** An optional path to the platform-specific definition file to upload.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Create a SparkJobDefinition

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
New-FabricSparkJobDefinition `
-WorkspaceId $workspace.id `
-SparkJobDefinitionName "New SparkJobDefinition" `
-SparkJobDefinitionDescription "Description of the new SparkJobDefinition" `
-SparkJobDefinitionPathDefinition "C:\temp\API\SparkJobDefinition\Definition.json"
```

## Prerequisites

- Ensure that `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`, is correctly configured with the required authentication details.
- Token validation should be handled using `Test-TokenExpired`.

## Key Workflow

1. Validates the token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl` and `WorkspaceId`.
3. Prepares the request body with Spark job details and optional definitions.
4. Sends the POST request to the Microsoft Fabric API to create the Spark job definition.
5. Handles API responses, including long-running operations and retries.

## Error Handling

- The function logs errors at different stages, such as validation failures, API response errors, and unexpected statuses.
- Comprehensive error handling is included to assist in debugging.

## Author

**Tiago Balabuch**