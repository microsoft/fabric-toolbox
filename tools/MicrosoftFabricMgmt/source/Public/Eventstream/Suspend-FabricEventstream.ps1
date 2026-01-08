<#
.SYNOPSIS
Suspends (pauses) an existing Eventstream in a Microsoft Fabric workspace.

.DESCRIPTION
Sends a POST request to the Microsoft Fabric API to pause a specified Eventstream within a given workspace.
Validates the authentication token before making the API call.

.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace containing the Eventstream.

.PARAMETER EventstreamId
The unique identifier of the Eventstream to suspend.

.EXAMPLE
Suspend-FabricEventstream -WorkspaceId "workspace-12345" -EventstreamId "eventstream-67890"

.NOTES

Author: Updated by Jess Pomfret and Rob Sewell November 2026
#>

function Suspend-FabricEventstream {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamId
    )
    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'eventstreams' -ItemId $EventstreamId
        $apiEndpointURI = "$apiEndpointURI/pause"

        if ($PSCmdlet.ShouldProcess($EventstreamId, "Pause Eventstream in workspace '$WorkspaceId'")) {
            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Eventstream '$EventstreamId' paused successfully!" -Level Info
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to pause Eventstream. Error: $errorDetails" -Level Error
    }
}
