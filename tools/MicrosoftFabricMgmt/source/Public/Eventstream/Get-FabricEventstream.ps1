<#
.SYNOPSIS
Retrieves a specific Eventstream or all Eventstreams from a workspace in Microsoft Fabric.

.DESCRIPTION
Queries the Fabric API for Eventstream resources in a given workspace. You can filter by EventstreamId (GUID) or EventstreamName.
If neither filter is supplied, all Eventstreams in the workspace are returned. Supplying both filters is not allowed.

.PARAMETER WorkspaceId
Mandatory. The GUID of the workspace that contains the Eventstream(s) to retrieve.

.PARAMETER EventstreamId
Optional. The GUID of a single Eventstream to return. Use this when you already know the identifier and want a direct lookup.

.PARAMETER EventstreamName
Optional. The display name of the Eventstream to retrieve. Use this when you prefer to match by its friendly name instead of the GUID.

.EXAMPLE
Get-FabricEventstream -WorkspaceId "12345" -EventstreamName "Development"

Returns the Eventstream named "Development" from workspace "12345" if it exists.

.EXAMPLE
Get-FabricEventstream -WorkspaceId "12345" -EventstreamId "b7c1e7de-1111-2222-3333-444455556666"

Returns the Eventstream whose Id matches the provided GUID from workspace "12345".

.EXAMPLE
Get-FabricEventstream -WorkspaceId "12345"

Returns all Eventstreams that currently exist in workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Only one of EventstreamId or EventstreamName can be specified; not both simultaneously.

Author: Tiago Balabuch

#>

function Get-FabricEventstream {
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
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$EventstreamName
    )

    try {
        # Validate input parameters
        if ($EventstreamId -and $EventstreamName) {
            Write-FabricLog -Message "Specify only one parameter: either 'EventstreamId' or 'EventstreamName'." -Level Error
            return
        }

        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'eventstreams'

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Apply filtering and return results
        Select-FabricResource -InputObject $dataItems -Id $EventstreamId -DisplayName $EventstreamName -ResourceType 'Eventstream' -TypeName 'MicrosoftFabric.Eventstream'
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Eventstream. Error: $errorDetails" -Level Error
    }

}
