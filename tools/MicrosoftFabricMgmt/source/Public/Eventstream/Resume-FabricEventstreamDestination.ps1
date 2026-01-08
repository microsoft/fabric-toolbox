<#
.SYNOPSIS
Resumes a destination of an Eventstream in a Microsoft Fabric workspace.

.DESCRIPTION
Sends a POST request to the Microsoft Fabric API to resume a specific destination of an Eventstream within a workspace.
Validates the authentication token before making the API call.

.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace.

.PARAMETER EventstreamId
The ID of the Eventstream containing the destination.

.PARAMETER DestinationId
The ID of the destination to resume.

.EXAMPLE
Resume-FabricEventstreamDestination -WorkspaceId "workspace-12345" -EventstreamId "eventstream-67890" -DestinationId "destination-abcde"

.NOTES
Requires the global $FabricConfig (BaseUrl and FabricHeaders).
Calls Test-TokenExpired to ensure the authentication token is valid before making the request.
    :     AUTHOR: - Tiago Balabuch
         Updated by Jess Pomfret and Rob Sewell November 2026
#>

function Resume-FabricEventstreamDestination {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
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
        $apiEndpointURI = "$apiEndpointURI/destinations/$DestinationId/resume"

        if ($PSCmdlet.ShouldProcess($DestinationId, "Resume Eventstream destination in workspace '$WorkspaceId' (Eventstream '$EventstreamId')")) {
            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Eventstream '$EventstreamId' destination '$DestinationId' resumed successfully!" -Level Info
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to resume Eventstream Destination '$DestinationId'. Error: $errorDetails" -Level Error
    }
}
