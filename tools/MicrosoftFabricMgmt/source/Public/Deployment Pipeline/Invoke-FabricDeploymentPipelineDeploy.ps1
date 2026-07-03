<#
.SYNOPSIS
    Deploys content between stages of a Microsoft Fabric deployment pipeline.

.DESCRIPTION
    The Invoke-FabricDeploymentPipelineDeploy function deploys items from the source stage of a
    deployment pipeline to the target stage via
    POST /deploymentPipelines/{deploymentPipelineId}/deploy.

    The request body is built from the supplied fields (sourceStageId, targetStageId, items, note,
    options). When -Items is omitted, all supported items in the source stage are deployed.

    This is a long-running operation: the API responds with a 202 and operation/location tracking
    data used to monitor the deployment. The response is returned as-is; -Raw is accepted for
    interface uniformity.

.PARAMETER DeploymentPipelineId
    The unique identifier of the deployment pipeline. Mandatory.

.PARAMETER SourceStageId
    The unique identifier of the source stage to deploy from. Mandatory.

.PARAMETER TargetStageId
    Optional. The unique identifier of the target stage to deploy to.

.PARAMETER Items
    Optional. An array of item objects to selectively deploy, each with a sourceItemId and itemType,
    e.g. @(@{ sourceItemId = '...'; itemType = 'Report' }). When omitted, all items are deployed.

.PARAMETER Note
    Optional. A free-text note (max 1024 characters) describing the deployment.

.PARAMETER Options
    Optional. A hashtable of deployment options passed through verbatim in the request body,
    e.g. @{ allowCrossRegionDeployment = $true }.

.PARAMETER Raw
    Accepted for interface uniformity. The response is returned as-is regardless.

.EXAMPLE
    Invoke-FabricDeploymentPipelineDeploy -DeploymentPipelineId "11111111-1111-1111-1111-111111111111" -SourceStageId "22222222-2222-2222-2222-222222222222" -TargetStageId "33333333-3333-3333-3333-333333333333"

    Deploys all supported items from the source stage to the target stage.

.EXAMPLE
    $items = @(@{ sourceItemId = '44444444-4444-4444-4444-444444444444'; itemType = 'Report' })
    Invoke-FabricDeploymentPipelineDeploy -DeploymentPipelineId $pipe -SourceStageId $src -TargetStageId $tgt -Items $items -Note 'Selective deploy'

    Selectively deploys the specified report with a note.

.OUTPUTS
    System.Object
    The API response for the deploy operation (long-running operation tracking data).

.NOTES
    - API Endpoint: POST /deploymentPipelines/{deploymentPipelineId}/deploy
    - Requires: authentication via Set-FabricApiHeaders / Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Invoke-FabricDeploymentPipelineDeploy {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DeploymentPipelineId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SourceStageId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$TargetStageId,

        [Parameter(Mandatory = $false)]
        [object[]]$Items,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$Note,

        [Parameter(Mandatory = $false)]
        [hashtable]$Options,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            # Validate authentication
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $segments = @('deploymentPipelines', $DeploymentPipelineId, 'deploy')
            $apiEndpointURI = New-FabricAPIUri -Segments $segments
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Construct the request body from supplied fields only
            $body = @{
                sourceStageId = $SourceStageId
            }
            if ($TargetStageId) { $body.targetStageId = $TargetStageId }
            if ($Items) { $body.items = $Items }
            if ($Note) { $body.note = $Note }
            if ($Options) { $body.options = $Options }

            $bodyJson = Convert-FabricRequestBody -InputObject $body

            if ($PSCmdlet.ShouldProcess("Deployment pipeline '$DeploymentPipelineId' from stage '$SourceStageId'", "Deploy")) {
                # Make the API request
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Post'
                    Body    = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams

                if ($Raw) {
                    return $response
                }

                Write-FabricLog -Message "Deployment triggered for deployment pipeline '$DeploymentPipelineId' from stage '$SourceStageId'." -Level Host
                $response
            }
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to deploy deployment pipeline '$DeploymentPipelineId'. Error: $errorDetails" -Level Error
        }
    }
}
