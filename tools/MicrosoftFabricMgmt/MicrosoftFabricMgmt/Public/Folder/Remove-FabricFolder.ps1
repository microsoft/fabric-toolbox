<#
.SYNOPSIS
    Deletes a folder from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a DELETE request to the Microsoft Fabric API to remove a folder identified by FolderId from the workspace identified by WorkspaceId.

.PARAMETER WorkspaceId
    The ID of the workspace containing the folder to delete.

.PARAMETER FolderId
    The ID of the folder to delete.

.EXAMPLE
    Remove-FabricFolder -WorkspaceId "workspace-12345" -FolderId "folder-67890"
    Removes the folder with ID "folder-67890" from the workspace "workspace-12345".
    This example removes the Folder with ID "Folder-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Remove-FabricFolder {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$FolderId
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/folders/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $FolderId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method  = 'Delete'
        }
        $response = Invoke-FabricAPIRequest @apiParams
        
        # Return the API response
        Write-Message -Message "Folder '$FolderId' deleted successfully from workspace '$WorkspaceId'." -Level Info
        return $response

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to delete Folder '$FolderId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}