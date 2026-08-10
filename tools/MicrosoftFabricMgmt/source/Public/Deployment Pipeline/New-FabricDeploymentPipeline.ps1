<#
.SYNOPSIS
    Creates a new Microsoft Fabric deployment pipeline.

.DESCRIPTION
    The New-FabricDeploymentPipeline function creates a deployment pipeline via POST to the
    top-level Fabric `/deploymentPipelines` endpoint.

    The display name is required; a description and an array of stages may optionally be
    supplied. Each stage is a hashtable following the DeploymentPipelineStageRequest shape,
    e.g. @{ displayName = 'Development'; description = 'Dev stage'; isPublic = $false }.

    The full created deployment pipeline object is returned and decorated for the custom
    table view. Pass -Raw to return the untouched API response.

.PARAMETER DeploymentPipelineName
    The display name of the deployment pipeline to create. Maps to the request body
    property `displayName`.

.PARAMETER Description
    Optional description for the deployment pipeline.

.PARAMETER Stages
    Optional array of stage definitions. Each element is a hashtable following the
    DeploymentPipelineStageRequest schema (displayName, description, isPublic), e.g.
    @(@{ displayName = 'Development'; isPublic = $false }, @{ displayName = 'Production'; isPublic = $true }).

.PARAMETER Raw
    If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
    New-FabricDeploymentPipeline -DeploymentPipelineName 'Analytics Release'

    Creates a deployment pipeline named 'Analytics Release'.

.EXAMPLE
    $stages = @(
        @{ displayName = 'Development'; description = 'Dev'; isPublic = $false },
        @{ displayName = 'Production';  description = 'Prod'; isPublic = $true }
    )
    New-FabricDeploymentPipeline -DeploymentPipelineName 'Analytics Release' -Description 'Release pipeline' -Stages $stages

    Creates a deployment pipeline with two stages.

.OUTPUTS
    System.Object
    The created deployment pipeline object with all API-returned properties.

.NOTES
    - API Endpoint: POST /deploymentPipelines
    - Requires: authentication via Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function New-FabricDeploymentPipeline {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DeploymentPipelineName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$Description,

        [Parameter(Mandatory = $false)]
        [hashtable[]]$Stages,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $apiEndpointURI = New-FabricAPIUri -Resource 'deploymentPipelines'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $body = @{
                displayName = $DeploymentPipelineName
            }
            if ($Description) { $body.description = $Description }
            if ($Stages) { $body.stages = $Stages }

            $bodyJson = $body | ConvertTo-Json -Depth 10
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }

            if ($PSCmdlet.ShouldProcess($DeploymentPipelineName, "Create Fabric deployment pipeline")) {
                $response = Invoke-FabricAPIRequest @apiParams

                if (-not $response) {
                    Write-FabricLog -Message "No response returned after creating deployment pipeline '$DeploymentPipelineName'." -Level Warning
                    return $null
                }

                if ($Raw) {
                    return $response
                }

                $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.DeploymentPipeline'
                Write-FabricLog -Message "Deployment pipeline '$DeploymentPipelineName' created successfully!" -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to create deployment pipeline '$DeploymentPipelineName'. Error: $errorDetails" -Level Error
        }
    }
}
