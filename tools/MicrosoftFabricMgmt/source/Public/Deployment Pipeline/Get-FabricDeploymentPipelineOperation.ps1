<#
.SYNOPSIS
    Retrieves deploy operations for a Microsoft Fabric deployment pipeline.

.DESCRIPTION
    The Get-FabricDeploymentPipelineOperation function retrieves deploy operations performed on a
    deployment pipeline.

    When -OperationId is supplied it returns the single matching operation (including the deployment
    execution plan) via /deploymentPipelines/{deploymentPipelineId}/operations/{operationId};
    otherwise it lists the up-to-20 most recent operations via
    /deploymentPipelines/{deploymentPipelineId}/operations.

    By default the returned object(s) are decorated for the custom table view. Pass -Raw to return
    the untouched API response.

.PARAMETER DeploymentPipelineId
    The unique identifier of the deployment pipeline. Mandatory.

.PARAMETER OperationId
    Optional. The unique identifier of a single deploy operation to retrieve.

.PARAMETER Raw
    If specified, returns the untouched API response with no type decoration.

.EXAMPLE
    Get-FabricDeploymentPipelineOperation -DeploymentPipelineId "11111111-1111-1111-1111-111111111111"

    Lists the most recent deploy operations for the deployment pipeline.

.EXAMPLE
    Get-FabricDeploymentPipelineOperation -DeploymentPipelineId "11111111-1111-1111-1111-111111111111" -OperationId "22222222-2222-2222-2222-222222222222"

    Returns the single deploy operation with that ID, including its execution plan.

.OUTPUTS
    System.Object
    Deploy operation object(s) with all API-returned properties.

.NOTES
    - API Endpoints:
        GET /deploymentPipelines/{deploymentPipelineId}/operations
        GET /deploymentPipelines/{deploymentPipelineId}/operations/{operationId}
    - Requires: authentication via Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Get-FabricDeploymentPipelineOperation {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DeploymentPipelineId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$OperationId,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            # Validate authentication
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Build the segment list, appending OperationId only when a single operation is requested.
            $segments = @('deploymentPipelines', $DeploymentPipelineId, 'operations')
            if ($OperationId) { $segments += $OperationId }
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
                Write-FabricLog -Message "No operations returned for deployment pipeline '$DeploymentPipelineId'." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.DeploymentPipelineOperation'
            $response
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve operations for deployment pipeline '$DeploymentPipelineId'. Error: $errorDetails" -Level Error
        }
    }
}
