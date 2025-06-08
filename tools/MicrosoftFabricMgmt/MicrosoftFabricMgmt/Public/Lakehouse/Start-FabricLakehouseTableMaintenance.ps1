function Start-FabricLakehouseTableMaintenance {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$LakehouseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('TableMaintenance')]
        [string]$JobType = "TableMaintenance",

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SchemaName,
        
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$TableName,
        
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$IsVOrder,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string[]]$ColumnsZOrderBy,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern("^\d+:[0-1][0-9]|2[0-3]:[0-5][0-9]:[0-5][0-9]$")]
        [string]$retentionPeriod,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$waitForCompletion = $false
        
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Validate input parameters
        $lakehouse = Get-FabricLakehouse -WorkspaceId $WorkspaceId -LakehouseId $LakehouseId   
        if ($lakehouse.properties.PSObject.Properties['defaultSchema'] -and -not $SchemaName) {
            Write-Error "The Lakehouse '$lakehouse.displayName' has schema enabled, but no schema name was provided. Please specify the 'SchemaName' parameter to proceed."
            return $null
        }
        
        # Construct the API endpoint URI 
        $apiEndpointURI = "{0}/workspaces/{1}/lakehouses/{2}/jobs/instances?jobType={3}" -f $FabricConfig.BaseUrl, $WorkspaceId , $LakehouseId, $JobType
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            executionData = @{
                tableName        = $TableName
                optimizeSettings = @{}
            }
        }
        if ($lakehouse.properties.PSObject.Properties['defaultSchema'] -and $SchemaName) {
            $body.executionData.schemaName = $SchemaName
        }
        if ($IsVOrder) {
            $body.executionData.optimizeSettings.vOrder = $IsVOrder
        }
       

        if ($ColumnsZOrderBy) {
            Write-Message -Message "Original ColumnsZOrderBy input: $ColumnsZOrderBy" -Level Debug

            # If it's a single string like "id,nome", split it into array
            if ($ColumnsZOrderBy.Count -eq 1 -and $ColumnsZOrderBy[0] -is [string] -and $ColumnsZOrderBy[0] -match ",") {
                Write-Message -Message "Detected comma-separated string in ColumnsZOrderBy. Splitting it..." -Level Debug
                $ColumnsZOrderBy = $ColumnsZOrderBy[0] -split "\s*,\s*"
            }

            # Ensure values are trimmed and valid
            $ColumnsZOrderBy = $ColumnsZOrderBy | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ }

            if ($ColumnsZOrderBy.Count -gt 0) {
                $body.executionData.optimizeSettings.zOrderBy = $ColumnsZOrderBy
                Write-Message -Message "Final ColumnsZOrderBy: $($ColumnsZOrderBy -join ', ')" -Level Debug
            }
            else {
                Write-Message -Message "ColumnsZOrderBy was provided but resulted in an empty array after processing." -Level Warning
            }
        }


        <#    if ($ColumnsZOrderBy) {
            # Ensure $ColumnsZOrderBy is an array
            Write-Message -Message "ColumnsZOrderBy: $ColumnsZOrderBy" -Level Debug
            if ($ColumnsZOrderBy -is [string]) {
                Write-Message -Message "Converting string to array for ColumnsZOrderBy" -Level Debug
                $ColumnsZOrderBy = $ColumnsZOrderBy -split "\s*,\s*"
            }
            # Add it to the optimizeSettings in the request body
            $body.executionData.optimizeSettings.zOrderBy = $ColumnsZOrderBy
        }
#>

        <#        if ($ColumnsZOrderBy) {
            # Ensure $ColumnsZOrderBy is an array
            if (-not ($ColumnsZOrderBy -is [array])) {
                $ColumnsZOrderBy = $ColumnsZOrderBy -split ","
            }
            # Add it to the optimizeSettings in the request body
            $body.executionData.optimizeSettings.zOrderBy = $ColumnsZOrderBy
        }#>
        
        if ($retentionPeriod) {
            if (-not $body.executionData.PSObject.Properties['vacuumSettings']) {
                $body.executionData.vacuumSettings = @{
                    retentionPeriod = @()
                }
            }
            $body.executionData.vacuumSettings.retentionPeriod = $retentionPeriod
    
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $response = Invoke-FabricAPIRequest `
            -BaseURI $apiEndpointURI `
            -Headers $FabricConfig.FabricHeaders `
            -Method Post `
            -Body $bodyJson `
            -WaitForCompletion $waitForCompletion `
            -HasResults $false  
      

        if ($waitForCompletion) {
            Write-Message -Message "Table maintenance job for Lakehouse '$($lakehouse.displayName)' has completed." -Level Info
            Write-Message -Message "Job details: $($response | ConvertTo-Json -Depth 5)" -Level Debug
        }
        else {
            Write-Message -Message "Table maintenance job for Lakehouse '$($lakehouse.displayName)' has been started and is running asynchronously." -Level Info
            Write-Message -Message "You can monitor the job status using the job ID from the response." -Level Debug
        }
        # Return the API response
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to start table maintenance job. Error: $errorDetails" -Level Error
    }
}
