# New-FabricKQLQueryset

## Overview

Creates a new KQLQueryset in a specified Microsoft Fabric workspace by sending a POST request to the Microsoft Fabric API. This function supports optional parameters for description, path definitions for the KQLQueryset content, and creation payload.

## Features

- Creates a KQLQueryset with a specified name and optional description.
- Supports uploading KQLQueryset content and platform-specific definitions.
- Handles long-running operations for asynchronous provisioning.
- Ensures robust token validation and error handling.

## Parameters

### WorkspaceId

- **Description:** The unique identifier of the workspace where the KQLQueryset will be created.
- **Type:** String
- **Mandatory:** Yes

### KQLQuerysetName

- **Description:** The name of the KQLQueryset to be created.
- **Type:** String
- **Mandatory:** Yes

### KQLQuerysetDescription

- **Description:** An optional description for the KQLQueryset.
- **Type:** String
- **Mandatory:** No

### KQLQuerysetPathDefinition

- **Description:** An optional path to the KQLQueryset definition file (e.g., `.ipynb`) to upload.
- **Type:** String
- **Mandatory:** No

### KQLQuerysetPathPlatformDefinition

- **Description:** An optional path to the platform-specific definition file (e.g., `.platform`) to upload.
- **Type:** String
- **Mandatory:** No

### KQLQuerysetPathSchemaDefinition

- **Description:** An optional path to the schema definition file (e.g., `.kql`) to upload.
- **Type:** String
- **Mandatory:** No

### KQLQuerysetType

- **Description:** Specifies the type of KQLQueryset (`ReadWrite` or `Shortcut`).
- **Type:** String
- **Mandatory:** Yes

### parentEventhouseId

- **Description:** The parent eventhouse ID for ReadWrite KQLQueryset type.
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

### Example 1: Add a new KQL Queryset

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$eventhouse = Get-FabricEventhouse -WorkspaceId $workspace.id -EventhouseName "Eventhouse-12345"
New-FabricKQLQueryset -WorkspaceId $workspace.id -KQLQuerysetName "KQLQueryset-12345" -KQLQuerysetType "ReadWrite" -parentEventhouseId $eventhouse.id
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
