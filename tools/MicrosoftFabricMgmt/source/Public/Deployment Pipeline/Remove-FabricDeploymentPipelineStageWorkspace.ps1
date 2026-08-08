<#
.SYNOPSIS
    Unassigns the workspace from a stage of a Microsoft Fabric deployment pipeline.

.DESCRIPTION
    The Remove-FabricDeploymentPipelineStageWorkspace function unassigns the workspace from the
    specified stage of a deployment pipeline via
    POST /deploymentPipelines/{deploymentPipelineId}/stages/{stageId}/unassignWorkspace.

    No request body is sent. This operation fails if there is an active deployment operation.

.PARAMETER DeploymentPipelineId
    The unique identifier of the deployment pipeline. Mandatory.

.PARAMETER StageId
    The unique identifier of the deployment pipeline stage. Mandatory.

.EXAMPLE
    Remove-FabricDeploymentPipelineStageWorkspace -DeploymentPipelineId "11111111-1111-1111-1111-111111111111" -StageId "22222222-2222-2222-2222-222222222222"

    Unassigns the workspace from the specified deployment pipeline stage.

.OUTPUTS
    System.Object
    The API response for the unassign-workspace operation.

.NOTES
    - API Endpoint: POST /deploymentPipelines/{deploymentPipelineId}/stages/{stageId}/unassignWorkspace
    - Requires: authentication via Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Remove-FabricDeploymentPipelineStageWorkspace {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DeploymentPipelineId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$StageId
    )

    process {
        try {
            # Validate authentication
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $segments = @('deploymentPipelines', $DeploymentPipelineId, 'stages', $StageId, 'unassignWorkspace')
            $apiEndpointURI = New-FabricAPIUri -Segments $segments
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            if ($PSCmdlet.ShouldProcess("Workspace from stage '$StageId' of deployment pipeline '$DeploymentPipelineId'", "Unassign")) {
                # Make the API request (no body required)
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Post'
                }
                $response = Invoke-FabricAPIRequest @apiParams
                Write-FabricLog -Message "Workspace unassigned from stage '$StageId' of deployment pipeline '$DeploymentPipelineId'." -Level Host
                $response
            }
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to unassign workspace from stage '$StageId' of deployment pipeline '$DeploymentPipelineId'. Error: $errorDetails" -Level Error
        }
    }
}
