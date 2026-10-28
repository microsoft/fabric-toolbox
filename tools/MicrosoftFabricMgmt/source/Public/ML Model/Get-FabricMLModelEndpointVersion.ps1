<#
.SYNOPSIS
    Retrieves endpoint version(s) of a Microsoft Fabric ML Model.

.DESCRIPTION
    The Get-FabricMLModelEndpointVersion function retrieves machine learning model endpoint
    versions.

    When -VersionName is supplied it returns the single matching version via
    /workspaces/{workspaceId}/mlmodels/{modelId}/endpoint/versions/{name}; otherwise it
    lists all versions via
    /workspaces/{workspaceId}/mlmodels/{modelId}/endpoint/versions.

    By default each returned object is enriched with the originating WorkspaceId (stamped
    from the parameter) and a resolved WorkspaceName, and decorated for the custom table
    view. Pass -Raw to return the untouched API response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the ML Model. Mandatory.

.PARAMETER MLModelId
    The unique identifier of the ML Model whose endpoint versions are retrieved. Mandatory.

.PARAMETER VersionName
    Optional. The name of a single endpoint version to retrieve.

.PARAMETER Raw
    If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
    Get-FabricMLModelEndpointVersion -WorkspaceId $ws -MLModelId $model

    Lists all endpoint versions for the ML Model, enriched with WorkspaceName.

.EXAMPLE
    Get-FabricMLModelEndpointVersion -WorkspaceId $ws -MLModelId $model -VersionName '3'

    Returns the single endpoint version named '3'.

.OUTPUTS
    System.Object
    Endpoint version object(s) with all API-returned properties plus WorkspaceName when enriched.

.NOTES
    - API Endpoints:
        GET /workspaces/{workspaceId}/mlmodels/{modelId}/endpoint/versions
        GET /workspaces/{workspaceId}/mlmodels/{modelId}/endpoint/versions/{name}
    - Requires: authentication via Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Get-FabricMLModelEndpointVersion {
    [CmdletBinding()]
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

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Build the segment list, appending VersionName only when a single version is requested.
            $segments = @('workspaces', $WorkspaceId, 'mlmodels', $MLModelId, 'endpoint', 'versions')
            if ($VersionName) { $segments += $VersionName }
            $apiEndpointURI = New-FabricAPIUri -Segments $segments
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No endpoint versions returned for ML Model '$MLModelId'." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            # Resolve the workspace display name once for all returned versions.
            $workspaceName = $WorkspaceId
            try {
                $workspaceName = Resolve-FabricWorkspaceName -WorkspaceId $WorkspaceId
            }
            catch {
                Write-FabricLog -Message "Failed to resolve workspace name for ID '$WorkspaceId': $($_.Exception.Message)" -Level Debug
            }

            foreach ($version in $response) {
                $version | Add-Member -NotePropertyName 'workspaceId'   -NotePropertyValue $WorkspaceId   -Force
                $version | Add-Member -NotePropertyName 'WorkspaceName' -NotePropertyValue $workspaceName -Force
            }

            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.MLModelEndpointVersion'
            $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve endpoint versions for ML Model '$MLModelId'. Error: $errorDetails" -Level Error
        }
    }
}
