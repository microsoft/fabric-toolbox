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

.PARAMETER Raw
If specified, returns the raw API response without any transformation or filtering.

.EXAMPLE
Get-FabricMirroredWarehouse -WorkspaceId "12345" -MirroredWarehouseId "aaaaaaaa-bbbb-cccc-dddd-ffffffffffff"

Returns the single mirrored warehouse matching the provided Id.

.EXAMPLE
Get-FabricMirroredWarehouse -WorkspaceId "12345" -MirroredWarehouseName "Development"

Retrieves the mirrored warehouse named "Development" from workspace 12345.

.EXAMPLE
Get-FabricMirroredWarehouse -WorkspaceId "12345"

Lists all mirrored warehouses present in the specified workspace.

.EXAMPLE
Get-FabricMirroredWarehouse -WorkspaceId "12345" -Raw

Retrieves all mirrored warehouses in the workspace with raw API response format.

.NOTES
- Requires `$FabricConfig` global configuration, including BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Get-FabricMirroredWarehouse {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredWarehouseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$MirroredWarehouseName,

        [Parameter(Mandatory = $false)]
        [switch]$Raw
    )

    process {
        try {
            # Validate input parameters
            if ($MirroredWarehouseId -and $MirroredWarehouseName) {
                Write-FabricLog -Message "Specify only one parameter: either 'MirroredWarehouseId' or 'MirroredWarehouseName'." -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure


            # Construct the API endpoint URI
            $apiEndpointURI = "{0}/workspaces/{1}/MirroredWarehouses" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering and formatting
            Select-FabricResource -InputObject $dataItems -Id $MirroredWarehouseId -DisplayName $MirroredWarehouseName -ResourceType 'MirroredWarehouse' -TypeName 'MicrosoftFabric.MirroredWarehouse' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve MirroredWarehouse for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
