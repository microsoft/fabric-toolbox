<#
.SYNOPSIS
Updates a Microsoft Fabric workspace with commits pushed to the connected Git branch.

.DESCRIPTION
The Update-FabricWorkspaceFromGit function updates the workspace with commits from the
connected remote branch via POST to the Fabric
`/workspaces/{workspaceId}/git/updateFromGit` endpoint.

The update affects only items changed in those commits. When called immediately after
Connect-FabricWorkspaceGit and Initialize-FabricWorkspaceGitConnection, it performs a full
update of the entire workspace. Optional conflict resolution and update options may be
supplied as hashtables and are passed through verbatim. The API response is returned as-is.

.PARAMETER WorkspaceId
The unique identifier of the workspace to update from Git. Mandatory.

.PARAMETER RemoteCommitHash
The remote full SHA commit hash to update the workspace to. Mandatory.

.PARAMETER WorkspaceHead
Optional. The full SHA hash that the workspace is currently synced to. Used for
concurrency control; the request fails if it does not match the system head.

.PARAMETER ConflictResolution
Optional hashtable describing how to resolve conflicts, passed through verbatim, e.g.
@{ conflictResolutionType = 'Workspace'; conflictResolutionPolicy = 'PreferWorkspace' }

.PARAMETER Options
Optional hashtable of update options, passed through verbatim, e.g.
@{ allowOverrideItems = $true }

.PARAMETER Raw
If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
Update-FabricWorkspaceFromGit -WorkspaceId "12345678-1234-1234-1234-123456789012" -RemoteCommitHash "7d03b2918bf6aa62f96d0a4307293f3853201705"

Updates the workspace to the specified remote commit.

.EXAMPLE
$conflict = @{ conflictResolutionType = 'Workspace'; conflictResolutionPolicy = 'PreferWorkspace' }
$options = @{ allowOverrideItems = $true }
Update-FabricWorkspaceFromGit -WorkspaceId "12345678-1234-1234-1234-123456789012" -RemoteCommitHash "7d03b29..." -WorkspaceHead "eaa737b..." -ConflictResolution $conflict -Options $options

Updates the workspace, preferring the workspace on conflict and allowing item overrides.

.OUTPUTS
System.Object
The API response from the update-from-Git operation.

.NOTES
- API Endpoint: POST /workspaces/{workspaceId}/git/updateFromGit
- Requires: authentication via Set-FabricApiHeaders / Connect-FabricAccount.

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Update-FabricWorkspaceFromGit {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$RemoteCommitHash,

        [Parameter(Mandatory = $false)]
        [string]$WorkspaceHead,

        [Parameter(Mandatory = $false)]
        [hashtable]$ConflictResolution,

        [Parameter(Mandatory = $false)]
        [hashtable]$Options,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'git/updateFromGit'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Build the body from supplied fields; nested objects are passed through verbatim.
            $body = @{
                remoteCommitHash = $RemoteCommitHash
            }
            if ($WorkspaceHead) { $body.workspaceHead = $WorkspaceHead }
            if ($ConflictResolution) { $body.conflictResolution = $ConflictResolution }
            if ($Options) { $body.options = $Options }

            $bodyJson = $body | ConvertTo-Json -Depth 10
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }

            if ($PSCmdlet.ShouldProcess($WorkspaceId, "Update workspace from Git")) {
                $response = Invoke-FabricAPIRequest @apiParams

                if ($Raw) {
                    return $response
                }

                Write-FabricLog -Message "Workspace '$WorkspaceId' updated from Git successfully!" -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update workspace '$WorkspaceId' from Git. Error: $errorDetails" -Level Error
        }
    }
}
