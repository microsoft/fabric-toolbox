<#
.SYNOPSIS
Updates Spark settings for a workspace (workspace-scope variant).

.DESCRIPTION
Patches workspace-level Spark configuration including automatic logging, interactive notebook concurrency, default compute pool settings, and environment/runtime defaults.

.PARAMETER WorkspaceId
Mandatory. The GUID of the workspace whose Spark settings will be updated.

.PARAMETER automaticLogEnabled
Optional. When $true, enables automatic logging of Spark sessions.

.PARAMETER notebookInteractiveRunEnabled
Optional. Enables interactive high-concurrency notebook execution when set to $true.

.PARAMETER customizeComputeEnabled
Optional. Allows customization of compute pool behavior for Spark jobs.

.PARAMETER defaultPoolName
Optional. Name of the default compute pool, provided together with defaultPoolType.

.PARAMETER defaultPoolType
Optional. Scope of the default compute pool: 'Workspace' or 'Capacity'. Must accompany defaultPoolName.

.PARAMETER starterPoolMaxNode
Optional. Maximum node count for the starter pool.

.PARAMETER starterPoolMaxExecutors
Optional. Maximum executor count for the starter pool.

.PARAMETER EnvironmentName
Optional. Friendly name of the default Spark environment.

.PARAMETER EnvironmentRuntimeVersion
Optional. Runtime version identifier for the environment.

.EXAMPLE
Update-FabricSparkWorkspaceSettings -WorkspaceId $wId -automaticLogEnabled $true -notebookInteractiveRunEnabled $true

Enables automatic logging and interactive notebook concurrency for the workspace.

.NOTES
- Requires `$FabricConfig` (BaseUrl, FabricHeaders).
- Calls `Test-TokenExpired` before invoking the API.

Author: Tiago Balabuch; Help updated by Copilot.

#>
function Update-FabricSparkWorkspaceSettings {
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
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/spark/settings" -f $FabricConfig.BaseUrl, $WorkspaceId, $SparkSettingsId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
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
            }
            else {
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

        # Make the API request
        if ($PSCmdlet.ShouldProcess("Spark Workspace settings '$SparkSettingsName' in workspace '$WorkspaceId'", "Update")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Spark Workspace Pool '$SparkSettingsName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update SparkSettings. Error: $errorDetails" -Level Error
    }
}
