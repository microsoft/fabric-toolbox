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
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WarehouseId,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_]*$')]
        [Alias('displayName')]
        [string]$WarehouseName,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('description')]
        [string]$WarehouseDescription
    )
    process {
    try {
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Validate that at least one update parameter is provided
        if (-not $WarehouseName -and -not $WarehouseDescription) {
            Write-FabricLog -Message "At least one parameter (WarehouseName or WarehouseDescription) must be provided." -Level Error
            return
        }

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/warehouses/{2}" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId, $WarehouseId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body with only the properties that are provided
        $body = @{}

        if ($WarehouseName) {
            $body.displayName = $WarehouseName
        }

        if ($WarehouseDescription) {
            $body.description = $WarehouseDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $script:FabricAuthContext.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Patch'
            Body = $bodyJson
        }

        $targetDescription = if ($WarehouseName) { "Warehouse '$WarehouseId' to '$WarehouseName'" } else { "Warehouse '$WarehouseId'" }
        if ($PSCmdlet.ShouldProcess("$targetDescription in workspace '$WorkspaceId'", 'Update')) {
            $response = Invoke-FabricAPIRequest @apiParams
            # Return the API response
            Write-FabricLog -Message "Warehouse updated successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Warehouse. Error: $errorDetails" -Level Error
    }
    }
}
