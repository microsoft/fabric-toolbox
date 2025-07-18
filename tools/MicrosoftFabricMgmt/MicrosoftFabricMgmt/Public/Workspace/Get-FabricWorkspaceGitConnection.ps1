<#
.SYNOPSIS
Retrieves Git connection details for Microsoft Fabric workspaces.

.DESCRIPTION
The `Get-FabricWorkspaceGitConnection` function queries the Fabric API to obtain Git integration details for one or more workspaces. You can optionally filter results by specifying a WorkspaceId.

.PARAMETER WorkspaceId
(Optional) The unique identifier of the workspace to filter Git connection details for. If omitted, all available workspace Git connections are returned.

.EXAMPLE
Get-FabricWorkspaceGitConnection -WorkspaceId "workspace123"

Returns the Git connection details for the workspace with ID "workspace123".

.EXAMPLE
Get-FabricWorkspaceGitConnection

Returns Git connection details for all available workspaces.

.NOTES
- Requires the `$FabricConfig` global variable to be configured with `BaseUrl` and `FabricHeaders`.
- Validates authentication using `Test-TokenExpired` before making API requests.
- Returns matching Git connection details or `$null` if no matches are found.

Author: Tiago Balabuch
#>

function Get-FabricWorkspaceGitConnection {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/workspaces/discoverGitConnections" -f $FabricConfig.BaseUrl
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug
               
        # Make the API request
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-Message -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($WorkspaceId) {
            $matchedItems = $dataItems.Where({ $_.workspaceId -eq $WorkspaceId }, 'First')
        }
        else {
            Write-Message -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-Message -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-Message -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve workspace. Error: $errorDetails" -Level Error
    }
}