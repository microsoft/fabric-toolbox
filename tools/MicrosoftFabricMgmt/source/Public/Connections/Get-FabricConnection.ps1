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

.PARAMETER Raw
    Returns the raw API response without any filtering or transformation. Use this switch when you need the complete, unprocessed response from the API.

.EXAMPLE
    Get-FabricConnection -ConnectionId "Connection-67890"
    Returns details for the connection with ID "Connection-67890".

.EXAMPLE
    Get-FabricConnection -ConnectionName "My Connection"
    Returns details for the connection named "My Connection".

.EXAMPLE
    Get-FabricConnection -Raw
    Returns the raw API response for all connections without any formatting or type decoration.

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
        [string]$ConnectionName,

        [Parameter(Mandatory = $false)]
        [switch]$Raw
    )

    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'connections'

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Apply filtering and output results
        Select-FabricResource -InputObject $dataItems -Id $ConnectionId -DisplayName $ConnectionName -ResourceType 'Connection' -TypeName 'MicrosoftFabric.Connection' -Raw:$Raw
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Connection. Error: $errorDetails" -Level Error
    }
}
