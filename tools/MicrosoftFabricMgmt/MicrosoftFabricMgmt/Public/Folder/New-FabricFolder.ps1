<#
.SYNOPSIS
    Creates a new folder in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to the Microsoft Fabric API to create a new folder
    within the specified workspace. Optionally, a parent folder can be specified to nest the new folder.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the folder will be created. This parameter is mandatory.

.PARAMETER FolderName
    The name of the folder to be created. Must be 1-255 characters and not contain invalid or reserved names.

.PARAMETER ParentFolderId
    (Optional) The unique identifier of the parent folder under which the new folder will be created.

.EXAMPLE
    New-FabricFolderps1 -WorkspaceId "workspace-12345" -FolderName "Reports"
    Creates a new folder named "Reports" in the workspace with ID "workspace-12345".

.EXAMPLE
    New-FabricFolderps1 -WorkspaceId "workspace-12345" -FolderName "2024" -ParentFolderId "folder-67890"
    Creates a new folder named "2024" under the parent folder with ID "folder-67890" in the specified workspace.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function New-FabricFolder {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^(?!\s)(?!.*\s$)(?!.*[~"#.&*:<>?\/{|}])(?!\$recycle\.bin$|^recycled$|^recycler$)[^\x00-\x1F]{1,255}$')]
        [string]$FolderName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ParentFolderId
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
        $apiEndpointURI = "{0}/workspaces/{1}/folders" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $FolderName
        }

        if ($ParentFolderId) {
            $body.parentFolderId = $ParentFolderId
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
        Write-Message -Message "Folder created successfully!" -Level Info        
        return $response
     
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to create Folder. Error: $errorDetails" -Level Error
    }
}