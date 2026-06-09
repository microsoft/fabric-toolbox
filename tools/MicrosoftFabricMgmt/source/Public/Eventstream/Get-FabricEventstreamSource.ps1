<#
.SYNOPSIS
Retrieve a specific Eventstream source from a Microsoft Fabric workspace.

.DESCRIPTION
Get-FabricEventstreamSource sends a GET request to the Fabric API to fetch details for a single source belonging to an Eventstream in a workspace. All three identifiers (WorkspaceId, EventstreamId, SourceId) are required to locate the resource.

.PARAMETER WorkspaceId
The workspace ID that contains the Eventstream. (Required)

.PARAMETER EventstreamId
The Eventstream ID that contains the source. (Required)

.PARAMETER SourceId
The ID of the source to retrieve. (Required)

.EXAMPLE
Get-FabricEventstreamSource -WorkspaceId "12345" -EventstreamId "67890" -SourceId "abcd"
Retrieves source "abcd" from eventstream "67890" in workspace "12345".

.NOTES
- Requires the global $FabricConfig with BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to validate the authentication token before making the API call.
Author: Tiago Balabuch
#>

function Get-FabricEventstreamSource {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
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
        $apiEndpointURI = "$apiEndpointURI/sources/$SourceId"

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
        Write-FabricLog -Message "Failed to retrieve Eventstream Source. Error: $errorDetails" -Level Error
    }
}
