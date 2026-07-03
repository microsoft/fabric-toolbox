<#
.SYNOPSIS
Retrieves the Git outbound networking policy for a Microsoft Fabric workspace.

.DESCRIPTION
The Get-FabricWorkspaceGitOutboundPolicy function retrieves the Git outbound networking
communication policy for a workspace via GET to the Fabric
`/workspaces/{workspaceId}/networking/communicationPolicy/outbound/git` endpoint. This
feature is currently in preview.

By default the returned object is enriched with the originating WorkspaceId (stamped from
the parameter) and a resolved WorkspaceName, and decorated for the custom table view.
Pass -Raw to return the untouched API response.

.PARAMETER WorkspaceId
The unique identifier of the workspace whose Git outbound policy is retrieved. Mandatory.

.PARAMETER Raw
If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
Get-FabricWorkspaceGitOutboundPolicy -WorkspaceId "12345678-1234-1234-1234-123456789012"

Returns the Git outbound networking policy for the workspace, enriched with WorkspaceName.

.OUTPUTS
System.Object
The Git outbound policy object with all API-returned properties plus WorkspaceName when enriched.

.NOTES
- API Endpoint: GET /workspaces/{workspaceId}/networking/communicationPolicy/outbound/git
- Requires: authentication via Set-FabricApiHeaders / Connect-FabricAccount.
- Preview: this API is part of a Fabric Preview release.

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Get-FabricWorkspaceGitOutboundPolicy {
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

            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'networking/communicationPolicy/outbound/git'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No Git outbound policy returned for workspace '$WorkspaceId'." -Level Warning
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

            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.WorkspaceGitOutboundPolicy'
            $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Git outbound policy for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
