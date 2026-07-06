<#
.SYNOPSIS
    Deactivates endpoint version(s) of a Microsoft Fabric ML Model.

.DESCRIPTION
    The Disable-FabricMLModelEndpointVersion function deactivates machine learning model
    endpoint versions.

    When -VersionName is supplied it deactivates that single version via POST to
    /workspaces/{workspaceId}/mlmodels/{modelId}/endpoint/versions/{name}/deactivate.

    When -All is supplied instead it deactivates every version for the model via POST to
    /workspaces/{workspaceId}/mlmodels/{modelId}/endpoint/versions/deactivateAll.

    Exactly one of -VersionName or -All must be supplied.

    These are long-running operations; the response is returned as-is.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the ML Model. Mandatory.

.PARAMETER MLModelId
    The unique identifier of the ML Model whose endpoint version(s) are deactivated. Mandatory.

.PARAMETER VersionName
    The name of a single endpoint version to deactivate. Mutually exclusive with -All.

.PARAMETER All
    Deactivate all endpoint versions for the model. Mutually exclusive with -VersionName.

.EXAMPLE
    Disable-FabricMLModelEndpointVersion -WorkspaceId $ws -MLModelId $model -VersionName '3'

    Deactivates version '3' of the ML Model endpoint.

.EXAMPLE
    Disable-FabricMLModelEndpointVersion -WorkspaceId $ws -MLModelId $model -All

    Deactivates all endpoint versions for the ML Model.

.OUTPUTS
    System.Object
    The API response for the deactivation operation (long-running operation tracking data).

.NOTES
    - API Endpoints:
        POST /workspaces/{workspaceId}/mlmodels/{modelId}/endpoint/versions/{name}/deactivate
        POST /workspaces/{workspaceId}/mlmodels/{modelId}/endpoint/versions/deactivateAll
    - Requires: authentication via Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Disable-FabricMLModelEndpointVersion {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MLModelId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$VersionName,

        [Parameter(Mandatory = $false)]
        [switch]$All
    )

    process {
        # Enforce that exactly one of -VersionName or -All is supplied. This validation is
        # intentionally outside the try/catch so the error propagates to the caller instead
        # of being logged and swallowed.
        if ($VersionName -and $All) {
            throw "Specify only one of -VersionName or -All, not both."
        }
        if (-not $VersionName -and -not $All) {
            throw "You must specify either -VersionName or -All."
        }

        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            if ($All) {
                $segments = @('workspaces', $WorkspaceId, 'mlmodels', $MLModelId, 'endpoint', 'versions', 'deactivateAll')
                $target = "all versions"
            }
            else {
                $segments = @('workspaces', $WorkspaceId, 'mlmodels', $MLModelId, 'endpoint', 'versions', $VersionName, 'deactivate')
                $target = "version '$VersionName'"
            }
            $apiEndpointURI = New-FabricAPIUri -Segments $segments
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
            }

            if ($PSCmdlet.ShouldProcess($MLModelId, "Deactivate Fabric ML Model endpoint $target")) {
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "Deactivation of $target for ML Model '$MLModelId' requested." -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to deactivate endpoint version(s) for ML Model '$MLModelId'. Error: $errorDetails" -Level Error
        }
    }
}
