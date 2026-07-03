<#
.SYNOPSIS
Sets the outbound cloud connection rules for a Microsoft Fabric workspace.

.DESCRIPTION
The Set-FabricWorkspaceOutboundConnectionRule function sets the outbound cloud connection
rules for a workspace enabled with Outbound Access Protection (OAP) via PUT to the Fabric
`/workspaces/{workspaceId}/networking/communicationPolicy/outbound/connections` endpoint.

Because the request body schema is nested and evolving, the rules are supplied as a
hashtable and passed through verbatim. This feature is currently in preview.

.PARAMETER WorkspaceId
The unique identifier of the workspace whose outbound connection rules are set. Mandatory.

.PARAMETER Connections
A hashtable describing the outbound cloud connection rules, passed through verbatim as the
request body, e.g. @{ value = @(@{ connectionId = '...' }) }

.PARAMETER Raw
If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
Set-FabricWorkspaceOutboundConnectionRule -WorkspaceId $ws -Connections @{ value = @(@{ connectionId = '3f2504e0-4f89-11d3-9a0c-0305e82c3301' }) }

Allows the specified cloud connection for the OAP-enabled workspace.

.OUTPUTS
System.Object
The API response returned after setting the rules.

.NOTES
- API Endpoint: PUT /workspaces/{workspaceId}/networking/communicationPolicy/outbound/connections
- Requires: authentication via Set-FabricApiHeaders / Connect-FabricAccount.
- Preview: this API is part of a Fabric Preview release.

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Set-FabricWorkspaceOutboundConnectionRule {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [hashtable]$Connections,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'networking/communicationPolicy/outbound/connections'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $bodyJson = $Connections | ConvertTo-Json -Depth 10
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Put'
                Body    = $bodyJson
            }

            if ($PSCmdlet.ShouldProcess($WorkspaceId, "Set workspace outbound connection rules")) {
                $response = Invoke-FabricAPIRequest @apiParams

                if ($Raw) {
                    return $response
                }

                Write-FabricLog -Message "Outbound connection rules for workspace '$WorkspaceId' set successfully!" -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to set outbound connection rules for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
