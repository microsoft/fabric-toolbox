<#
.SYNOPSIS
Updates the caller's Git credentials configuration for a Microsoft Fabric workspace.

.DESCRIPTION
The Update-FabricWorkspaceGitCredential function updates the caller's Git credentials
configuration via PATCH to the Fabric `/workspaces/{workspaceId}/git/myGitCredentials`
endpoint.

Because the request body is polymorphic on the credentials source (Automatic,
ConfiguredConnection, None), the credential details are supplied as a hashtable and passed
through verbatim so any source shape can be expressed. The supplied hashtable must include
the discriminating `source` property. The API response is returned as-is.

.PARAMETER WorkspaceId
The unique identifier of the workspace whose Git credentials configuration is updated. Mandatory.

.PARAMETER CredentialDetails
A hashtable describing the Git credentials source, passed through verbatim as the request
body. Must include a `source` property (Automatic, ConfiguredConnection or None) plus any
source-specific fields, e.g. @{ source = 'ConfiguredConnection'; connectionId = '3f2504e0-4f89-11d3-9a0c-0305e82c3301' }
or @{ source = 'Automatic' } or @{ source = 'None' }.

.PARAMETER Raw
If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
$cred = @{ source = 'ConfiguredConnection'; connectionId = '3f2504e0-4f89-11d3-9a0c-0305e82c3301' }
Update-FabricWorkspaceGitCredential -WorkspaceId "12345678-1234-1234-1234-123456789012" -CredentialDetails $cred

Updates the caller's Git credentials to use the specified configured connection.

.EXAMPLE
Update-FabricWorkspaceGitCredential -WorkspaceId "12345678-1234-1234-1234-123456789012" -CredentialDetails @{ source = 'Automatic' }

Updates the caller's Git credentials to be obtained automatically.

.OUTPUTS
System.Object
The updated Git credentials configuration object returned by the API.

.NOTES
- API Endpoint: PATCH /workspaces/{workspaceId}/git/myGitCredentials
- Requires: authentication via Connect-FabricAccount.

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Update-FabricWorkspaceGitCredential {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('Source')]
        [hashtable]$CredentialDetails,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'git/myGitCredentials'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # The credential details hashtable is passed through verbatim as the request body.
            $bodyJson = $CredentialDetails | ConvertTo-Json -Depth 10
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Patch'
                Body    = $bodyJson
            }

            if ($PSCmdlet.ShouldProcess($WorkspaceId, "Update workspace Git credentials")) {
                $response = Invoke-FabricAPIRequest @apiParams

                if ($Raw) {
                    return $response
                }

                Write-FabricLog -Message "Git credentials for workspace '$WorkspaceId' updated successfully!" -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update Git credentials for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
