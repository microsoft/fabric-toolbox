<#
.SYNOPSIS
Retrieves an MirroredWarehouse or a list of MirroredWarehouses from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Get-FabricMirroredWarehouse` function sends a GET request to the Fabric API to retrieve MirroredWarehouse details for a given workspace. It can filter the results by `MirroredWarehouseName`.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace to query MirroredWarehouses.

.PARAMETER MirroredWarehouseName
(Optional) The name of the specific MirroredWarehouse to retrieve.

.EXAMPLE
Get-FabricMirroredWarehouse -WorkspaceId "12345" -MirroredWarehouseName "Development"

Retrieves the "Development" MirroredWarehouse from workspace "12345".

.EXAMPLE
Get-FabricMirroredWarehouse -WorkspaceId "12345"

Retrieves all MirroredWarehouses in workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

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
