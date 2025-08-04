<#
.SYNOPSIS
    Retrieves shortcut details from a specified Microsoft Fabric OneLake item.

.DESCRIPTION
    Fetches shortcut information from a OneLake item within a workspace. Supports filtering by shortcut name and parent path.
    Validates authentication, constructs the API endpoint, sends the request, and returns the matching shortcut(s).

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the OneLake item. Mandatory.

.PARAMETER ItemId
    The unique identifier of the OneLake item to query. Mandatory.

.PARAMETER ShortcutName
    The name of the shortcut to retrieve. Optional.

.PARAMETER ParentPath
    The parent path to filter shortcuts. Optional.

.EXAMPLE
    Get-FabricOneLakeShortcut -WorkspaceId "workspace-12345" -ItemId "item-67890"
    Retrieves all shortcuts for the specified OneLake item.

.EXAMPLE
    Get-FabricOneLakeShortcut -WorkspaceId "workspace-12345" -ItemId "item-67890" -ShortcutName "MyShortcut"
    Retrieves the shortcut named "MyShortcut" for the specified OneLake item.

.NOTES
    - Requires `$FabricConfig` global configuration with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricOneLakeShortcut {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ItemId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ShortcutName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ParentPath
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/items/{2}/shortcuts" -f $FabricConfig.BaseUrl, $WorkspaceId, $ItemId
        if ($ParentPath) {
            $apiEndpointURI += "?parentPath={0}" -f $ParentPath
        }
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
        if ($ShortcutName) {
            $matchedItems = $dataItems.Where({ $_.name -eq $ShortcutName }, 'First')
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
        Write-Message -Message "Failed to retrieve OneLake Shortcut(s). Error details: $errorDetails" -Level Error
    } 
}