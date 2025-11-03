<#
.SYNOPSIS
Suspends (pauses) a source of an Eventstream in a Microsoft Fabric workspace.

.DESCRIPTION
Sends a POST request to the Microsoft Fabric API to pause a specific source of an Eventstream within a workspace.
Ensures the authentication token is valid before making the API call.

.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace.

.PARAMETER EventstreamId
The ID of the Eventstream containing the source.

.PARAMETER SourceId
The ID of the source to pause.

.EXAMPLE
Suspend-FabricEventstreamSource -WorkspaceId "workspace-12345" -EventstreamId "eventstream-67890" -SourceId "source-abcde"

.NOTES
Requires the global $FabricConfig (BaseUrl and FabricHeaders).
Calls Test-TokenExpired to validate the authentication token before making the request.

.AUTHOR
Tiago Balabuch
#>

function Suspend-FabricEventstreamSource {
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
        [string]$SourceId
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI 
        $apiEndpointURI = "{0}/workspaces/{1}/eventstreams/{2}/sources/{3}/pause" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventstreamId, $SourceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams
        
        # Return the API response
        Write-Message -Message "Eventstream '$EventstreamId' Source '$SourceId' paused successfully!" -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to pause Eventstream Source '$SourceId'. Error: $errorDetails" -Level Error
    }
}