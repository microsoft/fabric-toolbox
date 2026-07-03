<#
.SYNOPSIS
    Activates a specific endpoint version of a Microsoft Fabric ML Model.

.DESCRIPTION
    The Enable-FabricMLModelEndpointVersion function activates a machine learning model
    endpoint version so it can serve scoring requests, via POST to
    /workspaces/{workspaceId}/mlmodels/{modelId}/endpoint/versions/{name}/activate.

    This is a long-running operation; the response is returned as-is.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the ML Model. Mandatory.

.PARAMETER MLModelId
    The unique identifier of the ML Model whose endpoint version is activated. Mandatory.

.PARAMETER VersionName
    The name of the endpoint version to activate. Mandatory.

.EXAMPLE
    Enable-FabricMLModelEndpointVersion -WorkspaceId $ws -MLModelId $model -VersionName '3'

    Activates version '3' of the ML Model endpoint.

.OUTPUTS
    System.Object
    The API response for the activation operation (long-running operation tracking data).

.NOTES
    - API Endpoint: POST /workspaces/{workspaceId}/mlmodels/{modelId}/endpoint/versions/{name}/activate
    - Requires: authentication via Set-FabricApiHeaders / Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Enable-FabricMLModelEndpointVersion {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MLModelId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$VersionName
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $segments = @('workspaces', $WorkspaceId, 'mlmodels', $MLModelId, 'endpoint', 'versions', $VersionName, 'activate')
            $apiEndpointURI = New-FabricAPIUri -Segments $segments
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
            }

            if ($PSCmdlet.ShouldProcess($VersionName, "Activate Fabric ML Model endpoint version")) {
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "Endpoint version '$VersionName' for ML Model '$MLModelId' activation requested." -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to activate endpoint version '$VersionName' for ML Model '$MLModelId'. Error: $errorDetails" -Level Error
        }
    }
}
