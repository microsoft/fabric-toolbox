<#
.SYNOPSIS
    Retrieves dashboards from a specified workspace.

.DESCRIPTION
    This function retrieves all dashboards from a specified workspace using the provided WorkspaceId.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The ID of the workspace from which to retrieve dashboards. This parameter is mandatory.

.EXAMPLE
     Get-FabricDashboard -WorkspaceId "12345"
    This example retrieves all dashboards from the workspace with ID "12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>

function Get-FabricDashboard {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URL
        $apiEndpointURI = New-FabricAPIUri -Segments @('workspaces', $WorkspaceId, 'dashboards')

        # Invoke the Fabric API to retrieve dashboards
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Add type decoration for custom formatting
        if ($dataItems) {
            $dataItems | Add-FabricTypeName -TypeName 'MicrosoftFabric.Dashboard'
            return $dataItems
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Dashboard. Error: $errorDetails" -Level Error
    }
}
