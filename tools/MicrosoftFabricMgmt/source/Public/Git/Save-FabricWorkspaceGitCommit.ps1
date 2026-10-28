<#
.SYNOPSIS
Commits changes made in a Microsoft Fabric workspace to the connected Git branch.

.DESCRIPTION
The Save-FabricWorkspaceGitCommit function commits workspace changes to the connected
remote branch via POST to the Fabric `/workspaces/{workspaceId}/git/commitToGit` endpoint.

You can commit all changes (Mode 'All') or only specific changed items (Mode 'Selective').
When committing selectively, supply the items to include via -Items. The API response is
returned as-is.

.PARAMETER WorkspaceId
The unique identifier of the workspace whose changes are committed. Mandatory.

.PARAMETER Mode
The commit mode. Valid values: All, Selective. Mandatory.

.PARAMETER Comment
Optional. The commit comment/message.

.PARAMETER WorkspaceHead
Optional. The full SHA hash that the workspace is currently synced to. Used for
concurrency control; the request fails if it does not match the system head.

.PARAMETER Items
Optional. An array of item identifiers to commit when Mode is 'Selective'. Each entry is a
hashtable such as @{ objectId = '...' } or @{ logicalId = '...' }.

.PARAMETER Raw
If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
Save-FabricWorkspaceGitCommit -WorkspaceId "12345678-1234-1234-1234-123456789012" -Mode 'All' -Comment 'Nightly commit'

Commits all workspace changes to the connected Git branch.

.EXAMPLE
$items = @(@{ objectId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })
Save-FabricWorkspaceGitCommit -WorkspaceId "12345678-1234-1234-1234-123456789012" -Mode 'Selective' -Items $items -Comment 'Commit one item'

Commits only the specified item to the connected Git branch.

.OUTPUTS
System.Object
The API response from the commit operation.

.NOTES
- API Endpoint: POST /workspaces/{workspaceId}/git/commitToGit
- Requires: authentication via Connect-FabricAccount.

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Save-FabricWorkspaceGitCommit {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateSet('All', 'Selective')]
        [string]$Mode,

        [Parameter(Mandatory = $false)]
        [string]$Comment,

        [Parameter(Mandatory = $false)]
        [string]$WorkspaceHead,

        [Parameter(Mandatory = $false)]
        [object[]]$Items,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'git/commitToGit'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Build the body from supplied fields only.
            $body = @{
                mode = $Mode
            }
            if ($PSBoundParameters.ContainsKey('Comment')) { $body.comment = $Comment }
            if ($WorkspaceHead) { $body.workspaceHead = $WorkspaceHead }
            if ($Items) { $body.items = $Items }

            $bodyJson = $body | ConvertTo-Json -Depth 10
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }

            if ($PSCmdlet.ShouldProcess($WorkspaceId, "Commit workspace changes to Git")) {
                $response = Invoke-FabricAPIRequest @apiParams

                if ($Raw) {
                    return $response
                }

                Write-FabricLog -Message "Workspace '$WorkspaceId' changes committed to Git successfully!" -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to commit workspace '$WorkspaceId' changes to Git. Error: $errorDetails" -Level Error
        }
    }
}
