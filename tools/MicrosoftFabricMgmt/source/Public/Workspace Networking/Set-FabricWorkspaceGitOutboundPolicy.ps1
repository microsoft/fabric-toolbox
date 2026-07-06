<#
.SYNOPSIS
Sets the Git outbound networking policy for a Microsoft Fabric workspace.

.DESCRIPTION
The Set-FabricWorkspaceGitOutboundPolicy function sets the Git outbound networking
communication policy for a workspace via PUT to the Fabric
`/workspaces/{workspaceId}/networking/communicationPolicy/outbound/git` endpoint.

Because the request body schema is nested and evolving, the policy is supplied as a
hashtable and passed through verbatim. This feature is currently in preview.

.PARAMETER WorkspaceId
The unique identifier of the workspace whose Git outbound policy is set. Mandatory.

.PARAMETER GitPolicy
A hashtable describing the Git outbound policy, passed through verbatim as the request body.

.PARAMETER IfMatch
Optional ETag value. When supplied, the call succeeds only if the resource's current ETag
matches, providing optimistic-concurrency protection.

.PARAMETER Raw
If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
Set-FabricWorkspaceGitOutboundPolicy -WorkspaceId $ws -GitPolicy @{ defaultAction = 'Deny' }

Restricts Git outbound access for the workspace.

.OUTPUTS
System.Object
The API response returned after setting the policy.

.NOTES
- API Endpoint: PUT /workspaces/{workspaceId}/networking/communicationPolicy/outbound/git
- Requires: authentication via Connect-FabricAccount.
- Preview: this API is part of a Fabric Preview release.

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Set-FabricWorkspaceGitOutboundPolicy {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('Policy')]
        [hashtable]$GitPolicy,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$IfMatch,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'networking/communicationPolicy/outbound/git'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $bodyJson = $GitPolicy | ConvertTo-Json -Depth 10
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            # Clone the auth headers before adding If-Match so the shared context is not mutated.
            $headers = $script:FabricAuthContext.FabricHeaders
            if ($IfMatch) {
                $headers = $script:FabricAuthContext.FabricHeaders.Clone()
                $headers['If-Match'] = $IfMatch
            }

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $headers
                Method  = 'Put'
                Body    = $bodyJson
            }

            if ($PSCmdlet.ShouldProcess($WorkspaceId, "Set workspace Git outbound policy")) {
                $response = Invoke-FabricAPIRequest @apiParams

                if ($Raw) {
                    return $response
                }

                Write-FabricLog -Message "Git outbound policy for workspace '$WorkspaceId' set successfully!" -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to set Git outbound policy for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
