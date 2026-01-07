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
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$TagId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Token validation completed." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/v1/admin/tags/{1}" -f $FabricConfig.BaseUrl, $TagId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("tag '$TagId'", "Remove")) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Tag '$TagId' deleted successfully." -Level Info
            return $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete Warehouse '$WarehouseId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
