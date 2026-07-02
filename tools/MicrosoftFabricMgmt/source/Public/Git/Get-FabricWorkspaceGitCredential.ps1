<#
.SYNOPSIS
Retrieves the caller's Git credentials configuration for a Microsoft Fabric workspace.

.DESCRIPTION
The Get-FabricWorkspaceGitCredential function returns the caller's Git credentials
configuration via GET to the Fabric `/workspaces/{workspaceId}/git/myGitCredentials`
endpoint. The response indicates how the caller's credentials are obtained for the relevant
Git provider (automatically or through a configured connection), or that they are not
configured.

By default the returned object is decorated for the custom view. Pass -Raw to return the
untouched API response.

.PARAMETER WorkspaceId
The unique identifier of the workspace whose Git credentials configuration is retrieved. Mandatory.

.PARAMETER Raw
If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
Get-FabricWorkspaceGitCredential -WorkspaceId "12345678-1234-1234-1234-123456789012"

Returns the caller's Git credentials configuration for the workspace.

.OUTPUTS
System.Object
The Git credentials configuration object with all API-returned properties.

.NOTES
- API Endpoint: GET /workspaces/{workspaceId}/git/myGitCredentials
- Requires: authentication via Set-FabricApiHeaders / Connect-FabricAccount.

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Get-FabricWorkspaceGitCredential {
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

            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'git/myGitCredentials'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No Git credentials configuration returned for workspace '$WorkspaceId'." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.GitCredentials'
            $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Git credentials for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
