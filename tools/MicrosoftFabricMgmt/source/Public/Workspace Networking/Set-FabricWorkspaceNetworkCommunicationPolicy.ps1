<#
.SYNOPSIS
Sets the networking communication policy for a Microsoft Fabric workspace.

.DESCRIPTION
The Set-FabricWorkspaceNetworkCommunicationPolicy function sets the networking
communication policy for a workspace via PUT to the Fabric
`/workspaces/{workspaceId}/networking/communicationPolicy` endpoint.

This API uses the PUT method and overwrites all settings; any omitted policy is reset to
its default value. Always run Get-FabricWorkspaceNetworkCommunicationPolicy first and
supply the full policy. Because the request body schema is nested and evolving, the policy
is supplied as a hashtable and passed through verbatim. This feature is currently in preview.

.PARAMETER WorkspaceId
The unique identifier of the workspace whose networking communication policy is set. Mandatory.

.PARAMETER CommunicationPolicy
A hashtable describing the full networking communication policy, passed through verbatim as
the request body, e.g.
@{ inbound = @{ defaultAction = 'Allow' }; outbound = @{ publicAccessRules = @{ defaultAction = 'Deny' } } }

.PARAMETER IfMatch
Optional ETag value. When supplied, the call succeeds only if the resource's current ETag
matches, providing optimistic-concurrency protection.

.PARAMETER Raw
If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
$policy = Get-FabricWorkspaceNetworkCommunicationPolicy -WorkspaceId $ws -Raw
$policy.outbound.publicAccessRules.defaultAction = 'Deny'
Set-FabricWorkspaceNetworkCommunicationPolicy -WorkspaceId $ws -CommunicationPolicy $policy

Enables outbound access protection by denying public outbound access by default.

.OUTPUTS
System.Object
The API response returned after setting the policy.

.NOTES
- API Endpoint: PUT /workspaces/{workspaceId}/networking/communicationPolicy
- Requires: authentication via Set-FabricApiHeaders / Connect-FabricAccount.
- Permissions: caller must have the admin workspace role.
- Preview: this API is part of a Fabric Preview release.

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Set-FabricWorkspaceNetworkCommunicationPolicy {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('Policy')]
        [hashtable]$CommunicationPolicy,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$IfMatch,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'networking/communicationPolicy'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $bodyJson = $CommunicationPolicy | ConvertTo-Json -Depth 10
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

            if ($PSCmdlet.ShouldProcess($WorkspaceId, "Set workspace network communication policy")) {
                $response = Invoke-FabricAPIRequest @apiParams

                if ($Raw) {
                    return $response
                }

                Write-FabricLog -Message "Network communication policy for workspace '$WorkspaceId' set successfully!" -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to set network communication policy for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
