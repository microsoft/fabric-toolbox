<#
.SYNOPSIS
    Retrieves dashboards from a specified workspace.

.DESCRIPTION
    This function retrieves all dashboards from a specified workspace using the provided WorkspaceId.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The ID of the workspace from which to retrieve dashboards. This parameter is mandatory.

.PARAMETER Raw
    Returns the raw API response without any filtering or transformation. Use this switch when you need the complete, unprocessed response from the API.

.EXAMPLE
     Get-FabricDashboard -WorkspaceId "12345"
    This example retrieves all dashboards from the workspace with ID "12345".

.EXAMPLE
    Get-FabricDashboard -WorkspaceId "12345" -Raw
    Returns the raw API response for all dashboards in the workspace without any formatting or type decoration.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>

function Get-FabricDashboard {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [switch]$Raw
    )

    process {
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

            # Apply filtering
            Select-FabricResource -InputObject $dataItems -ResourceType 'Dashboard' -TypeName 'MicrosoftFabric.Dashboard' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Dashboard for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
