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
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/eventstreams/{2}/destinations/{3}/connection" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventstreamId, $DestinationId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug
         
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams
   
        # Immediately handle empty response
        if (-not $dataItems) {
            Write-Message -Message "No data returned from the API." -Level Warning
            return $null
        }
        else {
            Write-Message -Message "No filter provided. Returning all items." -Level Debug
            return $dataItems
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve Eventstream Destination Connection. Error: $errorDetails" -Level Error
    } 
}