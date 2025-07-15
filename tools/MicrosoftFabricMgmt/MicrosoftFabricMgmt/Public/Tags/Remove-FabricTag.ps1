<#
.SYNOPSIS
    Removes a tag from Microsoft Fabric.

.DESCRIPTION
    Sends a DELETE request to the Microsoft Fabric API to remove a tag specified by TagId.
    Ensures authentication is valid before making the API call.

.PARAMETER TagId
    The unique identifier of the tag to remove.

.EXAMPLE
    Remove-FabricTag -TagId "tag-12345"
    Removes the tag with ID "tag-12345" from Microsoft Fabric.

.NOTES
    - Requires the global `$FabricConfig` object with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to validate authentication before the API request.

    Author: Tiago Balabuch
#>
function Remove-FabricTag {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$TagId
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/v1/admin/tags/{1}" -f $FabricConfig.BaseUrl, $TagId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Delete'
        }
        $response = Invoke-FabricAPIRequest @apiParams
        
        # Return the API response
        Write-Message -Message "Warehouse '$WarehouseId' deleted successfully from workspace '$WorkspaceId'." -Level Info
        return $response

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to delete Warehouse '$WarehouseId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
