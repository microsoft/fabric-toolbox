<#
.SYNOPSIS
    Updates a stage of a Microsoft Fabric deployment pipeline.

.DESCRIPTION
    The Update-FabricDeploymentPipelineStage function updates the properties of a single
    deployment pipeline stage via PATCH to
    `/deploymentPipelines/{deploymentPipelineId}/stages/{stageId}`.

    Only the supplied fields (display name, description and/or public visibility) are
    included in the request body. IsPublic is only sent when explicitly provided so that a
    value of $false is honoured. The full updated stage object is returned and decorated
    for the custom table view. Pass -Raw to return the untouched API response.

.PARAMETER DeploymentPipelineId
    The unique identifier of the deployment pipeline containing the stage. Mandatory.

.PARAMETER StageId
    The unique identifier of the stage to update. Mandatory.

.PARAMETER DisplayName
    Optional new display name for the stage.

.PARAMETER Description
    Optional new description for the stage.

.PARAMETER IsPublic
    Optional boolean controlling whether the stage is public. Only sent when explicitly
    supplied.

.PARAMETER Raw
    If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
    Update-FabricDeploymentPipelineStage -DeploymentPipelineId "12345678-1234-1234-1234-123456789012" -StageId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -DisplayName 'Production'

    Renames the stage to 'Production'.

.EXAMPLE
    Update-FabricDeploymentPipelineStage -DeploymentPipelineId "12345678-1234-1234-1234-123456789012" -StageId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -IsPublic $false

    Marks the stage as not public.

.OUTPUTS
    System.Object
    The updated deployment pipeline stage object with all API-returned properties.

.NOTES
    - API Endpoint: PATCH /deploymentPipelines/{deploymentPipelineId}/stages/{stageId}
    - Requires: authentication via Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Update-FabricDeploymentPipelineStage {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$DeploymentPipelineId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$StageId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DisplayName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$Description,

        [Parameter(Mandatory = $false)]
        [bool]$IsPublic,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $segments = @('deploymentPipelines', $DeploymentPipelineId, 'stages', $StageId)
            $apiEndpointURI = New-FabricAPIUri -Segments $segments
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Only include supplied fields in the request body. IsPublic is checked via
            # $PSBoundParameters so an explicit $false is sent while an omitted switch is not.
            $body = @{}
            if ($DisplayName) { $body.displayName = $DisplayName }
            if ($Description) { $body.description = $Description }
            if ($PSBoundParameters.ContainsKey('IsPublic')) { $body.isPublic = $IsPublic }

            $bodyJson = $body | ConvertTo-Json -Depth 10
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Patch'
                Body    = $bodyJson
            }

            if ($PSCmdlet.ShouldProcess($StageId, "Update Fabric deployment pipeline stage")) {
                $response = Invoke-FabricAPIRequest @apiParams

                if (-not $response) {
                    Write-FabricLog -Message "No response returned after updating stage '$StageId'." -Level Warning
                    return $null
                }

                if ($Raw) {
                    return $response
                }

                $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.DeploymentPipelineStage'
                Write-FabricLog -Message "Deployment pipeline stage '$StageId' updated successfully!" -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update stage '$StageId'. Error: $errorDetails" -Level Error
        }
    }
}
