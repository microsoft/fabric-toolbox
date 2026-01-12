<#
.SYNOPSIS
    Retrieves warehouse details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves warehouse details from a specified workspace using either the provided WarehouseId or WarehouseName.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the warehouse exists. This parameter is mandatory.

.PARAMETER WarehouseId
    The unique identifier of the warehouse to retrieve. This parameter is optional.

.PARAMETER WarehouseName
    The name of the warehouse to retrieve. This parameter is optional.

.EXAMPLE
     Get-FabricWarehouse -WorkspaceId "workspace-12345" -WarehouseId "warehouse-67890"
    This example retrieves the warehouse details for the warehouse with ID "warehouse-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
     Get-FabricWarehouse -WorkspaceId "workspace-12345" -WarehouseName "My Warehouse"
    This example retrieves the warehouse details for the warehouse named "My Warehouse" in the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricWarehouse {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WarehouseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$WarehouseName
    )

    try {
        # Validate input parameters
        if ($WarehouseId -and $WarehouseName) {
            Write-FabricLog -Message "Specify only one parameter: either 'WarehouseId' or 'WarehouseName'." -Level Error
            return $null
        }

        Invoke-FabricAuthCheck -ThrowOnFailure


        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/warehouses" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId

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
        if ($WarehouseId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $WarehouseId }, 'First')
        }
        elseif ($WarehouseName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $WarehouseName }, 'First')
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
        Write-FabricLog -Message "Failed to retrieve Warehouse. Error: $errorDetails" -Level Error
    }
}
