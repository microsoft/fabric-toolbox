<#
.SYNOPSIS
    Updates an existing Microsoft Fabric deployment pipeline.

.DESCRIPTION
    The Update-FabricDeploymentPipeline function updates the properties of a deployment
    pipeline via PATCH to `/deploymentPipelines/{deploymentPipelineId}`.

    Only the supplied fields (display name and/or description) are included in the request
    body. The full updated deployment pipeline object is returned and decorated for the
    custom table view. Pass -Raw to return the untouched API response.

.PARAMETER DeploymentPipelineId
    The unique identifier of the deployment pipeline to update. Accepts pipeline input by
    property name (e.g. from Get-FabricDeploymentPipeline).

.PARAMETER DeploymentPipelineName
    Optional new display name for the deployment pipeline. Maps to the request body
    property `displayName`.

.PARAMETER Description
    Optional new description for the deployment pipeline.

.PARAMETER Raw
    If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
    Update-FabricDeploymentPipeline -DeploymentPipelineId "12345678-1234-1234-1234-123456789012" -DeploymentPipelineName 'Renamed Pipeline'

    Renames the deployment pipeline.

.EXAMPLE
    Get-FabricDeploymentPipeline -DeploymentPipelineId "12345678-1234-1234-1234-123456789012" | Update-FabricDeploymentPipeline -Description 'Updated description'

    Updates the description of the deployment pipeline.

.OUTPUTS
    System.Object
    The updated deployment pipeline object with all API-returned properties.

.NOTES
    - API Endpoint: PATCH /deploymentPipelines/{deploymentPipelineId}
    - Requires: authentication via Set-FabricApiHeaders / Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Update-FabricDeploymentPipeline {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$DeploymentPipelineId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DeploymentPipelineName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$Description,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $apiEndpointURI = New-FabricAPIUri -Resource 'deploymentPipelines' -ResourceId $DeploymentPipelineId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Only include supplied fields in the request body.
            $body = @{}
            if ($DeploymentPipelineName) { $body.displayName = $DeploymentPipelineName }
            if ($Description) { $body.description = $Description }

            $bodyJson = $body | ConvertTo-Json -Depth 10
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Patch'
                Body    = $bodyJson
            }

            if ($PSCmdlet.ShouldProcess($DeploymentPipelineId, "Update Fabric deployment pipeline")) {
                $response = Invoke-FabricAPIRequest @apiParams

                if (-not $response) {
                    Write-FabricLog -Message "No response returned after updating deployment pipeline '$DeploymentPipelineId'." -Level Warning
                    return $null
                }

                if ($Raw) {
                    return $response
                }

                $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.DeploymentPipeline'
                Write-FabricLog -Message "Deployment pipeline '$DeploymentPipelineId' updated successfully!" -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update deployment pipeline '$DeploymentPipelineId'. Error: $errorDetails" -Level Error
        }
    }
}
