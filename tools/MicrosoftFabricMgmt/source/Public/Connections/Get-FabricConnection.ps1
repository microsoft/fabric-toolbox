<#
.SYNOPSIS
    Retrieves connection details from a Microsoft Fabric workspace.

.DESCRIPTION
    Fetches connection information from a workspace, optionally filtered by ConnectionId or ConnectionName.
    Ensures authentication, constructs the API endpoint, performs the request, and returns the results.

.PARAMETER ConnectionId
    Optional. The unique identifier of the connection.

.PARAMETER ConnectionName
    Optional. The display name of the connection.

.EXAMPLE
    Get-FabricConnection -ConnectionId "Connection-67890"
    Returns details for the connection with ID "Connection-67890".

.EXAMPLE
    Get-FabricConnection -ConnectionName "My Connection"
    Returns details for the connection named "My Connection".

.NOTES
    - Requires `$FabricConfig` with `BaseUrl` and `FabricHeaders`.
    - Uses `Test-TokenExpired` for authentication validation.

    Author: Tiago Balabuch
#>
function Get-FabricConnection {
    [CmdletBinding(DefaultParameterSetName = 'Id')]
    param (
        [Parameter(Mandatory = $false, ParameterSetName = 'Id')]
        [ValidateNotNullOrEmpty()]
        [string]$ConnectionId,

        [Parameter(Mandatory = $false, ParameterSetName = 'Name')]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$ConnectionName
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/connections" -f $FabricConfig.BaseUrl

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($ConnectionId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $ConnectionId }, 'First')
        }
        elseif ($ConnectionName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $ConnectionName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Connection. Error: $errorDetails" -Level Error
    }
}
