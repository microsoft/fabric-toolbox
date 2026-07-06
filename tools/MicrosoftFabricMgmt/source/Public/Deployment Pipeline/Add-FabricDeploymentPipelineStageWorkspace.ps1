<#
.SYNOPSIS
    Assigns a workspace to a stage of a Microsoft Fabric deployment pipeline.

.DESCRIPTION
    The Add-FabricDeploymentPipelineStageWorkspace function assigns the specified workspace
    to the specified stage of a deployment pipeline via
    POST /deploymentPipelines/{deploymentPipelineId}/stages/{stageId}/assignWorkspace.

    The request body contains the workspace id to assign. This operation fails if there is an
    active deployment operation, or if either the stage or the workspace is already assigned.

.PARAMETER DeploymentPipelineId
    The unique identifier of the deployment pipeline. Mandatory.

.PARAMETER StageId
    The unique identifier of the deployment pipeline stage. Mandatory.

.PARAMETER WorkspaceId
    The unique identifier of the workspace to assign to the stage. Mandatory.

.EXAMPLE
    Add-FabricDeploymentPipelineStageWorkspace -DeploymentPipelineId "11111111-1111-1111-1111-111111111111" -StageId "22222222-2222-2222-2222-222222222222" -WorkspaceId "33333333-3333-3333-3333-333333333333"

    Assigns the workspace to the specified deployment pipeline stage.

.OUTPUTS
    System.Object
    The API response for the assign-workspace operation.

.NOTES
    - API Endpoint: POST /deploymentPipelines/{deploymentPipelineId}/stages/{stageId}/assignWorkspace
    - Requires: authentication via Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Add-FabricDeploymentPipelineStageWorkspace {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DeploymentPipelineId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$StageId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId
    )

    process {
        try {
            # Validate authentication
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $segments = @('deploymentPipelines', $DeploymentPipelineId, 'stages', $StageId, 'assignWorkspace')
            $apiEndpointURI = New-FabricAPIUri -Segments $segments
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Construct the request body
            $body = @{
                workspaceId = $WorkspaceId
            }
            $bodyJson = Convert-FabricRequestBody -InputObject $body

            if ($PSCmdlet.ShouldProcess("Workspace '$WorkspaceId' to stage '$StageId' of deployment pipeline '$DeploymentPipelineId'", "Assign")) {
                # Make the API request
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Post'
                    Body    = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams
                Write-FabricLog -Message "Workspace '$WorkspaceId' assigned to stage '$StageId' of deployment pipeline '$DeploymentPipelineId'." -Level Host
                $response
            }
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to assign workspace '$WorkspaceId' to stage '$StageId' of deployment pipeline '$DeploymentPipelineId'. Error: $errorDetails" -Level Error
        }
    }
}
