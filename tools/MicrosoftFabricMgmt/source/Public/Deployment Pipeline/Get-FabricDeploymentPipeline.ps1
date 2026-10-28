<#
.SYNOPSIS
    Retrieves one or all Microsoft Fabric deployment pipelines.

.DESCRIPTION
    The Get-FabricDeploymentPipeline function retrieves deployment pipelines from the
    top-level Fabric `/deploymentPipelines` endpoint.

    When -DeploymentPipelineId is supplied it returns the single matching pipeline via
    GET /deploymentPipelines/{deploymentPipelineId}; otherwise it lists all deployment
    pipelines the user can access via GET /deploymentPipelines.

    By default each returned object is decorated for the custom table view. Pass -Raw to
    return the untouched API response.

.PARAMETER DeploymentPipelineId
    Optional. The unique identifier of a single deployment pipeline to retrieve. When
    omitted, all accessible deployment pipelines are returned.

.PARAMETER Raw
    If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
    Get-FabricDeploymentPipeline

    Lists all deployment pipelines the current user can access.

.EXAMPLE
    Get-FabricDeploymentPipeline -DeploymentPipelineId "12345678-1234-1234-1234-123456789012"

    Returns the single deployment pipeline with that ID.

.OUTPUTS
    System.Object
    Deployment pipeline object(s) with all API-returned properties.

.NOTES
    - API Endpoints:
        GET /deploymentPipelines
        GET /deploymentPipelines/{deploymentPipelineId}
    - Requires: authentication via Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Get-FabricDeploymentPipeline {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$DeploymentPipelineId,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            if ($DeploymentPipelineId) {
                $apiEndpointURI = New-FabricAPIUri -Resource 'deploymentPipelines' -ResourceId $DeploymentPipelineId
            }
            else {
                $apiEndpointURI = New-FabricAPIUri -Resource 'deploymentPipelines'
            }
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No deployment pipeline(s) returned." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.DeploymentPipeline'
            $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve deployment pipeline(s). Error: $errorDetails" -Level Error
        }
    }
}
