<#
.SYNOPSIS
Retrieves a specific Eventstream destination from a workspace in Microsoft Fabric.

.DESCRIPTION
Get-FabricEventstreamDestination issues a GET request to the Fabric API to fetch details for a specific destination belonging to an Eventstream in a workspace. All three IDs (workspace, eventstream, destination) are required to identify the resource.

.PARAMETER WorkspaceId
(Mandatory) The workspace ID containing the eventstream.

.PARAMETER EventstreamId
(Mandatory) The eventstream ID that contains the destination.

.PARAMETER DestinationId
(Mandatory) The ID of the destination to retrieve.

.EXAMPLE
Get-FabricEventstreamDestination -WorkspaceId "12345" -EventstreamId "67890" -DestinationId "abcd"

Retrieves the destination with ID "abcd" from eventstream "67890" in workspace "12345".

.NOTES
- Requires the global $FabricConfig with BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to validate the authentication token before making the API call.

Author: Tiago Balabuch
#>

function Get-FabricEventstreamDestination {
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
        $apiEndpointURI = "{0}/workspaces/{1}/eventstreams/{2}/destinations/{3}" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventstreamId, $DestinationId
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
        Write-Message -Message "Failed to retrieve Eventstream Destination. Error: $errorDetails" -Level Error
    } 
}
