# Load-FabricLakehouseTable

## Overview

The `Load-FabricLakehouseTable` function is used to load data into a specified table within a Lakehouse in Microsoft Fabric. It supports loading from different file paths, file formats, and handles various loading modes like `append` and `overwrite`.

## Description

This function sends a POST request to the Fabric API to load data into a table within a Lakehouse. It handles CSV and Parquet file formats and manages different loading modes. The function also supports recursive loading from folders, specifying delimiter settings for CSV files, and validates the token's expiration.

## Features

- Ensures token validity before making API requests.
- Constructs the API URL dynamically based on provided parameters.
- Handles responses and validates the response code.
- Logs errors in case of API request failure.

## Parameters

### WorkspaceId

- **Description:** The ID of the workspace containing the Lakehouse.
- **Type:** String
- **Mandatory:** Yes

### LakehouseId

- **Description:** The ID of the Lakehouse where the table resides.
- **Type:** String
- **Mandatory:** Yes

### TableName

- **Description:** The name of the table where data should be loaded.
- **Type:** String
- **Mandatory:** Yes
- **Validation:** Only alphanumeric and underscores allowed.

### PathType

- **Description:** The type of the data path (File or Folder).
- **Type:** String
- **Mandatory:** Yes
- **Validation:** Must be either 'File' or 'Folder'.

### RelativePath

- **Description:** The relative path to the data file or folder.
- **Type:** String
- **Mandatory:** Yes

### FileFormat

- **Description:** The format of the data (CSV or Parquet).
- **Type:** String
- **Mandatory:** Yes
- **Validation:** Must be either 'CSV' or 'Parquet'.

### CsvDelimiter

- **Description:** The delimiter to use for CSV files. Default is `","`.
- **Type:** String
- **Mandatory:** No

### CsvHeader

- **Description:** Indicates if the CSV file has a header row. Default is `false`.
- **Type:** Boolean
- **Mandatory:** No

### Mode

- **Description:** The mode of data loading (`append` or `overwrite`).
- **Type:** String
- **Mandatory:** Yes
- **Validation:** Must be either 'append' or 'overwrite'.

### Recursive

- **Description:** Flag to specify if loading should be recursive (only for Folder paths).
- **Type:** Boolean
- **Mandatory:** No
- **Default:** `false`

## Usage Examples

### Example 1:Load Table from a CSV file

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$lakehouse = Get-FabricLakehouse -WorkspaceId $workspace.id -LakehouseName "lakehouse-12345"
Load-FabricLakehouseTable `
-WorkspaceId $workspace.id `
-LakehouseId $lakehouse.id `
-TableName "Table01" `
-PathType File `
-RelativePath "Files/test.csv" `
-FileFormat CSV `
-Mode overwrite `
-CsvDelimiter "," `
-CsvHeader $true `
-Recursive $fals
```

### Example 2: Load Table from a parquet file

```powershell
$workspace = Get-FabricWorkspace -WorkspaceName "workspace-12345"
$lakehouse = Get-FabricLakehouse -WorkspaceId $workspace.id -LakehouseName "lakehouse-12345"
Load-FabricLakehouseTable `
-WorkspaceId $workspace.id `
-LakehouseId $lakehouse.id `
-TableName "Table02" `
-PathType File `
-RelativePath "Files/test.parquet" `
-FileFormat Parquet `
-Mode overwrite `
-Recursive $false
```

## Prerequisites

- Ensure that `$FabricConfig.BaseUrl` and `$FabricConfig.FabricHeaders` are correctly configured with the required authentication details.
- Token validation must be handled using `Test-TokenExpired`.

## Key Workflow

1. Validates the token using `Test-TokenExpired`.
2. Constructs the API URL using `BaseUrl`, `WorkspaceId`, `LakehouseId`, and `TableName`.
3. Prepares the data load request body based on parameters such as `PathType`, `RelativePath`, `FileFormat`, and `Mode`.
4. Sends the POST request to the Microsoft Fabric API to load the data.
5. Handles API responses, including long-running operations and retries.

## Error Handling

- The function logs errors at different stages, such as validation failures, API response errors, and unexpected statuses.
- It includes comprehensive error handling to assist in debugging.

## Author

**Tiago Balabuch**