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

.PARAMETER Raw
    When specified, returns the raw API response without any filtering or formatting.

.EXAMPLE
     Get-FabricWarehouse -WorkspaceId "workspace-12345" -WarehouseId "warehouse-67890"
    This example retrieves the warehouse details for the warehouse with ID "warehouse-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
     Get-FabricWarehouse -WorkspaceId "workspace-12345" -WarehouseName "My Warehouse"
    This example retrieves the warehouse details for the warehouse named "My Warehouse" in the workspace with ID "workspace-12345".

.EXAMPLE
     Get-FabricWarehouse -WorkspaceId "workspace-12345" -Raw
    This example returns the raw API response for all warehouses in the workspace without any processing.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricWarehouse {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WarehouseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_]*$')]
        [string]$WarehouseName,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            # Validate input parameters
            if ($WarehouseId -and $WarehouseName) {
                Write-FabricLog -Message "Specify only one parameter: either 'WarehouseId' or 'WarehouseName'." -Level Error
                return
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

            # Apply filtering and formatting
            Select-FabricResource -InputObject $dataItems -Id $WarehouseId -DisplayName $WarehouseName -ResourceType 'Warehouse' -TypeName 'MicrosoftFabric.Warehouse' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Warehouse for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
