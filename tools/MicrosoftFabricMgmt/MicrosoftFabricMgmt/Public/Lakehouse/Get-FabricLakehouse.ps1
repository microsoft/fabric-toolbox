<#
.SYNOPSIS
Retrieves an Lakehouse or a list of Lakehouses from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Get-FabricLakehouse` function sends a GET request to the Fabric API to retrieve Lakehouse details for a given workspace. It can filter the results by `LakehouseName`.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace to query Lakehouses.

.PARAMETER LakehouseName
(Optional) The name of the specific Lakehouse to retrieve.

.EXAMPLE
Get-FabricLakehouse -WorkspaceId "12345" -LakehouseName "Development"

Retrieves the "Development" Lakehouse from workspace "12345".

.EXAMPLE
Get-FabricLakehouse -WorkspaceId "12345"

Retrieves all Lakehouses in workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch  

#>
function Get-FabricLakehouse {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$LakehouseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$LakehouseName
    )
    try {   
        # Validate input parameters
        if ($LakehouseId -and $LakehouseName) {
            Write-Message -Message "Specify only one parameter: either 'LakehouseId' or 'LakehouseName'." -Level Error
            return $null
        }
        
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI   
        $apiEndpointURI = "{0}/workspaces/{1}/lakehouses" -f $FabricConfig.BaseUrl, $WorkspaceId
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
        if ($LakehouseId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $LakehouseId }, 'First')
        }
        elseif ($LakehouseName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $LakehouseName }, 'First')
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
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve Lakehouse. Error: $errorDetails" -Level Error
    } 
 
}
