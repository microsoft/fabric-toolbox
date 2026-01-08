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
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'admin/workspaces/discoverGitConnections'

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Apply filtering - using custom property 'workspaceId' instead of 'Id'
        if ($WorkspaceId) {
            $matchedItems = $dataItems.Where({ $_.workspaceId -eq $WorkspaceId }, 'First')
            if ($matchedItems) {
                $matchedItems
            }
            else {
                Write-FabricLog -Message "No Git connection found for WorkspaceId '$WorkspaceId'." -Level Warning
            }
        }
        else {
            $dataItems
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve workspace. Error: $errorDetails" -Level Error
    }
}
