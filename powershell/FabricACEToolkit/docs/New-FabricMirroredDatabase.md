# New-FabricMirroredDatabase

## Overview

The `New-FabricMirroredDatabase` function creates a new MirroredDatabase within a specified workspace in Microsoft Fabric. It supports flexible configurations, including optional metadata, file-based definitions, and platform-specific settings, ensuring seamless integration with your workspace.

## Features

- **Token Validation:** Ensures the authentication token is valid before making the API request.
- **Custom Configurations:** Allows for optional descriptions and file-based definitions.
- **File Handling:** Supports uploading encoded MirroredDatabase and platform-specific definitions.
- **Long-Running Operation Support:** Manages asynchronous operations with real-time status updates.
- **Detailed Logging and Error Handling:** Provides comprehensive logs and error messages for troubleshooting.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the MirroredDatabase will be created.
- **Type:** String
- **Mandatory:** Yes

### MirroredDatabaseName

- **Description:** The name of the MirroredDatabase to be created.
- **Type:** String
- **Mandatory:** Yes
- **Validation:** Must contain only alphanumeric characters, underscores, or spaces.

### MirroredDatabaseDescription

- **Description:** An optional description for the MirroredDatabase.
- **Type:** String
- **Mandatory:** No

### MirroredDatabasePathDefinition

- **Description:** An optional path to the MirroredDatabase definition file to upload.
- **Type:** String
- **Mandatory:** No

### MirroredDatabasePathPlatformDefinition

- **Description:** An optional path to the platform-specific definition file to upload (e.g., `.platform`).
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Create a MirroredDatabase with a definition file

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
New-FabricMirroredDatabase -WorkspaceId $workspace.id `
    -MirroredDatabaseName "NewMirroredDatabase" `
    -MirroredDatabasePathDefinition "C:\temp\API\MirroredDatabases\MirroredDatabaseDefinition.json"
```

## Prerequisites

- **Global Configuration:** Use `Set-FabricApiHeaders` to set `$FabricConfig` with:
  - `BaseUrl`: Base API endpoint for Microsoft Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- **Token Validation:** Requires `Test-TokenExpired` to check token validity.

## Key Workflow

1. **Token Validation:** Ensures token validity using `Test-TokenExpired`.
2. **Request Preparation:** Constructs the API request with optional configurations.
3. **API Call:** Sends a POST request to create the MirroredDatabase.
4. **Response Handling:**
   - Synchronous responses (201 Created).
   - Asynchronous responses (202 Accepted) with real-time operation status updates.
5. **Error Handling:** Logs errors and provides descriptive messages.

## Error Handling

- **Invalid Input:** Logs error messages if invalid or empty input is detected.
- **API Failures:** Handles unexpected API response codes with detailed error logging.
- **File Issues:** Validates file content before processing and logs any related issues.

## Author

**Tiago Balabuch**  