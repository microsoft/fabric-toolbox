<#
.SYNOPSIS
Disconnects a Microsoft Fabric workspace from its connected Git repository and branch.

.DESCRIPTION
The Disconnect-FabricWorkspaceGit function disconnects a workspace from the Git repository
and branch it is connected to, via POST to the Fabric
`/workspaces/{workspaceId}/git/disconnect` endpoint. The request has no body.

.PARAMETER WorkspaceId
The unique identifier of the workspace to disconnect from Git. Mandatory.

.PARAMETER Raw
If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
Disconnect-FabricWorkspaceGit -WorkspaceId "12345678-1234-1234-1234-123456789012"

Disconnects the workspace from its connected Git repository and branch.

.OUTPUTS
System.Object
The API response from the disconnect operation.

.NOTES
- API Endpoint: POST /workspaces/{workspaceId}/git/disconnect
- Requires: authentication via Connect-FabricAccount.

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Disconnect-FabricWorkspaceGit {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
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

            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'git/disconnect'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
            }

            if ($PSCmdlet.ShouldProcess($WorkspaceId, "Disconnect workspace from Git")) {
                $response = Invoke-FabricAPIRequest @apiParams

                if ($Raw) {
                    return $response
                }

                Write-FabricLog -Message "Workspace '$WorkspaceId' disconnected from Git successfully!" -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to disconnect workspace '$WorkspaceId' from Git. Error: $errorDetails" -Level Error
        }
    }
}
