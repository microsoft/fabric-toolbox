<#
.SYNOPSIS
    Retrieves restore points for a Microsoft Fabric warehouse.

.DESCRIPTION
    The Get-FabricWarehouseRestorePoint function retrieves restore points for a warehouse.

    When -RestorePointId is supplied it returns the single matching restore point via
    /workspaces/{workspaceId}/warehouses/{warehouseId}/restorePoints/{restorePointId};
    otherwise it lists all restore points via
    /workspaces/{workspaceId}/warehouses/{warehouseId}/restorePoints.

    By default each returned object is enriched with the originating WorkspaceId (stamped
    from the parameter) and a resolved WorkspaceName, and decorated for the custom table
    view. Pass -Raw to return the untouched API response.

.PARAMETER WorkspaceId
    (Mandatory) The unique identifier of the workspace containing the warehouse.

.PARAMETER WarehouseId
    (Mandatory) The unique identifier of the warehouse whose restore points are retrieved.

.PARAMETER RestorePointId
    (Optional) The unique identifier of a single restore point to retrieve.

.PARAMETER Raw
    If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
    Get-FabricWarehouseRestorePoint -WorkspaceId "12345" -WarehouseId "67890"

    Lists all restore points for the warehouse, enriched with WorkspaceName.

.EXAMPLE
    Get-FabricWarehouseRestorePoint -WorkspaceId "12345" -WarehouseId "67890" -RestorePointId "rp-1"

    Returns the single restore point with that ID.

.OUTPUTS
    System.Object
    Restore point object(s) with all API-returned properties plus WorkspaceName when enriched.

.NOTES
    - API Endpoints:
        GET /workspaces/{workspaceId}/warehouses/{warehouseId}/restorePoints
        GET /workspaces/{workspaceId}/warehouses/{warehouseId}/restorePoints/{restorePointId}
    - Requires `$FabricAuthContext` global configuration, including BaseUrl and FabricHeaders.
    - Calls Invoke-FabricAuthCheck to ensure token validity before making the API request.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Get-FabricWarehouseRestorePoint {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WarehouseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$RestorePointId,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Build the segment list, appending RestorePointId only when a single restore point is requested.
            $segments = @('workspaces', $WorkspaceId, 'warehouses', $WarehouseId, 'restorePoints')
            if ($RestorePointId) { $segments += $RestorePointId }
            $apiEndpointURI = New-FabricAPIUri -Segments $segments
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No restore points returned for warehouse '$WarehouseId'." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            # Resolve the workspace display name once for all returned restore points.
            $workspaceName = $WorkspaceId
            try {
                $workspaceName = Resolve-FabricWorkspaceName -WorkspaceId $WorkspaceId
            }
            catch {
                Write-FabricLog -Message "Failed to resolve workspace name for ID '$WorkspaceId': $($_.Exception.Message)" -Level Debug
            }

            foreach ($item in $response) {
                $item | Add-Member -NotePropertyName 'workspaceId'   -NotePropertyValue $WorkspaceId   -Force
                $item | Add-Member -NotePropertyName 'WorkspaceName' -NotePropertyValue $workspaceName -Force
            }

            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.WarehouseRestorePoint'
            $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Warehouse Restore Point. Error: $errorDetails" -Level Error
        }
    }
}
