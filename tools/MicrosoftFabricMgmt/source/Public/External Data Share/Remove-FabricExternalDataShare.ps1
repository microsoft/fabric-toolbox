<#
.SYNOPSIS
    Deletes an external data share from a Microsoft Fabric workspace item.

.DESCRIPTION
    The Remove-FabricExternalDataShare function deletes an external data share via DELETE to
    the Fabric endpoint
    /workspaces/{workspaceId}/items/{itemId}/externalDataShares/{externalDataShareId}
    (ExternalDataSharesProvider_DeleteExternalDataShare).

    This is distinct from Revoke-FabricExternalDataShare, which revokes an active share via
    the admin revoke endpoint. Deleting removes the external data share record entirely.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the item. Mandatory.

.PARAMETER ItemId
    The unique identifier of the item that owns the external data share. Mandatory.

.PARAMETER ExternalDataShareId
    The unique identifier of the external data share to delete. Mandatory.

.EXAMPLE
    Remove-FabricExternalDataShare -WorkspaceId "12345678-1234-1234-1234-123456789012" -ItemId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -ExternalDataShareId "ffffffff-1111-2222-3333-444444444444"

    Deletes the specified external data share from the workspace item.

.NOTES
    - API Endpoint: DELETE /workspaces/{workspaceId}/items/{itemId}/externalDataShares/{externalDataShareId}
    - Requires: authentication via Set-FabricApiHeaders / Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Remove-FabricExternalDataShare {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ItemId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$ExternalDataShareId
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Build the segment list explicitly; all segments are mandatory and non-null.
            $segments = @('workspaces', $WorkspaceId, 'items', $ItemId, 'externalDataShares', $ExternalDataShareId)
            $apiEndpointURI = New-FabricAPIUri -Segments $segments
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Delete'
            }

            if ($PSCmdlet.ShouldProcess($ExternalDataShareId, "Delete external data share for item '$ItemId' in workspace '$WorkspaceId'")) {
                $null = Invoke-FabricAPIRequest @apiParams
                Write-FabricLog -Message "External data share '$ExternalDataShareId' deleted successfully!" -Level Host
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to delete external data share '$ExternalDataShareId'. Error: $errorDetails" -Level Error
        }
    }
}
