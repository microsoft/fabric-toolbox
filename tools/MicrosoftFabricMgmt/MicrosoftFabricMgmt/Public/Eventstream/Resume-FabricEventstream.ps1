<#
.SYNOPSIS
Resumes a paused Eventstream in a Microsoft Fabric workspace.

.DESCRIPTION
Sends a POST request to the Microsoft Fabric API to resume a specified Eventstream within a given workspace.
Ensures the authentication token is valid before making the API call.

.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace containing the Eventstream.

.PARAMETER EventstreamId
The unique identifier of the Eventstream to resume.

.EXAMPLE
Resume-FabricEventstream -WorkspaceId "workspace-12345" -EventstreamId "eventstream-67890"

.NOTES
- Requires the global $FabricConfig (BaseUrl and FabricHeaders).
- Calls Test-TokenExpired to verify the authentication token before making the request.

.AUTHOR
Tiago Balabuch
#>

function Resume-FabricEventstream {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamId
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI 
        $apiEndpointURI = "{0}/workspaces/{1}/eventstreams/{2}/resume" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventstreamId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams
        
        # Return the API response
        Write-Message -Message "Eventstream '$EventstreamId' resumed successfully!" -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to resume Eventstream. Error: $errorDetails" -Level Error
    }
}