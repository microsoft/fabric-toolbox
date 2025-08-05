<#
.SYNOPSIS
    Moves a folder to a new location within a Microsoft Fabric workspace.

.DESCRIPTION
    This function moves an existing folder to a different location within the specified workspace
    by sending a POST request to the Microsoft Fabric API. You can optionally specify a target folder
    to move the folder under, or leave it empty to move to the root.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the folder to move. This parameter is required.

.PARAMETER FolderId
    The unique identifier of the folder to be moved. This parameter is required.

.PARAMETER TargetFolderId
    (Optional) The unique identifier of the destination folder. If not specified, the folder is moved to the root.

.EXAMPLE
    Move-FabricFolder -WorkspaceId "workspace-12345" -FolderId "folder-67890"
    Moves the folder with ID "folder-67890" to the root of workspace "workspace-12345".

.EXAMPLE
    Move-FabricFolder -WorkspaceId "workspace-12345" -FolderId "folder-67890" -TargetFolderId "folder-11111"
    Moves the folder with ID "folder-67890" under the folder with ID "folder-11111" in the specified workspace.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Move-FabricFolder {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$FolderId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$TargetFolderId
    )
    try {
        
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/folders/{2}/move" -f $FabricConfig.BaseUrl, $WorkspaceId, $FolderId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug
        
        # Construct the request body only if TargetFolderId is provided
        if ($TargetFolderId) {
            $body = @{ 
                targetFolderId = $TargetFolderId 
            }
        }
        else {
            $body = @{}
        }
        
        # Convert the body to JSON format
        $bodyJson = $body | ConvertTo-Json -Depth 4
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Post'
            Body    = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-Message -Message "Folder moved successfully!" -Level Info        
        return $response
     
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to move Folder. Error: $errorDetails" -Level Error
    }
}