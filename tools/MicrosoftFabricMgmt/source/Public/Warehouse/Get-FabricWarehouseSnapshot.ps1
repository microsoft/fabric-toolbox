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

.PARAMETER Raw
If specified, returns the untouched API response with no added properties or type decoration.

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
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WarehouseSnapshotId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_]*$')]
        [string]$WarehouseSnapshotName,

        [Parameter()]
        [switch]$Raw
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
        if (-not $matchedItems) {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }

        if ($Raw) {
            return $matchedItems
        }

        Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug

        # Enrich with resolved workspace and capacity names
        $workspaceName = $null
        try {
            $workspaceName = Resolve-FabricWorkspaceName -WorkspaceId $WorkspaceId
        }
        catch {
            $workspaceName = $WorkspaceId
            Write-FabricLog -Message "Failed to resolve workspace name for ID '$WorkspaceId': $($_.Exception.Message)" -Level Debug
        }

        $capacityName = $null
        try {
            $capacityId = Resolve-FabricCapacityIdFromWorkspace -WorkspaceId $WorkspaceId
            if ($capacityId) {
                $capacityName = Resolve-FabricCapacityName -CapacityId $capacityId
            }
        }
        catch {
            Write-FabricLog -Message "Failed to resolve capacity name for workspace ID '$WorkspaceId': $($_.Exception.Message)" -Level Debug
        }

        foreach ($item in $matchedItems) {
            $item | Add-Member -NotePropertyName 'workspaceId'   -NotePropertyValue $WorkspaceId   -Force
            $item | Add-Member -NotePropertyName 'WorkspaceName' -NotePropertyValue $workspaceName -Force
            if ($null -ne $capacityName) {
                $item | Add-Member -NotePropertyName 'CapacityName' -NotePropertyValue $capacityName -Force
            }
        }

        $matchedItems | Add-FabricTypeName -TypeName 'MicrosoftFabric.WarehouseSnapshot'
        return $matchedItems
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Warehouse Snapshot. Error: $errorDetails" -Level Error
    }
}
