<#
.SYNOPSIS
Connects a Microsoft Fabric workspace to a Git repository and branch.

.DESCRIPTION
The Connect-FabricWorkspaceGit function connects a workspace to a Git repository via POST
to the Fabric `/workspaces/{workspaceId}/git/connect` endpoint.

This operation only establishes the connection; it does not sync the workspace with the
connected branch. To complete the sync, call Initialize-FabricWorkspaceGitConnection and
then either Save-FabricWorkspaceGitCommit or Update-FabricWorkspaceFromGit.

Because the provider connection information is polymorphic on the Git provider type
(Azure DevOps, GitHub, etc.), the provider details are supplied as a hashtable and passed
through verbatim so any provider schema can be expressed. The API response is returned
as-is.

.PARAMETER WorkspaceId
The unique identifier of the workspace to connect to Git. Mandatory.

.PARAMETER GitProviderDetails
A hashtable describing the Git provider connection information, passed through verbatim as
the request body's gitProviderDetails property, e.g.
@{ gitProviderType = 'AzureDevOps'; organizationName = 'org'; projectName = 'proj'; repositoryName = 'repo'; branchName = 'main'; directoryName = '/' }

.PARAMETER Raw
If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
$provider = @{ gitProviderType = 'AzureDevOps'; organizationName = 'org'; projectName = 'proj'; repositoryName = 'repo'; branchName = 'main'; directoryName = '/' }
Connect-FabricWorkspaceGit -WorkspaceId "12345678-1234-1234-1234-123456789012" -GitProviderDetails $provider

Connects the workspace to the specified Azure DevOps repository and branch.

.OUTPUTS
System.Object
The API response from the connect operation.

.NOTES
- API Endpoint: POST /workspaces/{workspaceId}/git/connect
- Requires: authentication via Set-FabricApiHeaders / Connect-FabricAccount.

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Connect-FabricWorkspaceGit {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [hashtable]$GitProviderDetails,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'git/connect'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # gitProviderDetails is passed through verbatim so any provider schema can be expressed.
            $body = @{
                gitProviderDetails = $GitProviderDetails
            }

            $bodyJson = $body | ConvertTo-Json -Depth 10
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }

            if ($PSCmdlet.ShouldProcess($WorkspaceId, "Connect workspace to Git")) {
                $response = Invoke-FabricAPIRequest @apiParams

                if ($Raw) {
                    return $response
                }

                Write-FabricLog -Message "Workspace '$WorkspaceId' connected to Git successfully!" -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to connect workspace '$WorkspaceId' to Git. Error: $errorDetails" -Level Error
        }
    }
}
