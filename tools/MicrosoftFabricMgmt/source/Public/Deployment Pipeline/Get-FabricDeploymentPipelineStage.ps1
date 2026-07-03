<#
.SYNOPSIS
    Retrieves the stages of a Microsoft Fabric deployment pipeline.

.DESCRIPTION
    The Get-FabricDeploymentPipelineStage function retrieves the stages configured for a
    deployment pipeline.

    When -StageId is supplied it returns the single matching stage via
    GET /deploymentPipelines/{deploymentPipelineId}/stages/{stageId}; otherwise it lists
    all stages via GET /deploymentPipelines/{deploymentPipelineId}/stages.

    By default each returned object is decorated for the custom table view. Pass -Raw to
    return the untouched API response.

.PARAMETER DeploymentPipelineId
    The unique identifier of the deployment pipeline whose stages are retrieved. Mandatory.

.PARAMETER StageId
    Optional. The unique identifier of a single stage to retrieve.

.PARAMETER Raw
    If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
    Get-FabricDeploymentPipelineStage -DeploymentPipelineId "12345678-1234-1234-1234-123456789012"

    Lists all stages for the deployment pipeline.

.EXAMPLE
    Get-FabricDeploymentPipelineStage -DeploymentPipelineId "12345678-1234-1234-1234-123456789012" -StageId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Returns the single stage with that ID.

.OUTPUTS
    System.Object
    Deployment pipeline stage object(s) with all API-returned properties.

.NOTES
    - API Endpoints:
        GET /deploymentPipelines/{deploymentPipelineId}/stages
        GET /deploymentPipelines/{deploymentPipelineId}/stages/{stageId}
    - Requires: authentication via Set-FabricApiHeaders / Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Get-FabricDeploymentPipelineStage {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$DeploymentPipelineId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$StageId,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Build the segment list, appending StageId only when a single stage is requested.
            $segments = @('deploymentPipelines', $DeploymentPipelineId, 'stages')
            if ($StageId) { $segments += $StageId }
            $apiEndpointURI = New-FabricAPIUri -Segments $segments
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No stage(s) returned for deployment pipeline '$DeploymentPipelineId'." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.DeploymentPipelineStage'
            $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve stage(s) for deployment pipeline '$DeploymentPipelineId'. Error: $errorDetails" -Level Error
        }
    }
}
