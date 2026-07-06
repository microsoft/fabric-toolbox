<#
.SYNOPSIS
Retrieves the networking communication policy for a Microsoft Fabric workspace.

.DESCRIPTION
The Get-FabricWorkspaceNetworkCommunicationPolicy function retrieves the networking
communication policy for a workspace via GET to the Fabric
`/workspaces/{workspaceId}/networking/communicationPolicy` endpoint. This feature is
currently in preview.

By default the returned object is enriched with the originating WorkspaceId (stamped from
the parameter) and a resolved WorkspaceName, and decorated for the custom table view.
Pass -Raw to return the untouched API response.

.PARAMETER WorkspaceId
The unique identifier of the workspace whose networking communication policy is retrieved. Mandatory.

.PARAMETER Raw
If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
Get-FabricWorkspaceNetworkCommunicationPolicy -WorkspaceId "12345678-1234-1234-1234-123456789012"

Returns the networking communication policy for the workspace, enriched with WorkspaceName.

.OUTPUTS
System.Object
The networking communication policy object with all API-returned properties plus WorkspaceName when enriched.

.NOTES
- API Endpoint: GET /workspaces/{workspaceId}/networking/communicationPolicy
- Requires: authentication via Connect-FabricAccount.
- Preview: this API is part of a Fabric Preview release.

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Get-FabricWorkspaceNetworkCommunicationPolicy {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'networking/communicationPolicy'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No networking communication policy returned for workspace '$WorkspaceId'." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            $workspaceName = $WorkspaceId
            try {
                $workspaceName = Resolve-FabricWorkspaceName -WorkspaceId $WorkspaceId
            }
            catch {
                Write-FabricLog -Message "Failed to resolve workspace name for ID '$WorkspaceId': $($_.Exception.Message)" -Level Debug
            }

            foreach ($item in $response) {
                $item | Add-Member -NotePropertyName 'workspaceId'   -NotePropertyValue $WorkspaceId   -Force
                $item | Add-Member -NotePropertyName 'WorkspaceName' -NotePropertyValue $workspaceName -Force
            }

            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.WorkspaceNetworkCommunicationPolicy'
            $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve networking communication policy for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
