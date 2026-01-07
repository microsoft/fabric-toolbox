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
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ConnectionId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Token validation completed." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/connections/{1}" -f $FabricConfig.BaseUrl, $ConnectionId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        if ($PSCmdlet.ShouldProcess("Connection '$ConnectionId'", "Delete")) {
            # Make the API request
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Connection '$ConnectionId' deleted successfully." -Level Info
            return $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete Connection '$ConnectionId'. Error: $errorDetails" -Level Error
    }
}
