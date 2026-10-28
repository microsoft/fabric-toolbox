<#
.SYNOPSIS
    Retrieves details about a Microsoft Fabric external data share invitation.

.DESCRIPTION
    The Get-FabricExternalDataShareInvitation function returns information about an external
    data share invitation via GET to the top-level Fabric endpoint
    /externalDataShares/invitations/{invitationId}
    (ExternalDataSharesRecipient_GetExternalDataShareInvitationDetails).

    The provider tenant ID is a required query parameter for this operation.

    By default the returned object is decorated for the custom table view. Pass -Raw to
    return the untouched API response.

.PARAMETER InvitationId
    The unique identifier of the external data share invitation. Mandatory.

.PARAMETER ProviderTenantId
    The tenant ID of the external data share provider. Required query parameter for the API.

.PARAMETER Raw
    If specified, returns the untouched API response with no type decoration.

.EXAMPLE
    Get-FabricExternalDataShareInvitation -InvitationId "11111111-2222-3333-4444-555555555555" -ProviderTenantId "99999999-9999-9999-9999-999999999999"

    Retrieves details of the external data share invitation from the specified provider tenant.

.OUTPUTS
    System.Object
    The external data share invitation details object with all API-returned properties.

.NOTES
    - API Endpoint: GET /externalDataShares/invitations/{invitationId}?providerTenantId={providerTenantId}
    - Requires: authentication via Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Get-FabricExternalDataShareInvitation {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$InvitationId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ProviderTenantId,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Top-level invitation path; providerTenantId is a required query parameter.
            $segments = @('externalDataShares', 'invitations', $InvitationId)
            $queryParameters = @{ providerTenantId = $ProviderTenantId }
            $apiEndpointURI = New-FabricAPIUri -Segments $segments -QueryParameters $queryParameters
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No external data share invitation found with ID '$InvitationId'." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.ExternalDataShareInvitation'
            $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve external data share invitation '$InvitationId'. Error: $errorDetails" -Level Error
        }
    }
}
