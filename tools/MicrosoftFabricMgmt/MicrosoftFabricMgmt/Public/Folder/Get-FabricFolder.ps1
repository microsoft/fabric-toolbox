<#
.SYNOPSIS
    Retrieves folder details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Gets folder information from a workspace by folder name or root folder ID.
    Validates parameters, checks authentication, constructs the API request, and returns matching folder(s).

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the folder. Mandatory.

.PARAMETER FolderName
    The name of the folder to retrieve. Optional.

.PARAMETER RootFolderId
    The unique identifier of the root folder to retrieve. Optional.

.PARAMETER Recursive
    If specified, retrieves folders recursively. Optional.

.EXAMPLE
    Get-FabricFolder -WorkspaceId "workspace-12345" -FolderName "MyFolder"
    Retrieves details for the folder named "MyFolder" in the specified workspace.

.EXAMPLE
    Get-FabricFolder -WorkspaceId "workspace-12345" -RootFolderId "folder-67890" -Recursive
    Retrieves details for the folder with the given ID and its subfolders.

.NOTES
    - Requires `$FabricConfig` global configuration with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricFolder {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^(?!\s)(?!.*\s$)(?!.*[~"#.&*:<>?\/{|}])(?!\$recycle\.bin$|^recycled$|^recycler$)[^\x00-\x1F]{1,255}$')]
        [string]$FolderName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$RootFolderId,
        
        [Parameter(Mandatory = $false)]
        [switch]$Recursive
    )

    try {
        # Validate input parameters
        if ($RootFolderId -and $FolderName) {
            Write-Message -Message "Specify only one parameter: either 'RootFolderId' or 'FolderName'." -Level Error
            return $null
        }

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
        $queryParams = @()
        if ($RootFolderId) {
            $queryParams += "rootFolderId=$RootFolderId"
        }
        $queryParams += "recursive=$($Recursive.IsPresent -and $Recursive ? 'True' : 'False')"
        $apiEndpointURI = "{0}/workspaces/{1}/folders?{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, ($queryParams -join '&')
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-Message -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($FolderName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $FolderName }, 'First')
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
        Write-Message -Message "Failed to retrieve Warehouse. Error: $errorDetails" -Level Error
    } 
}