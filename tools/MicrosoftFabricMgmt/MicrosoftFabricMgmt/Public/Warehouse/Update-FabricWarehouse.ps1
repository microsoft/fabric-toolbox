<#
.SYNOPSIS
    Updates an existing warehouse in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update an existing warehouse 
    in the specified workspace. It supports optional parameters for warehouse description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the warehouse exists. This parameter is optional.

.PARAMETER WarehouseId
    The unique identifier of the warehouse to be updated. This parameter is mandatory.

.PARAMETER WarehouseName
    The new name of the warehouse. This parameter is mandatory.

.PARAMETER WarehouseDescription
    An optional new description for the warehouse.

.EXAMPLE
    Update-FabricWarehouse -WorkspaceId "workspace-12345" -WarehouseId "warehouse-67890" -WarehouseName "Updated Warehouse" -WarehouseDescription "Updated description"
    This example updates the warehouse with ID "warehouse-67890" in the workspace with ID "workspace-12345" with a new name and description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
    
#>
function Update-FabricWarehouse {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,   
        
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WarehouseId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$WarehouseName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WarehouseDescription
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/warehouses/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $WarehouseId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $WarehouseName
        }

        if ($WarehouseDescription) {
            $body.description = $WarehouseDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-Message -Message "Request Body: $bodyJson" -Level Debug
        
        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Patch'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams 
        # Return the API response
        Write-Message -Message "Warehouse '$WarehouseName' updated successfully!" -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update Warehouse. Error: $errorDetails" -Level Error
    }
}
