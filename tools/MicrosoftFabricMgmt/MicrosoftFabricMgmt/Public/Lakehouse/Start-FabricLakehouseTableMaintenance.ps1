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
        [array]$ColumnsZOrderBy,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern("^\d+:[0-1][0-9]|2[0-3]:[0-5][0-9]:[0-5][0-9]$")]
        [string]$retentionPeriod,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$waitForCompletion = $false
        
    )

    try {
        # Step 1: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug
        
        
        $lakehouse = Get-FabricLakehouse -WorkspaceId $WorkspaceId -LakehouseId $LakehouseId   
        if ($lakehouse.properties.PSObject.Properties['defaultSchema'] -and -not $SchemaName) {
            Write-Error "The Lakehouse '$lakehouse.displayName' has schema enabled, but no schema name was provided. Please specify the 'SchemaName' parameter to proceed."
            return
        }
                
        # Step 2: Construct the API URL
        $apiEndpointUrl = "{0}/workspaces/{1}/lakehouses/{2}/jobs/instances?jobType={3}" -f $FabricConfig.BaseUrl, $WorkspaceId , $LakehouseId, $JobType
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Step 3: Construct the request body
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
        # Ensure $ColumnsZOrderBy is an array
        if (-not ($ColumnsZOrderBy -is [array])) {
            $ColumnsZOrderBy = $ColumnsZOrderBy -split ","
        }
        # Add it to the optimizeSettings in the request body
        $body.executionData.optimizeSettings.zOrderBy = $ColumnsZOrderBy
    }
    


        if ($retentionPeriod) {

            if (-not $body.executionData.PSObject.Properties['vacuumSettings']) {
                $body.executionData.vacuumSettings = @{
                    retentionPeriod = @()
                }
            }
            $body.executionData.vacuumSettings.retentionPeriod = $retentionPeriod
    
        }
            
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Step 4: Make the API request
        $response = Invoke-RestMethod `
            -Headers $FabricConfig.FabricHeaders `
            -Uri $apiEndpointUrl `
            -Method Post `
            -Body $bodyJson `
            -ContentType "application/json" `
            -ErrorAction Stop `
            -SkipHttpErrorCheck `
            -ResponseHeadersVariable "responseHeader" `
            -StatusCodeVariable "statusCode"

        Write-Message -Message "Response Code: $statusCode" -Level Debug    
        # Step 5: Handle and log the response
        switch ($statusCode) {
            201 {
                Write-Message -Message "Table maintenance job successfully initiated for Lakehouse '$lakehouse.displayName'." -Level Info
                return $response
            }
            202 {
                Write-Message -Message "Table maintenance job accepted and is now running in the background. Job execution is in progress." -Level Info
                [string]$operationId = $responseHeader["x-ms-operation-id"]
                [string]$location = $responseHeader["Location"]
                [string]$retryAfter = $responseHeader["Retry-After"] 

                Write-Message -Message "Operation ID: '$operationId'" -Level Debug
                Write-Message -Message "Location: '$location'" -Level Debug
                Write-Message -Message "Retry-After: '$retryAfter'" -Level Debug
               
                if ($waitForCompletion -eq $true) {
                    Write-Message -Message "Getting Long Running Operation status" -Level Debug               
                    $operationStatus = Get-FabricLongRunningOperation -operationId $operationId -location $location -retryAfter $retryAfter
                    Write-Message -Message "Long Running Operation status: $operationStatus" -Level Debug
                    return $operationStatus
                }
                else {
                    Write-Message -Message "The operation is running asynchronously." -Level Info
                    Write-Message -Message "Use the returned details to check the operation status." -Level Info
                    Write-Message -Message "To wait for the operation to complete, set the 'waitForCompletion' parameter to true." -Level Info  
                    $operationDetails = [PSCustomObject]@{
                        OperationId = $operationId
                        Location    = $location
                        RetryAfter  = $retryAfter
                    }
                    return $operationDetails
                }
            }
            default {
                Write-Message -Message "Unexpected response code: $statusCode" -Level Error
                Write-Message -Message "Error details: $($response.message)" -Level Error
                throw "API request failed with status code $statusCode."
            }
        }
    }
    catch {
        # Step 6: Handle and log errors
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to start table maintenance job. Error: $errorDetails" -Level Error
    }
}
