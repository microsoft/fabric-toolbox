<#
.SYNOPSIS
    Retrieves the supported items from a Microsoft Fabric deployment pipeline stage.

.DESCRIPTION
    The Get-FabricDeploymentPipelineStageItem function retrieves the supported items from
    the workspace assigned to a specified stage of a deployment pipeline via
    GET /deploymentPipelines/{deploymentPipelineId}/stages/{stageId}/items.

    By default each returned object is decorated for the custom table view. Pass -Raw to
    return the untouched API response.

.PARAMETER DeploymentPipelineId
    The unique identifier of the deployment pipeline. Mandatory.

.PARAMETER StageId
    The unique identifier of the stage whose items are retrieved. Mandatory.

.PARAMETER Raw
    If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
    Get-FabricDeploymentPipelineStageItem -DeploymentPipelineId "12345678-1234-1234-1234-123456789012" -StageId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Lists the supported items in the workspace assigned to the stage.

.OUTPUTS
    System.Object
    Deployment pipeline stage item object(s) with all API-returned properties.

.NOTES
    - API Endpoint: GET /deploymentPipelines/{deploymentPipelineId}/stages/{stageId}/items
    - Requires: authentication via Set-FabricApiHeaders / Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Get-FabricDeploymentPipelineStageItem {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$DeploymentPipelineId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$StageId,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $segments = @('deploymentPipelines', $DeploymentPipelineId, 'stages', $StageId, 'items')
            $apiEndpointURI = New-FabricAPIUri -Segments $segments
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No stage item(s) returned for stage '$StageId'." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.DeploymentPipelineStageItem'
            $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve stage item(s) for stage '$StageId'. Error: $errorDetails" -Level Error
        }
    }
}
