<#
.SYNOPSIS
    Updates an existing Spark custom pool in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update an existing Spark custom pool
    in the specified workspace. It supports various parameters for Spark custom pool configuration.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Spark custom pool exists. This parameter is mandatory.

.PARAMETER SparkCustomPoolId
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
    Update-FabricSparkCustomPool -WorkspaceId "workspace-12345" -SparkCustomPoolId "pool-67890" -InstancePoolName "Updated Spark Pool" -NodeFamily "MemoryOptimized" -NodeSize "Large" -AutoScaleEnabled $true -AutoScaleMinNodeCount 1 -AutoScaleMaxNodeCount 10 -DynamicExecutorAllocationEnabled $true -DynamicExecutorAllocationMinExecutors 1 -DynamicExecutorAllocationMaxExecutors 10
    This example updates the Spark custom pool with ID "pool-67890" in the workspace with ID "workspace-12345" with a new name and configuration.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Update-FabricSparkCustomPool {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$SparkCustomPoolId,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [Alias('DisplayName')]
        [string]$InstancePoolName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('MemoryOptimized')]
        [string]$NodeFamily,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('Large', 'Medium', 'Small', 'XLarge', 'XXLarge')]
        [string]$NodeSize,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$AutoScaleEnabled,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [int]$AutoScaleMinNodeCount,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [int]$AutoScaleMaxNodeCount,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$DynamicExecutorAllocationEnabled,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [int]$DynamicExecutorAllocationMinExecutors,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [int]$DynamicExecutorAllocationMaxExecutors
    )
    process {
        try {
            # Validate that at least one update parameter is provided
            if (-not $InstancePoolName -and -not $NodeFamily -and -not $NodeSize -and
                $null -eq $AutoScaleEnabled -and $null -eq $AutoScaleMinNodeCount -and $null -eq $AutoScaleMaxNodeCount -and
                $null -eq $DynamicExecutorAllocationEnabled -and $null -eq $DynamicExecutorAllocationMinExecutors -and $null -eq $DynamicExecutorAllocationMaxExecutors) {
                Write-FabricLog -Message "At least one update parameter must be specified" -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI (Spark pools use a non-standard path)
        $apiEndpointURI = "{0}/workspaces/{1}/spark/pools/{2}" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId, $SparkCustomPoolId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body conditionally
        $body = @{}

        if ($InstancePoolName) {
            $body.name = $InstancePoolName
        }

        if ($NodeFamily) {
            $body.nodeFamily = $NodeFamily
        }

        if ($NodeSize) {
            $body.nodeSize = $NodeSize
        }

        if ($PSBoundParameters.ContainsKey('AutoScaleEnabled') -or $AutoScaleMinNodeCount -or $AutoScaleMaxNodeCount) {
            $body.autoScale = @{}
            if ($PSBoundParameters.ContainsKey('AutoScaleEnabled')) {
                $body.autoScale.enabled = $AutoScaleEnabled
            }
            if ($AutoScaleMinNodeCount) {
                $body.autoScale.minNodeCount = $AutoScaleMinNodeCount
            }
            if ($AutoScaleMaxNodeCount) {
                $body.autoScale.maxNodeCount = $AutoScaleMaxNodeCount
            }
        }

        if ($PSBoundParameters.ContainsKey('DynamicExecutorAllocationEnabled') -or $DynamicExecutorAllocationMinExecutors -or $DynamicExecutorAllocationMaxExecutors) {
            $body.dynamicExecutorAllocation = @{}
            if ($PSBoundParameters.ContainsKey('DynamicExecutorAllocationEnabled')) {
                $body.dynamicExecutorAllocation.enabled = $DynamicExecutorAllocationEnabled
            }
            if ($DynamicExecutorAllocationMinExecutors) {
                $body.dynamicExecutorAllocation.minExecutors = $DynamicExecutorAllocationMinExecutors
            }
            if ($DynamicExecutorAllocationMaxExecutors) {
                $body.dynamicExecutorAllocation.maxExecutors = $DynamicExecutorAllocationMaxExecutors
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("Spark Custom Pool '$InstancePoolName' in workspace '$WorkspaceId'", "Update")) {
            $apiParams = @{
                Headers = $script:FabricAuthContext.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Spark Custom Pool '$SparkCustomPoolName' updated successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update SparkCustomPool. Error: $errorDetails" -Level Error
        }
    }
}
