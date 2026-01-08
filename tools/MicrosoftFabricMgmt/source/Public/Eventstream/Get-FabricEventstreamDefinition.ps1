
<#
.SYNOPSIS
Retrieves the definition of a Eventstream from a specific workspace in Microsoft Fabric.

.DESCRIPTION
This function fetches the Eventstream's content or metadata from a workspace.
Handles both synchronous and asynchronous operations, with detailed logging and error handling.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace from which the Eventstream definition is to be retrieved.

.PARAMETER EventstreamId
(Optional)The unique identifier of the Eventstream whose definition needs to be retrieved.

.PARAMETER EventstreamFormat
Specifies the format of the Eventstream definition. Currently, only 'ipynb' is supported.
Default: 'ipynb'.

.EXAMPLE
Get-FabricEventstreamDefinition -WorkspaceId "12345" -EventstreamId "67890"

Retrieves the definition of the Eventstream with ID `67890` from the workspace with ID `12345` in the `ipynb` format.

.EXAMPLE
Get-FabricEventstreamDefinition -WorkspaceId "12345"

Retrieves the definitions of all Eventstreams in the workspace with ID `12345` in the `ipynb` format.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Handles long-running operations asynchronously.

Author: Updated by Jess Pomfret and Rob Sewell November 2026
#>
function Get-FabricEventstreamDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamFormat
    )
    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI with optional format parameter
        $queryParams = if ($EventstreamFormat) {
            @{ format = $EventstreamFormat }
        } else {
            $null
        }

        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'eventstreams' -ItemId $EventstreamId -QueryParameters $queryParams
        $apiEndpointURI = $apiEndpointURI -replace '/eventstreams/([^/]+)$', '/eventstreams/$1/getDefinition'

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method  = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-FabricLog -Message "Eventstream '$EventstreamId' definition retrieved successfully!" -Level Info
        $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Eventstream. Error: $errorDetails" -Level Error
    }

}
