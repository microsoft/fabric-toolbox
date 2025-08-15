<#
.SYNOPSIS
    Updates the name and optionally the description of a folder in a Microsoft Fabric workspace.

.DESCRIPTION
    Sends a PATCH request to the Microsoft Fabric API to update an existing folder's name and/or description within a specified workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the folder.

.PARAMETER FolderId
    The unique identifier of the folder to update.

.PARAMETER FolderName
    The new name for the folder.

.PARAMETER FolderDescription
    (Optional) The new description for the folder.

.EXAMPLE
    Update-FabricFolder -WorkspaceId "workspace-12345" -FolderId "folder-67890" -FolderName "New Name" -FolderDescription "Optional description"
    Updates the folder's name and description in the specified workspace.

.NOTES
    Requires the `$FabricConfig` global variable with `BaseUrl` and `FabricHeaders`.
    Validates authentication with `Test-TokenExpired` before making the API call.

    Author: Tiago Balabuch
#>
function Update-FabricFolder {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,   
        
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$FolderId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^(?!\s)(?!.*\s$)(?!.*[~"#.&*:<>?\/{|}])(?!\$recycle\.bin$|^recycled$|^recycler$)[^\x00-\x1F]{1,255}$')]
        [string]$FolderName
    )
    try {
        # Additional FolderName validation
        if ($FolderName) {
            if ($FolderName.Length -gt 255) {
                Write-Message -Message "Folder name exceeds 255 characters." -Level Error
                return $null
            }
            if ($FolderName -match '^[\s]|\s$') {
                Write-Message -Message "Folder name cannot have leading or trailing spaces." -Level Error
                return $null
            }
            if ($FolderName -match '[~"#.&*:<>?\/{|}]') {
                Write-Message -Message "Folder name contains invalid characters: ~ # . & * : < > ? / { | }\" -Level Error
                return $null
            }
            if ($FolderName -match '^\$recycle\.bin$|^recycled$|^recycler$') {
                Write-Message -Message "Folder name cannot be a system-reserved name." -Level Error
                return $null
            }
            if ($FolderName -match '[\x00-\x1F]') {
                Write-Message -Message "Folder name contains control characters." -Level Error
                return $null
            }
        }
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/folders/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $FolderId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $FolderName
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-Message -Message "Request Body: $bodyJson" -Level Debug
        
        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method  = 'Patch'
            Body    = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams 
        # Return the API response
        Write-Message -Message "Folder '$FolderName' updated successfully!" -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update Folder. Error: $errorDetails" -Level Error
    }
}