<#
.SYNOPSIS
Suspends (pauses) a source of an Eventstream in a Microsoft Fabric workspace.
.DESCRIPTION
Sends a POST request to the Microsoft Fabric API to pause a specific source of an Eventstream within a workspace.
Ensures the authentication token is valid before making the API call.
.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace containing the Eventstream.
.PARAMETER EventstreamId
The unique identifier of the Eventstream whose source is to be paused.
.PARAMETER SourceId
The unique identifier of the source within the Eventstream to be paused.
.EXAMPLE
Suspend-FabricEventstreamSource -WorkspaceId "Workspace123" -EventstreamId "Eventstream123" -SourceId "Source123"
Pauses the source with ID "Source123" of the Eventstream "Eventstream123"

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
Author: Tiago Balabuch
Updated by Jess Pomfret and Rob Sewell November 2026

#>
function Suspend-FabricEventstreamSource {
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
        [string]$SourceId
    )
    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'eventstreams' -ItemId $EventstreamId
        $apiEndpointURI = "$apiEndpointURI/sources/$SourceId/pause"

        if ($PSCmdlet.ShouldProcess($SourceId, "Pause Eventstream source in workspace '$WorkspaceId' (Eventstream '$EventstreamId')")) {
            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Eventstream '$EventstreamId' Source '$SourceId' paused successfully!" -Level Info
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to pause Eventstream Source '$SourceId'. Error: $errorDetails" -Level Error
    }
}
