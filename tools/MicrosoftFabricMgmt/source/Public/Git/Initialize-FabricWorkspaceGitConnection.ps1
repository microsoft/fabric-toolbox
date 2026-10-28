<#
.SYNOPSIS
Initializes the Git connection for a Microsoft Fabric workspace connected to Git.

.DESCRIPTION
The Initialize-FabricWorkspaceGitConnection function initializes a workspace's Git
connection via POST to the Fabric `/workspaces/{workspaceId}/git/initializeConnection`
endpoint. It should be called after a successful Connect-FabricWorkspaceGit. Based on the
required action returned, complete the sync by calling either Save-FabricWorkspaceGitCommit
or Update-FabricWorkspaceFromGit.

An optional initialization strategy determines how conflicts between the workspace and the
remote branch are resolved during the initial sync. The API response (including any
required action) is returned as-is.

.PARAMETER WorkspaceId
The unique identifier of the workspace whose Git connection is initialized. Mandatory.

.PARAMETER InitializationStrategy
Optional. The strategy used to resolve differences during initialization.
Valid values: None, PreferRemote, PreferWorkspace. Only sent when supplied.

.PARAMETER Raw
If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
Initialize-FabricWorkspaceGitConnection -WorkspaceId "12345678-1234-1234-1234-123456789012"

Initializes the Git connection using the service default strategy.

.EXAMPLE
Initialize-FabricWorkspaceGitConnection -WorkspaceId "12345678-1234-1234-1234-123456789012" -InitializationStrategy 'PreferWorkspace'

Initializes the Git connection, preferring the workspace content on conflict.

.OUTPUTS
System.Object
The API response from the initialize connection operation, including the required action.

.NOTES
- API Endpoint: POST /workspaces/{workspaceId}/git/initializeConnection
- Requires: authentication via Connect-FabricAccount.

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Initialize-FabricWorkspaceGitConnection {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateSet('None', 'PreferRemote', 'PreferWorkspace')]
        [string]$InitializationStrategy,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'git/initializeConnection'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Build the body only from supplied fields.
            $body = @{}
            if ($InitializationStrategy) { $body.initializationStrategy = $InitializationStrategy }

            $bodyJson = $body | ConvertTo-Json -Depth 10
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }

            if ($PSCmdlet.ShouldProcess($WorkspaceId, "Initialize workspace Git connection")) {
                $response = Invoke-FabricAPIRequest @apiParams

                if ($Raw) {
                    return $response
                }

                Write-FabricLog -Message "Git connection initialized for workspace '$WorkspaceId' successfully!" -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to initialize Git connection for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
