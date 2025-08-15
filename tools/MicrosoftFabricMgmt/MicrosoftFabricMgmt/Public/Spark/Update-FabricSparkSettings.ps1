<#
.SYNOPSIS
    Updates an existing Spark custom pool in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update an existing Spark custom pool 
    in the specified workspace. It supports various parameters for Spark custom pool configuration.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Spark custom pool exists. This parameter is mandatory.

.PARAMETER SparkSettingsId
    The unique identifier of the Spark custom pool to be updated. This parameter is mandatory.

.PARAMETER InstancePoolName
    The new name of the Spark custom pool. This parameter is mandatory.

.PARAMETER NodeFamily
    The family of nodes to be used in the Spark custom pool. This parameter is mandatory and must be 'MemoryOptimized'.

.PARAMETER NodeSize
    The size of the nodes to be used in the Spark custom pool. This parameter is mandatory and must be one of 'Large', 'Medium', 'Small', 'XLarge', 'XXLarge'.

.PARAMETER AutoScaleEnabled
    Specifies whether auto-scaling is enabled for the Spark custom pool. This parameter is mandatory.

.PARAMETER AutoScaleMinNodeCount
    The minimum number of nodes for auto-scaling in the Spark custom pool. This parameter is mandatory.

.PARAMETER AutoScaleMaxNodeCount
    The maximum number of nodes for auto-scaling in the Spark custom pool. This parameter is mandatory.

.PARAMETER DynamicExecutorAllocationEnabled
    Specifies whether dynamic executor allocation is enabled for the Spark custom pool. This parameter is mandatory.

.PARAMETER DynamicExecutorAllocationMinExecutors
    The minimum number of executors for dynamic executor allocation in the Spark custom pool. This parameter is mandatory.

.PARAMETER DynamicExecutorAllocationMaxExecutors
    The maximum number of executors for dynamic executor allocation in the Spark custom pool. This parameter is mandatory.

.EXAMPLE
    Update-FabricSparkSettings -WorkspaceId "workspace-12345" -SparkSettingsId "pool-67890" -InstancePoolName "Updated Spark Pool" -NodeFamily "MemoryOptimized" -NodeSize "Large" -AutoScaleEnabled $true -AutoScaleMinNodeCount 1 -AutoScaleMaxNodeCount 10 -DynamicExecutorAllocationEnabled $true -DynamicExecutorAllocationMinExecutors 1 -DynamicExecutorAllocationMaxExecutors 10
    This example updates the Spark custom pool with ID "pool-67890" in the workspace with ID "workspace-12345" with a new name and configuration.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
    
#>
function Update-FabricSparkSettings {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,   
        

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$automaticLogEnabled,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$notebookInteractiveRunEnabled,
        
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$customizeComputeEnabled,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$defaultPoolName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('Workspace', 'Capacity')]
        [string]$defaultPoolType,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [int]$starterPoolMaxNode,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [int]$starterPoolMaxExecutors,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentRuntimeVersion
    )

    try {
        # Step 1: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        $apiEndpointUrl = "{0}/workspaces/{1}/spark/settings" -f $FabricConfig.BaseUrl, $WorkspaceId, $SparkSettingsId
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Step 3: Construct the request body
        # Construct the request body with optional properties

        $body = @{}
        
        if ($PSBoundParameters.ContainsKey('automaticLogEnabled')) {
            $body.automaticLog = @{
                enabled = $automaticLogEnabled
            }
        }

        if ($PSBoundParameters.ContainsKey('notebookInteractiveRunEnabled')) {
            $body.highConcurrency = @{
                notebookInteractiveRunEnabled = $notebookInteractiveRunEnabled
            }
        }

        if ($PSBoundParameters.ContainsKey('customizeComputeEnabled') ) {
            $body.pool = @{
                customizeComputeEnabled = $customizeComputeEnabled
            }
        }
        if ($PSBoundParameters.ContainsKey('defaultPoolName') -or $PSBoundParameters.ContainsKey('defaultPoolType')) {
            if ($PSBoundParameters.ContainsKey('defaultPoolName') -and $PSBoundParameters.ContainsKey('defaultPoolType')) {
            $body.pool = @{
                defaultPool = @{
                name = $defaultPoolName
                type = $defaultPoolType
                }
            }
            } else {
                Write-Message -Message "Both 'defaultPoolName' and 'defaultPoolType' must be provided together." -Level Error
                throw 
            }
        }
        
        if ($PSBoundParameters.ContainsKey('EnvironmentName') -or $PSBoundParameters.ContainsKey('EnvironmentRuntimeVersion')) {
            $body.environment = @{
                name = $EnvironmentName
            }
        }
        if ($PSBoundParameters.ContainsKey('EnvironmentRuntimeVersion')) {
            $body.environment = @{
                runtimeVersion = $EnvironmentRuntimeVersion
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Step 4: Make the API request
        $restParams = @{
            Headers = $FabricConfig.FabricHeaders
            Uri = $apiEndpointUrl
            Method = 'Patch'
            Body = $bodyJson
            ContentType = 'application/json'
            ErrorAction = 'Stop'
            SkipHttpErrorCheck = $true
            StatusCodeVariable = 'statusCode'
        }
        $response = Invoke-RestMethod @restParams

        # Step 5: Validate the response code
        if ($statusCode -ne 200) {
            Write-Message -Message "Unexpected response code: $statusCode from the API." -Level Error
            Write-Message -Message "Error: $($response.message)" -Level Error
            Write-Message -Message "Error Details: $($response.moreDetails)" -Level Error
            Write-Message "Error Code: $($response.errorCode)" -Level Error
            return $null
        }

        # Step 6: Handle results
        Write-Message -Message "Spark Custom Pool '$SparkSettingsName' updated successfully!" -Level Info
        return $response
    }
    catch {
        # Step 7: Handle and log errors
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update SparkSettings. Error: $errorDetails" -Level Error
    }
}
