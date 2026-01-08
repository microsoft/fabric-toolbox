<#
.SYNOPSIS
Resumes a source of an Eventstream in a Microsoft Fabric workspace.

.DESCRIPTION
Sends a POST request to the Microsoft Fabric API to resume a specific source of an Eventstream within a workspace.
Validates the authentication token before making the API call.

.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace.

.PARAMETER EventstreamId
The ID of the Eventstream containing the source.

.PARAMETER SourceId
The ID of the source to resume.

.EXAMPLE
Resume-FabricEventstreamSource -WorkspaceId "workspace-12345" -EventstreamId "eventstream-67890" -SourceId "source-abcde"

.NOTES
Requires the global $FabricConfig (BaseUrl and FabricHeaders).
Calls Test-TokenExpired to ensure the authentication token is valid before making the request.

Author: Updated by Jess Pomfret and Rob Sewell November 2026
Tiago Balabuch
#>

function Resume-FabricEventstreamSource {
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
        $apiEndpointURI = "$apiEndpointURI/sources/$SourceId/resume"

        if ($PSCmdlet.ShouldProcess($SourceId, "Resume Eventstream source in workspace '$WorkspaceId' (Eventstream '$EventstreamId')")) {
            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Eventstream '$EventstreamId' Source '$SourceId' resumed successfully!" -Level Info
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to resume Eventstream Source '$SourceId'. Error: $errorDetails" -Level Error
    }
}
