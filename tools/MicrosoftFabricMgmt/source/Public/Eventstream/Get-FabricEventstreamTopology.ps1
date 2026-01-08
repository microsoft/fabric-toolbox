<#
.SYNOPSIS
Retrieve the topology for an Eventstream in a Microsoft Fabric workspace.

.DESCRIPTION
Get-FabricEventstreamTopology sends a GET request to the Fabric API to obtain the topology for a specified Eventstream within a workspace. The function validates the authentication token before making the API call and returns the topology object or $null if no data is returned.

.PARAMETER WorkspaceId
The workspace ID that contains the Eventstream. (Required)

.PARAMETER EventstreamId
The Eventstream ID whose topology will be retrieved. (Required)

.EXAMPLE
Get-FabricEventstreamTopology -WorkspaceId "12345" -EventstreamId "67890"
Retrieves the topology for eventstream "67890" in workspace "12345".

.NOTES
- Requires the global $FabricConfig with BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to validate the authentication token prior to the API request.
Author: Tiago Balabuch
#>

function Get-FabricEventstreamTopology {
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
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'eventstreams' -ItemId $EventstreamId
        $apiEndpointURI = "$apiEndpointURI/topology"

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method  = 'Get'
        }
        Invoke-FabricAPIRequest @apiParams
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Eventstream Topology. Error: $errorDetails" -Level Error
    }
}
