<#
.SYNOPSIS
    Revokes an external data share from a specified Microsoft Fabric workspace item.

.DESCRIPTION
    This function revokes an external data share by calling the Microsoft Fabric API.
    It validates the authentication token, constructs the appropriate API endpoint, and sends a revoke request.
    The function requires workspace, item, and external data share IDs.

.PARAMETER WorkspaceId
    The ID of the Microsoft Fabric workspace containing the item.

.PARAMETER ItemId
    The ID of the item within the workspace.

.PARAMETER ExternalDataShareId
    The ID of the external data share to revoke.

.EXAMPLE
    Revoke-FabricExternalDataShare -WorkspaceId "abc123" -ItemId "def456" -ExternalDataShareId "ghi789"
    Revokes the specified external data share from the given workspace item.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.
    - Author: Tiago Balabuch
#>
function Revoke-FabricExternalDataShare {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ItemId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ExternalDataShareId
    )
    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'admin/workspaces' -WorkspaceId $WorkspaceId -Subresource "items/$ItemId/externalDataShares/$ExternalDataShareId/revoke"

        if ($PSCmdlet.ShouldProcess($ExternalDataShareId, "Revoke external data share for item '$ItemId' in workspace '$WorkspaceId'")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "External data share with ID '$ExternalDataShareId' successfully revoked in workspace '$WorkspaceId', item '$ItemId'." -Level Info
            $dataItems
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to revoke External Data Share. Error: $errorDetails" -Level Error
    }

}
