<#
.SYNOPSIS
Retrieves the Git status of items in a Microsoft Fabric workspace.

.DESCRIPTION
The Get-FabricWorkspaceGitStatus function returns the Git status of the workspace via GET
to the Fabric `/workspaces/{workspaceId}/git/status` endpoint. The status indicates changes
to items since the last workspace and remote branch sync, flagging conflicts when both the
remote and workspace versions were modified.

By default the returned status object is enriched with the originating WorkspaceId (stamped
from the parameter) and a resolved WorkspaceName, and decorated for the custom view. Pass
-Raw to return the untouched API response.

.PARAMETER WorkspaceId
The unique identifier of the workspace whose Git status is retrieved. Mandatory.

.PARAMETER Raw
If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
Get-FabricWorkspaceGitStatus -WorkspaceId "12345678-1234-1234-1234-123456789012"

Returns the Git status object for the workspace, enriched with WorkspaceName.

.OUTPUTS
System.Object
The Git status object with all API-returned properties plus WorkspaceName when enriched.

.NOTES
- API Endpoint: GET /workspaces/{workspaceId}/git/status
- Requires: authentication via Set-FabricApiHeaders / Connect-FabricAccount.

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Get-FabricWorkspaceGitStatus {
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

            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'git/status'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No Git status returned for workspace '$WorkspaceId'." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            # Resolve the workspace display name for context.
            $workspaceName = $WorkspaceId
            try {
                $workspaceName = Resolve-FabricWorkspaceName -WorkspaceId $WorkspaceId
            }
            catch {
                Write-FabricLog -Message "Failed to resolve workspace name for ID '$WorkspaceId': $($_.Exception.Message)" -Level Debug
            }

            $response | Add-Member -NotePropertyName 'workspaceId'   -NotePropertyValue $WorkspaceId   -Force
            $response | Add-Member -NotePropertyName 'WorkspaceName' -NotePropertyValue $workspaceName -Force

            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.GitStatus'
            $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Git status for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
