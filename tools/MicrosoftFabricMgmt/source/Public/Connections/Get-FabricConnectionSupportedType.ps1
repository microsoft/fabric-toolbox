<#
.SYNOPSIS
    Retrieves connection details from a Microsoft Fabric workspace.

.DESCRIPTION
    Fetches connection information from a workspace, optionally filtered by GatewayId or ConnectionName.
    Ensures authentication, constructs the API endpoint, performs the request, and returns the results.

.PARAMETER GatewayId
    Optional. The unique identifier of the connection.

.PARAMETER ConnectionName
    Optional. The display name of the connection.

.PARAMETER ShowAllCreationMethods
    Optional. When set, includes all available creation methods for each supported connection type in the response. This is useful to discover which connection types can be created programmatically or through the UI.

.EXAMPLE
    Get-FabricConnection -GatewayId "Connection-67890"
    Returns details for the connection with ID "Connection-67890".

.EXAMPLE
    Get-FabricConnection -ConnectionName "My Connection"
    Returns details for the connection named "My Connection".

.NOTES
    - Requires `$FabricConfig` with `BaseUrl` and `FabricHeaders`.
    - Uses `Test-TokenExpired` for authentication validation.

    Author: Tiago Balabuch
#>
function Get-FabricConnectionSupportedType {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GatewayId,

        [Parameter(Mandatory = $false)]
        [switch]$ShowAllCreationMethods
    )

    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Build query parameters dynamically
        $queryHash = @{}
        if ($GatewayId) {
            $queryHash['gatewayId'] = $GatewayId
        }
        if ($ShowAllCreationMethods) {
            $queryHash['showAllCreationMethods'] = 'true'
        }

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'connections' -Subresource 'supportedConnectionTypes' -QueryParameters $queryHash

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method  = 'Get'
        }
        Invoke-FabricAPIRequest @apiParams
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Connection. Error: $errorDetails" -Level Error
    }
}
