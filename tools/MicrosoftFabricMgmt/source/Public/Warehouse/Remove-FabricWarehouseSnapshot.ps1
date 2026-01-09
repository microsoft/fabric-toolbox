<#
.SYNOPSIS
    Deletes a warehouse snapshot from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a DELETE request to the Microsoft Fabric API to remove a warehouse snapshot
    identified by WarehouseSnapshotId from the given workspace (WorkspaceId).

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the warehouse snapshot.

.PARAMETER WarehouseSnapshotId
    The unique identifier of the warehouse snapshot to delete.

.EXAMPLE
    Remove-FabricWarehouseSnapshot -WorkspaceId "workspace-12345" -WarehouseSnapshotId "snapshot-67890"
    Deletes the warehouse snapshot with ID "snapshot-67890" from workspace "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Remove-FabricWarehouseSnapshot {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WarehouseSnapshotId
    )
    try {
        Invoke-FabricAuthCheck -ThrowOnFailure


        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/warehousesnapshots/{2}" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId, $WarehouseSnapshotId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $script:FabricAuthContext.FabricHeaders
            BaseURI = $apiEndpointURI
            Method  = 'Delete'
        }

        if ($PSCmdlet.ShouldProcess("Warehouse Snapshot '$WarehouseSnapshotId' in workspace '$WorkspaceId'", 'Delete')) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Warehouse Snapshot '$WarehouseSnapshotId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete Warehouse Snapshot '$WarehouseSnapshotId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
