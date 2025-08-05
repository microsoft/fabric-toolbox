<#
.SYNOPSIS
    Creates a new warehouse in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to the Microsoft Fabric API to create a new warehouse 
    in the specified workspace. It supports optional parameters for warehouse description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the warehouse will be created. This parameter is mandatory.

.PARAMETER WarehouseName
    The name of the warehouse to be created. This parameter is mandatory.

.PARAMETER WarehouseDescription
    An optional description for the warehouse.

.PARAMETER WarehouseCollation
    An optional collation for the warehouse.

.EXAMPLE
    New-FabricWarehouse -WorkspaceId "workspace-12345" -WarehouseName "New Warehouse" -WarehouseDescription "Description of the new warehouse"
    This example creates a new warehouse named "New Warehouse" in the workspace with ID "workspace-12345" with the provided description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function New-FabricWarehouse {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$WarehouseName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WarehouseDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('Latin1_General_100_BIN2_UTF8', 'Latin1_General_100_CI_AS_KS_WS_SC_UTF8')]
        [string]$WarehouseCollation = 'Latin1_General_100_BIN2_UTF8'
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/warehouses" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $WarehouseName
        }

        if ($WarehouseDescription) {
            $body.description = $WarehouseDescription
        }

        if ($WarehouseCollation) {
            $body.creationPayload = @{
                collationType = $WarehouseCollation
            }
        }

        # Convert the body to JSON format
        $bodyJson = $body | ConvertTo-Json -Depth 4
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Post'
            Body    = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-Message -Message "Data Warehouse created successfully!" -Level Info        
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to create Warehouse. Error: $errorDetails" -Level Error
    }
}