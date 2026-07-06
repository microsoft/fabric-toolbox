<#
.SYNOPSIS
    Removes a Microsoft Fabric deployment pipeline.

.DESCRIPTION
    The Remove-FabricDeploymentPipeline function deletes a deployment pipeline via DELETE
    to `/deploymentPipelines/{deploymentPipelineId}`.

    This is a destructive operation and supports -WhatIf and -Confirm. Because it has a
    high confirm impact, confirmation is requested by default unless suppressed with
    -Confirm:$false.

.PARAMETER DeploymentPipelineId
    The unique identifier of the deployment pipeline to remove. Accepts pipeline input by
    property name (e.g. from Get-FabricDeploymentPipeline).

.EXAMPLE
    Remove-FabricDeploymentPipeline -DeploymentPipelineId "12345678-1234-1234-1234-123456789012"

    Removes the specified deployment pipeline (prompts for confirmation).

.EXAMPLE
    Get-FabricDeploymentPipeline -DeploymentPipelineId "12345678-1234-1234-1234-123456789012" | Remove-FabricDeploymentPipeline -Confirm:$false

    Removes the deployment pipeline without prompting.

.OUTPUTS
    None.

.NOTES
    - API Endpoint: DELETE /deploymentPipelines/{deploymentPipelineId}
    - Requires: authentication via Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Remove-FabricDeploymentPipeline {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$DeploymentPipelineId
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $apiEndpointURI = New-FabricAPIUri -Resource 'deploymentPipelines' -ResourceId $DeploymentPipelineId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Delete'
            }

            if ($PSCmdlet.ShouldProcess($DeploymentPipelineId, "Remove Fabric deployment pipeline")) {
                $null = Invoke-FabricAPIRequest @apiParams
                Write-FabricLog -Message "Deployment pipeline '$DeploymentPipelineId' removed successfully!" -Level Host
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to remove deployment pipeline '$DeploymentPipelineId'. Error: $errorDetails" -Level Error
        }
    }
}
