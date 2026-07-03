<#
.SYNOPSIS
    Accepts a Microsoft Fabric external data share invitation into a target item.

.DESCRIPTION
    The Approve-FabricExternalDataShareInvitation function accepts an external data share
    invitation via POST to the top-level Fabric endpoint
    /externalDataShares/invitations/{invitationId}/accept
    (ExternalDataSharesRecipient_AcceptExternalDataShareInvitation).

    The request body (AcceptExternalDataShareInvitationRequest) is polymorphic - it carries
    the provider tenant ID and a payload describing the target item / shortcut creation for
    the accepted share. Because the payload varies, the full request body is supplied as a
    hashtable and passed through verbatim so any accept scenario can be expressed.

.PARAMETER InvitationId
    The unique identifier of the external data share invitation to accept. Mandatory.

.PARAMETER Body
    A hashtable representing the AcceptExternalDataShareInvitationRequest payload, passed
    through verbatim as the request body. Typically includes fields such as providerTenantId
    and a payload / target item definition. Mandatory.

.EXAMPLE
    $request = @{
        providerTenantId = '99999999-9999-9999-9999-999999999999'
        payload = @{
            payloadType = 'ShortcutCreation'
            item = @{ workspaceId = 'ws-1'; id = 'item-1' }
            path = 'Files'
        }
    }
    Approve-FabricExternalDataShareInvitation -InvitationId "11111111-2222-3333-4444-555555555555" -Body $request

    Accepts the invitation, creating the share in the specified target item.

.OUTPUTS
    System.Object
    The API response returned after accepting the invitation.

.NOTES
    - API Endpoint: POST /externalDataShares/invitations/{invitationId}/accept
    - Requires: authentication via Set-FabricApiHeaders / Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Approve-FabricExternalDataShareInvitation {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$InvitationId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [hashtable]$Body
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Top-level invitation accept path; all segments are mandatory and non-null.
            $segments = @('externalDataShares', 'invitations', $InvitationId, 'accept')
            $apiEndpointURI = New-FabricAPIUri -Segments $segments
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # The accept request body is polymorphic; pass it through verbatim.
            $bodyJson = $Body | ConvertTo-Json -Depth 10
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }

            if ($PSCmdlet.ShouldProcess($InvitationId, "Accept external data share invitation")) {
                $response = Invoke-FabricAPIRequest @apiParams
                Write-FabricLog -Message "External data share invitation '$InvitationId' accepted successfully!" -Level Host
                $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to accept external data share invitation '$InvitationId'. Error: $errorDetails" -Level Error
        }
    }
}
