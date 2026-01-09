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
Requires the global $FabricConfig (BaseUrl and FabricHeaders).
Calls Test-TokenExpired to ensure the authentication token is valid before making the request.
         AUTHOR: - Tiago Balabuch
         Updated by Jess Pomfret and Rob Sewell November 2026
#>

function Resume-FabricEventstream {
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
        $apiEndpointURI = "$apiEndpointURI/resume"

        if ($PSCmdlet.ShouldProcess($EventstreamId, "Resume Eventstream in workspace '$WorkspaceId'")) {
            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Eventstream '$EventstreamId' resumed successfully!" -Level Host
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to resume Eventstream. Error: $errorDetails" -Level Error
    }
}
