<#
.SYNOPSIS
    Deletes a connection from Microsoft Fabric.

.DESCRIPTION
    Sends a DELETE request to the Microsoft Fabric API to remove a connection by its ConnectionId.

.PARAMETER ConnectionId
    The unique identifier of the connection to delete.

.EXAMPLE
    Remove-FabricConnection -ConnectionId "Connection-67890"
    Removes the connection with ID "Connection-67890".

.NOTES
    - Requires `$FabricConfig` with `BaseUrl` and `FabricHeaders`.
    - Validates authentication token before API call.

    Author: Tiago Balabuch
#>
function Remove-FabricConnection {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ConnectionId
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/connections/{1}" -f $FabricConfig.BaseUrl, $ConnectionId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Delete'
        }
        $response = Invoke-FabricAPIRequest @apiParams
        
        # Return the API response
        Write-Message -Message "Connection '$ConnectionId' deleted successfully." -Level Info
        return $response

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to delete Connection '$ConnectionId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
