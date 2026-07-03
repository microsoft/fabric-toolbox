<#
.SYNOPSIS
    Retrieves the endpoint of a Microsoft Fabric ML Model.

.DESCRIPTION
    The Get-FabricMLModelEndpoint function retrieves the serving endpoint for a specific
    machine learning model via GET to
    /workspaces/{workspaceId}/mlmodels/{modelId}/endpoint.

    By default the returned object is enriched with the originating WorkspaceId (stamped
    from the parameter) and a resolved WorkspaceName, and decorated for the custom table
    view. Pass -Raw to return the untouched API response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the ML Model. Mandatory.

.PARAMETER MLModelId
    The unique identifier of the ML Model whose endpoint is retrieved. Mandatory.

.PARAMETER Raw
    If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
    Get-FabricMLModelEndpoint -WorkspaceId "12345678-1234-1234-1234-123456789012" -MLModelId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Retrieves the ML Model endpoint, enriched with WorkspaceName.

.OUTPUTS
    System.Object
    The ML Model endpoint object with all API-returned properties plus WorkspaceName when enriched.

.NOTES
    - API Endpoint: GET /workspaces/{workspaceId}/mlmodels/{modelId}/endpoint
    - Requires: authentication via Set-FabricApiHeaders / Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Get-FabricMLModelEndpoint {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MLModelId,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $segments = @('workspaces', $WorkspaceId, 'mlmodels', $MLModelId, 'endpoint')
            $apiEndpointURI = New-FabricAPIUri -Segments $segments
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No endpoint returned for ML Model '$MLModelId'." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            # Resolve the workspace display name once for all returned objects.
            $workspaceName = $WorkspaceId
            try {
                $workspaceName = Resolve-FabricWorkspaceName -WorkspaceId $WorkspaceId
            }
            catch {
                Write-FabricLog -Message "Failed to resolve workspace name for ID '$WorkspaceId': $($_.Exception.Message)" -Level Debug
            }

            foreach ($endpoint in $response) {
                $endpoint | Add-Member -NotePropertyName 'workspaceId'   -NotePropertyValue $WorkspaceId   -Force
                $endpoint | Add-Member -NotePropertyName 'WorkspaceName' -NotePropertyValue $workspaceName -Force
            }

            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.MLModelEndpoint'
            $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve endpoint for ML Model '$MLModelId'. Error: $errorDetails" -Level Error
        }
    }
}
