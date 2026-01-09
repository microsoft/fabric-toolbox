<#
.SYNOPSIS
Gets Warehouse Snapshots or a specific Warehouse Snapshot in a workspace.

.DESCRIPTION
The Get-FabricWarehouseSnapshot cmdlet retrieves Warehouse Snapshot items for a given workspace. You can list all
snapshots or filter by snapshot Id or display name. Only one of WarehouseSnapshotId or WarehouseSnapshotName may be used.

.PARAMETER WorkspaceId
The GUID of the workspace that contains the warehouse snapshots. Required to scope the API request.

.PARAMETER WarehouseSnapshotId
Optional. When provided, returns only the snapshot matching this resource Id. Prefer this for exact retrieval when the
Id is already known from a previous call.

.PARAMETER WarehouseSnapshotName
Optional. When provided, returns only the snapshot whose display name exactly matches this value. Do not combine with
WarehouseSnapshotId.

.EXAMPLE
Get-FabricWarehouseSnapshot -WorkspaceId "workspace-12345" -WarehouseSnapshotId "snap-67890"

Returns the specific warehouse snapshot with the given Id.

.EXAMPLE
Get-FabricWarehouseSnapshot -WorkspaceId "workspace-12345" -WarehouseSnapshotName "Nightly Backup"

Returns the snapshot named "Nightly Backup" if present.

.EXAMPLE
Get-FabricWarehouseSnapshot -WorkspaceId "workspace-12345"

Lists all warehouse snapshots in the workspace.

.NOTES
    - Requires `$FabricConfig` global configuration, including BaseUrl and FabricHeaders.
    - Calls Test-TokenExpired to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricWarehouseSnapshot {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WarehouseSnapshotId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$WarehouseSnapshotName
    )

    try {
        # Validate input parameters
        if ($WarehouseSnapshotId -and $WarehouseSnapshotName) {
            Write-FabricLog -Message "Specify only one parameter: either 'WarehouseSnapshotId' or 'WarehouseSnapshotName'." -Level Error
            return $null
        }

        Invoke-FabricAuthCheck -ThrowOnFailure


        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/warehousesnapshots" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($WarehouseSnapshotId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $WarehouseSnapshotId }, 'First')
        }
        elseif ($WarehouseSnapshotName) {
            $matchedItems = $dataItems.Where({ $_.displayName -eq $WarehouseSnapshotName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Warehouse Snapshot. Error: $errorDetails" -Level Error
    }
}
