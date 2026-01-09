<#
.SYNOPSIS
Updates Spark settings at the workspace scope.

.DESCRIPTION
Sends a PATCH request to the Fabric API to modify workspace-level Spark settings. You can enable automatic logging, configure high-concurrency notebook behavior, choose or customize a default compute pool, and set the default environment/runtime.

.PARAMETER WorkspaceId
Mandatory. The GUID of the workspace whose Spark settings will be updated.

.PARAMETER automaticLogEnabled
Optional. When $true, enables automatic Spark session logging in the workspace. When $false, disables auto logging.

.PARAMETER notebookInteractiveRunEnabled
Optional. Enables high-concurrency interactive notebook runs when set to $true.

.PARAMETER customizeComputeEnabled
Optional. When $true, allows customizing the compute pool settings for Spark jobs in this workspace.

.PARAMETER defaultPoolName
Optional. The name of the default compute pool. Must be provided together with defaultPoolType.

.PARAMETER defaultPoolType
Optional. The scope of the default compute pool. Allowed values are 'Workspace' or 'Capacity'. Must be provided together with defaultPoolName.

.PARAMETER starterPoolMaxNode
Optional. Maximum node count for the starter pool configuration.

.PARAMETER starterPoolMaxExecutors
Optional. Maximum executors for the starter pool configuration.

.PARAMETER EnvironmentName
Optional. The display name of the default Spark environment to use.

.PARAMETER EnvironmentRuntimeVersion
Optional. The runtime version identifier for the default Spark environment.

.EXAMPLE
Update-FabricSparkSettings -WorkspaceId $wId -automaticLogEnabled $true -defaultPoolName 'StarterPool' -defaultPoolType Workspace

Enables automatic logging and sets the default pool to 'StarterPool' scoped at the workspace.

.NOTES
- Requires `$FabricConfig` (BaseUrl, FabricHeaders).
- Calls `Test-TokenExpired` before invoking the API.

Author: Tiago Balabuch; Help updated by Copilot.

#>
function Update-FabricSparkSettings {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
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
        Write-FabricLog -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        $apiEndpointUrl = "{0}/workspaces/{1}/spark/settings" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId, $SparkSettingsId
        Write-FabricLog -Message "API Endpoint: $apiEndpointUrl" -Level Debug

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
                Write-FabricLog -Message "Both 'defaultPoolName' and 'defaultPoolType' must be provided together." -Level Error
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
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Step 4: Make the API request
        if ($PSCmdlet.ShouldProcess("Spark settings '$SparkSettingsName' in workspace '$WorkspaceId'", "Update")) {
            $restParams = @{
                Headers = $script:FabricAuthContext.FabricHeaders
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
                Write-FabricLog -Message "Unexpected response code: $statusCode from the API." -Level Error
                Write-FabricLog -Message "Error: $($response.message)" -Level Error
                Write-FabricLog -Message "Error Details: $($response.moreDetails)" -Level Error
                Write-FabricLog "Error Code: $($response.errorCode)" -Level Error
                return $null
            }

            # Step 6: Handle results
            Write-FabricLog -Message "Spark Custom Pool '$SparkSettingsName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Step 7: Handle and log errors
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update SparkSettings. Error: $errorDetails" -Level Error
    }
}
