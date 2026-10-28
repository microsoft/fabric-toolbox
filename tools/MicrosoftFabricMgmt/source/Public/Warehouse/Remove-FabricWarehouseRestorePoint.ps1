<#
.SYNOPSIS
    Removes a restore point from a Microsoft Fabric warehouse.

.DESCRIPTION
    The Remove-FabricWarehouseRestorePoint function sends a DELETE request to the
    /workspaces/{workspaceId}/warehouses/{warehouseId}/restorePoints/{restorePointId}
    endpoint to delete a user-defined restore point. System generated restore points
    cannot be deleted.

.PARAMETER WorkspaceId
    (Mandatory) The unique identifier of the workspace containing the warehouse.

.PARAMETER WarehouseId
    (Mandatory) The unique identifier of the warehouse containing the restore point.

.PARAMETER RestorePointId
    (Mandatory) The unique identifier of the restore point to delete.

.EXAMPLE
    Remove-FabricWarehouseRestorePoint -WorkspaceId "12345" -WarehouseId "67890" -RestorePointId "rp-1"

    Removes the specified restore point from the warehouse.

.NOTES
    - API Endpoint: DELETE /workspaces/{workspaceId}/warehouses/{warehouseId}/restorePoints/{restorePointId}
    - Requires `$FabricAuthContext` global configuration, including BaseUrl and FabricHeaders.
    - Calls Invoke-FabricAuthCheck to ensure token validity before making the API request.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Remove-FabricWarehouseRestorePoint {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WarehouseId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$RestorePointId
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $segments = @('workspaces', $WorkspaceId, 'warehouses', $WarehouseId, 'restorePoints', $RestorePointId)
            $apiEndpointURI = New-FabricAPIUri -Segments $segments
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Delete'
            }

            $target = "Restore point '$RestorePointId' on warehouse '$WarehouseId'"
            if ($PSCmdlet.ShouldProcess($target, "Remove Warehouse restore point")) {
                $null = Invoke-FabricAPIRequest @apiParams
                Write-FabricLog -Message "Restore point '$RestorePointId' removed successfully!" -Level Host
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to remove Warehouse Restore Point. Error: $errorDetails" -Level Error
        }
    }
}
