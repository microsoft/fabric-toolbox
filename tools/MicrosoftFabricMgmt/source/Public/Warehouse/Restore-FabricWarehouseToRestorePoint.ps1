<#
.SYNOPSIS
    Restores a Microsoft Fabric warehouse in-place to a specified restore point.

.DESCRIPTION
    The Restore-FabricWarehouseToRestorePoint function sends a POST request to the
    /workspaces/{workspaceId}/warehouses/{warehouseId}/restorePoints/{restorePointId}/restore
    endpoint to restore a warehouse in-place to the state captured by the specified
    restore point. The API supports long running operations. No request body is sent.

.PARAMETER WorkspaceId
    (Mandatory) The unique identifier of the workspace containing the warehouse.

.PARAMETER WarehouseId
    (Mandatory) The unique identifier of the warehouse to restore.

.PARAMETER RestorePointId
    (Mandatory) The unique identifier of the restore point to restore the warehouse to.

.EXAMPLE
    Restore-FabricWarehouseToRestorePoint -WorkspaceId "12345" -WarehouseId "67890" -RestorePointId "rp-1"

    Restores the warehouse in-place to the specified restore point.

.NOTES
    - API Endpoint: POST /workspaces/{workspaceId}/warehouses/{warehouseId}/restorePoints/{restorePointId}/restore
    - Requires `$FabricAuthContext` global configuration, including BaseUrl and FabricHeaders.
    - Calls Invoke-FabricAuthCheck to ensure token validity before making the API request.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Restore-FabricWarehouseToRestorePoint {
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

            $segments = @('workspaces', $WorkspaceId, 'warehouses', $WarehouseId, 'restorePoints', $RestorePointId, 'restore')
            $apiEndpointURI = New-FabricAPIUri -Segments $segments
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
            }

            $target = "Warehouse '$WarehouseId' in workspace '$WorkspaceId'"
            $action = "Restore to restore point '$RestorePointId'"
            if ($PSCmdlet.ShouldProcess($target, $action)) {
                $null = Invoke-FabricAPIRequest @apiParams
                Write-FabricLog -Message "Warehouse '$WarehouseId' restored to restore point '$RestorePointId' successfully!" -Level Host
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to restore Warehouse to Restore Point. Error: $errorDetails" -Level Error
        }
    }
}
