<#
.SYNOPSIS
Deletes an Lakehouse from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Remove-FabricLakehouse` function sends a DELETE request to the Fabric API to remove a specified Lakehouse from a given workspace.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace containing the Lakehouse to delete.

.PARAMETER LakehouseId
(Mandatory) The ID of the Lakehouse to be deleted.

.EXAMPLE
Remove-FabricLakehouse -WorkspaceId "12345" -LakehouseId "67890"

Deletes the Lakehouse with ID "67890" from workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Validates token expiration before making the API request.

Author: Tiago Balabuch

#>
function Remove-FabricLakehouse {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$LakehouseId
    )
    try {
        Invoke-FabricAuthCheck -ThrowOnFailure


        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/lakehouses/{2}" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId, $LakehouseId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $script:FabricAuthContext.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Delete'
        }
        if ($PSCmdlet.ShouldProcess($LakehouseId, "Delete Lakehouse in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Lakehouse '$LakehouseId' deleted successfully from workspace '$WorkspaceId'." -Level Host
            return $response
        }


    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete Lakehouse '$LakehouseId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
