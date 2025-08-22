<#
.SYNOPSIS
Pauses (suspends) a destination of an Eventstream in a Microsoft Fabric workspace.

.DESCRIPTION
Sends a POST request to the Microsoft Fabric API to pause a specific destination of an Eventstream within a workspace.
Validates the authentication token before making the API call.

.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace.

.PARAMETER EventstreamId
The ID of the Eventstream containing the destination.

.PARAMETER DestinationId
The ID of the destination to pause.

.EXAMPLE
Suspend-FabricEventstreamDestination -WorkspaceId "workspace-12345" -EventstreamId "eventstream-67890" -DestinationId "destination-abcde"

.NOTES
Requires the global $FabricConfig (BaseUrl and FabricHeaders).
Calls Test-TokenExpired to ensure the authentication token is valid before making the request.

.AUTHOR
Tiago Balabuch
#>

function Suspend-FabricEventstreamDestination {
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
        $apiEndpointURI = "{0}/workspaces/{1}/eventstreams/{2}/destinations/{3}/pause" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventstreamId, $DestinationId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams
        
        # Return the API response
        Write-Message -Message "Eventstream '$EventstreamId' destination '$DestinationId' paused successfully!" -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to pause Eventstream Destination '$DestinationId'. Error: $errorDetails" -Level Error
    }
}