<#
.SYNOPSIS
Loads one or more data files (or all files in a folder) into a Lakehouse table within a Microsoft Fabric workspace.

.DESCRIPTION
Triggers a load operation against a Lakehouse table. You specify the workspace and Lakehouse identifiers, the target table name, and the source path within the Lakehouse Files area. The source can be a single file or a folder. CSV and Parquet formats are supported. Mode "append" adds new data; mode "overwrite" replaces existing table data.
Additional CSV parsing options allow providing a custom delimiter and indicating if the first line contains headers. Recursive folder traversal can be enabled to load nested files.

.PARAMETER WorkspaceId
Mandatory. The GUID of the workspace that contains the Lakehouse.

.PARAMETER LakehouseId
Mandatory. The GUID of the Lakehouse hosting the target table.

.PARAMETER TableName
Mandatory. The name of the Lakehouse table to load data into. Must contain only alphanumeric characters and underscores.

.PARAMETER PathType
Mandatory. Indicates whether the RelativePath points to a single File or a Folder. Use 'File' to load one file; use 'Folder' to load all files (recursively if -Recursive is specified).

.PARAMETER RelativePath
Mandatory. The relative path inside the Lakehouse Files area to the source file or folder. Example: 'Files/data/2024/file.csv'.

.PARAMETER FileFormat
Mandatory. The format of the source data. Allowed values are 'Csv' or 'Parquet'. Determines parsing behavior.

.PARAMETER CsvDelimiter
Optional. The delimiter character for CSV files. Defaults to a comma (,). Only used when FileFormat is 'Csv'.

.PARAMETER CsvHeader
Optional. Indicates whether the first row of the CSV file contains column headers. Default is $false. Only used for CSV loads.

.PARAMETER Mode
Mandatory. Specifies load behavior: 'append' adds rows to the existing table; 'overwrite' replaces the entire table contents with the new data.

.PARAMETER Recursive
Optional. When PathType is 'Folder', setting this to $true loads files from all subfolders beneath RelativePath.

.EXAMPLE
Write-FabricLakehouseTableData -WorkspaceId $wId -LakehouseId $lId -TableName Sales -PathType File -RelativePath 'Files/landing/sales_2024_01.csv' -FileFormat Csv -CsvDelimiter ';' -CsvHeader $true -Mode append

Loads a single semicolon-delimited CSV file with headers into the Sales table, appending rows to existing data.

.EXAMPLE
Write-FabricLakehouseTableData -WorkspaceId $wId -LakehouseId $lId -TableName Inventory -PathType Folder -RelativePath 'Files/raw/inventory' -FileFormat Parquet -Mode overwrite -Recursive $true

Overwrites the Inventory table with all Parquet files found recursively under the specified folder.

.NOTES
- Requires `$FabricConfig` with `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` before invoking the API.
- Operation may run asynchronously in the Fabric service; monitor with subsequent status queries if needed.
- Use ShouldProcess support for confirmation in interactive sessions.

Author: Updated by Jess Pomfret and Rob Sewell November 2026; Help extended by Copilot.
#>
function Write-FabricLakehouseTableData {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    [Alias("Load-FabricLakehouseTable")]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$LakehouseId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_]*$')]
        [string]$TableName,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('File', 'Folder')]
        [string]$PathType,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$RelativePath,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('Csv', 'Parquet')]
        [string]$FileFormat,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$CsvDelimiter = ",",

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$CsvHeader = $false,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('append', 'overwrite')]
        [string]$Mode = "append",

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$Recursive = $false
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/lakehouses/{2}/tables/{3}/load" -f $FabricConfig.BaseUrl, $WorkspaceId, $LakehouseId, $TableName
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            relativePath  = $RelativePath
            pathType      = $PathType
            mode          = $Mode
            recursive     = $Recursive
            formatOptions = @{
                format = $FileFormat
            }
        }

        if ($FileFormat -eq "Csv") {
            $body.formatOptions.delimiter = $CsvDelimiter
            $body.formatOptions.header = $CsvHeader
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Post'
            Body    = $bodyJson
            #HasResults = $false
        }
        if ($PSCmdlet.ShouldProcess($TableName, "Load data into table in Lakehouse '$LakehouseId' (workspace '$WorkspaceId')")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Table '$TableName' loaded successfully into Lakehouse '$LakehouseId' in Workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Lakehouse. Error: $errorDetails" -Level Error
    }
}
