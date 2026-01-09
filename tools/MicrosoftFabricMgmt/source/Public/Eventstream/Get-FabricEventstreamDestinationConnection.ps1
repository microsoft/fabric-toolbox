<#
.SYNOPSIS
Retrieves the connection details for a specific Eventstream destination in a Microsoft Fabric workspace.

.DESCRIPTION
Get-FabricEventstreamDestinationConnection issues a GET request to the Fabric API to fetch the connection information for a destination associated with an Eventstream. All three IDs are required to locate the resource.

.PARAMETER WorkspaceId
[string] (Mandatory) The workspace ID that contains the Eventstream.

.PARAMETER EventstreamId
[string] (Mandatory) The Eventstream ID that contains the destination.

.PARAMETER DestinationId
[string] (Mandatory) The destination ID whose connection details will be retrieved.

.EXAMPLE
Get-FabricEventstreamDestinationConnection -WorkspaceId "12345" -EventstreamId "67890" -DestinationId "abcd"
# Retrieves the connection details for destination "abcd" under eventstream "67890" in workspace "12345".

.OUTPUTS
Typically returns a PSCustomObject with the destination connection details, or $null if no data is returned.

.NOTES
- Requires the global $FabricConfig with BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to validate the authentication token before making the API call.
- Errors are caught and logged; the function returns $null on failure.

Author: Tiago Balabuch
#>

function Get-FabricEventstreamDestinationConnection {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DestinationId
    )
    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'eventstreams' -ItemId $EventstreamId
        $apiEndpointURI = "$apiEndpointURI/destinations/$DestinationId/connection"

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
        Write-FabricLog -Message "Failed to retrieve Eventstream Destination Connection. Error: $errorDetails" -Level Error
    }
}
