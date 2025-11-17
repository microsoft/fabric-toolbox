<#
.SYNOPSIS
Gets a Mirrored Warehouse or lists all Mirrored Warehouses in a workspace.

.DESCRIPTION
The Get-FabricMirroredWarehouse cmdlet retrieves Mirrored Warehouse items from a Microsoft Fabric workspace.
You can return every mirrored warehouse or filter by an exact display name or Id. Only one of MirroredWarehouseId or
MirroredWarehouseName may be provided; specifying both will result in a validation error.

.PARAMETER WorkspaceId
The GUID of the workspace to query. This is required for all calls and determines which Fabric workspace’s mirrored
warehouses will be returned.

.PARAMETER MirroredWarehouseId
Optional. When supplied, returns only the mirrored warehouse matching this resource Id. Prefer using the Id when you
already captured it from a prior listing operation for more precise retrieval.

.PARAMETER MirroredWarehouseName
Optional. When supplied, returns only the mirrored warehouse whose display name exactly matches this string. Use this
when the Id is not known. Do not combine with MirroredWarehouseId.

.EXAMPLE
Get-FabricMirroredWarehouse -WorkspaceId "12345" -MirroredWarehouseId "aaaaaaaa-bbbb-cccc-dddd-ffffffffffff"

Returns the single mirrored warehouse matching the provided Id.

.EXAMPLE
Get-FabricMirroredWarehouse -WorkspaceId "12345" -MirroredWarehouseName "Development"

Retrieves the mirrored warehouse named "Development" from workspace 12345.

.EXAMPLE
Get-FabricMirroredWarehouse -WorkspaceId "12345"

Lists all mirrored warehouses present in the specified workspace.

.NOTES
- Requires `$FabricConfig` global configuration, including BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Get-FabricMirroredWarehouse {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredWarehouseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$MirroredWarehouseName
    )
    try {
        # Validate input parameters
        if ($MirroredWarehouseId -and $MirroredWarehouseName) {
            Write-Message -Message "Specify only one parameter: either 'MirroredWarehouseId' or 'MirroredWarehouseName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/MirroredWarehouses" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-Message -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($MirroredWarehouseId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $MirroredWarehouseId }, 'First')
        }
        elseif ($MirroredWarehouseName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $MirroredWarehouseName }, 'First')
        }
        else {
            Write-Message -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-Message -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-Message -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Step 10: Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve MirroredWarehouse. Error: $errorDetails" -Level Error
    }

}
