<#
.SYNOPSIS
    Removes a role assignment from a Microsoft Fabric deployment pipeline.

.DESCRIPTION
    The Remove-FabricDeploymentPipelineRoleAssignment function deletes the role assignment for the
    specified principal from a deployment pipeline via
    DELETE /deploymentPipelines/{deploymentPipelineId}/roleAssignments/{principalId}.

.PARAMETER DeploymentPipelineId
    The unique identifier of the deployment pipeline. Mandatory.

.PARAMETER PrincipalId
    The unique identifier of the principal whose role assignment is removed. Mandatory.

.EXAMPLE
    Remove-FabricDeploymentPipelineRoleAssignment -DeploymentPipelineId "11111111-1111-1111-1111-111111111111" -PrincipalId "22222222-2222-2222-2222-222222222222"

    Removes the role assignment for the specified principal from the deployment pipeline.

.OUTPUTS
    System.Object
    The API response for the delete operation.

.NOTES
    - API Endpoint: DELETE /deploymentPipelines/{deploymentPipelineId}/roleAssignments/{principalId}
    - Requires: authentication via Set-FabricApiHeaders / Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Remove-FabricDeploymentPipelineRoleAssignment {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DeploymentPipelineId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$PrincipalId
    )

    process {
        try {
            # Validate authentication
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $segments = @('deploymentPipelines', $DeploymentPipelineId, 'roleAssignments', $PrincipalId)
            $apiEndpointURI = New-FabricAPIUri -Segments $segments
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            if ($PSCmdlet.ShouldProcess("Role assignment for principal '$PrincipalId' on deployment pipeline '$DeploymentPipelineId'", "Delete")) {
                # Make the API request
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Delete'
                }
                $response = Invoke-FabricAPIRequest @apiParams
                Write-FabricLog -Message "Role assignment for principal '$PrincipalId' removed from deployment pipeline '$DeploymentPipelineId'." -Level Host
                $response
            }
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to remove role assignment for principal '$PrincipalId' on deployment pipeline '$DeploymentPipelineId'. Error: $errorDetails" -Level Error
        }
    }
}
