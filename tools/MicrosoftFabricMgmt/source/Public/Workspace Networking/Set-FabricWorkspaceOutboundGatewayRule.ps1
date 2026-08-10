<#
.SYNOPSIS
Sets the outbound gateway rules for a Microsoft Fabric workspace.

.DESCRIPTION
The Set-FabricWorkspaceOutboundGatewayRule function sets the outbound gateway rules for a
workspace enabled with Outbound Access Protection (OAP) via PUT to the Fabric
`/workspaces/{workspaceId}/networking/communicationPolicy/outbound/gateways` endpoint.

Because the request body schema is nested and evolving, the rules are supplied as a
hashtable and passed through verbatim. This feature is currently in preview.

.PARAMETER WorkspaceId
The unique identifier of the workspace whose outbound gateway rules are set. Mandatory.

.PARAMETER Gateways
A hashtable describing the outbound gateway rules, passed through verbatim as the request
body, e.g. @{ value = @(@{ gatewayId = '...' }) }

.PARAMETER Raw
If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
Set-FabricWorkspaceOutboundGatewayRule -WorkspaceId $ws -Gateways @{ value = @(@{ gatewayId = '3f2504e0-4f89-11d3-9a0c-0305e82c3301' }) }

Allows the specified gateway for the OAP-enabled workspace.

.OUTPUTS
System.Object
The API response returned after setting the rules.

.NOTES
- API Endpoint: PUT /workspaces/{workspaceId}/networking/communicationPolicy/outbound/gateways
- Requires: authentication via Connect-FabricAccount.
- Preview: this API is part of a Fabric Preview release.

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Set-FabricWorkspaceOutboundGatewayRule {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [hashtable]$Gateways,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'networking/communicationPolicy/outbound/gateways'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $bodyJson = $Gateways | ConvertTo-Json -Depth 10
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Put'
                Body    = $bodyJson
            }

            if ($PSCmdlet.ShouldProcess($WorkspaceId, "Set workspace outbound gateway rules")) {
                $response = Invoke-FabricAPIRequest @apiParams

                if ($Raw) {
                    return $response
                }

                Write-FabricLog -Message "Outbound gateway rules for workspace '$WorkspaceId' set successfully!" -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to set outbound gateway rules for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
