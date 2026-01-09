<#
.SYNOPSIS
    Removes a warehouse from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a DELETE request to the Microsoft Fabric API to remove a warehouse
    from the specified workspace using the provided WorkspaceId and WarehouseId.

.PARAMETER WorkspaceId
    The unique identifier of the workspace from which the warehouse will be removed.

.PARAMETER WarehouseId
    The unique identifier of the warehouse to be removed.

.EXAMPLE
    Remove-FabricWarehouse -WorkspaceId "workspace-12345" -WarehouseId "warehouse-67890"
    This example removes the warehouse with ID "warehouse-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Remove-FabricWarehouse {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WarehouseId
    )
    try {
        Invoke-FabricAuthCheck -ThrowOnFailure


        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/warehouses/{2}" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId, $WarehouseId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $script:FabricAuthContext.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Delete'
        }

        if ($PSCmdlet.ShouldProcess("Warehouse '$WarehouseId' in workspace '$WorkspaceId'", 'Delete')) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Warehouse '$WarehouseId' deleted successfully from workspace '$WorkspaceId'." -Level Host
            return $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete Warehouse '$WarehouseId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
