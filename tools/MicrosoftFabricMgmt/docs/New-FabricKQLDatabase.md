# New-FabricKQLDatabase

## Overview

Creates a new KQLDatabase in a specified Microsoft Fabric workspace by sending a POST request to the Microsoft Fabric API. This function supports optional parameters for description, path definitions for the KQLDatabase content, and creation payload.

## Features

- Creates a KQLDatabase with a specified name and optional description.
- Supports uploading KQLDatabase content and platform-specific definitions.
- Handles long-running operations for asynchronous provisioning.
- Ensures robust token validation and error handling.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the KQLDatabase will be created.
- **Type:** String
- **Mandatory:** Yes

### KQLDatabaseName

- **Description:** The name of the KQLDatabase to be created.
- **Type:** String
- **Mandatory:** Yes

### KQLDatabaseDescription

- **Description:** An optional description for the KQLDatabase.
- **Type:** String
- **Mandatory:** No

### KQLDatabasePathDefinition

- **Description:** An optional path to the KQLDatabase definition file (e.g., `.ipynb`) to upload.
- **Type:** String
- **Mandatory:** No

### KQLDatabasePathPlatformDefinition

- **Description:** An optional path to the platform-specific definition file (e.g., `.platform`) to upload.
- **Type:** String
- **Mandatory:** No

### KQLDatabasePathSchemaDefinition

- **Description:** An optional path to the schema definition file (e.g., `.kql`) to upload.
- **Type:** String
- **Mandatory:** No

### KQLDatabaseType

- **Description:** Specifies the type of KQLDatabase (`ReadWrite` or `Shortcut`).
- **Type:** String
- **Mandatory:** Yes

### parentEventhouseId

- **Description:** The parent eventhouse ID for ReadWrite KQLDatabase type.
- **Type:** String
- **Mandatory:** No (Required for ReadWrite type)

### KQLInvitationToken

- **Description:** Optional invitation token for Shortcut type.
- **Type:** String
- **Mandatory:** No (Required for Shortcut type)

### KQLSourceClusterUri

- **Description:** Optional source cluster URI for Shortcut type.
- **Type:** String
- **Mandatory:** No

### KQLSourceDatabaseName

- **Description:** Optional source database name for Shortcut type.
- **Type:** String
- **Mandatory:** No

## Usage Examples

### Example 1: Add a new KQL Database

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$eventhouse = Get-FabricEventhouse -WorkspaceId $workspace.id -EventhouseName "Eventhouse-12345"
New-FabricKQLDatabase -WorkspaceId $workspace.id -KQLDatabaseName "KQLDatabase-12345" -KQLDatabaseType "ReadWrite" -parentEventhouseId $eventhouse.id
```

## Prerequisites

- The global `$FabricConfig` configuration variable must include:
  - `BaseUrl`: The base API endpoint for Fabric.
  - `FabricHeaders`: Authentication headers for API requests.
- Token validation requires the `Test-TokenExpired` helper function.

## Key Workflow

1. Validates the authentication token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl` and `WorkspaceId`.
3. Builds the request body with optional content, platform, and schema definitions.
4. Sends a POST request to the Microsoft Fabric API.
5. Handles API responses:
   - `201`: Database created successfully.
   - `202`: Database creation accepted, and provisioning proceeds asynchronously.
   - Other codes: Logs and throws errors for unexpected responses.

## Error Handling

- Logs detailed error messages for invalid inputs or API failures.
- Provides robust error logging to assist in debugging issues.

## Author

**Tiago Balabuch**
