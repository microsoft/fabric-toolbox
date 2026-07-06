<#
.SYNOPSIS
    Retrieves the role assignments for a Microsoft Fabric deployment pipeline.

.DESCRIPTION
    The Get-FabricDeploymentPipelineRoleAssignment function retrieves the list of role assignments
    for a deployment pipeline via
    GET /deploymentPipelines/{deploymentPipelineId}/roleAssignments.

    By default the returned object(s) are decorated for the custom table view. Pass -Raw to return
    the untouched API response.

.PARAMETER DeploymentPipelineId
    The unique identifier of the deployment pipeline. Mandatory.

.PARAMETER Raw
    If specified, returns the untouched API response with no type decoration.

.EXAMPLE
    Get-FabricDeploymentPipelineRoleAssignment -DeploymentPipelineId "11111111-1111-1111-1111-111111111111"

    Lists the role assignments for the deployment pipeline.

.OUTPUTS
    System.Object
    Role assignment object(s) with all API-returned properties.

.NOTES
    - API Endpoint: GET /deploymentPipelines/{deploymentPipelineId}/roleAssignments
    - Requires: authentication via Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Get-FabricDeploymentPipelineRoleAssignment {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DeploymentPipelineId,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            # Validate authentication
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $segments = @('deploymentPipelines', $DeploymentPipelineId, 'roleAssignments')
            $apiEndpointURI = New-FabricAPIUri -Segments $segments
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No role assignments returned for deployment pipeline '$DeploymentPipelineId'." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.DeploymentPipelineRoleAssignment'
            $response
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve role assignments for deployment pipeline '$DeploymentPipelineId'. Error: $errorDetails" -Level Error
        }
    }
}
