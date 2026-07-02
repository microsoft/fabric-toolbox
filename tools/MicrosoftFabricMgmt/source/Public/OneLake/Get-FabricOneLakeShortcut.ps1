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

.PARAMETER Raw
    If specified, returns the untouched API response with no added properties or type decoration.

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
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ItemId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ShortcutName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ParentPath,

        [Parameter()]
        [switch]$Raw
    )
    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure


            # Construct the API endpoint URI
            $apiEndpointURI = "{0}/workspaces/{1}/items/{2}/shortcuts" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId, $ItemId
            if ($ParentPath) {
                $apiEndpointURI += "?parentPath={0}" -f $ParentPath
            }
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Immediately handle empty response
            if (-not $dataItems) {
                Write-FabricLog -Message "No data returned from the API." -Level Warning
                return $null
            }

            # Apply filtering logic efficiently
            if ($ShortcutName) {
                $matchedItems = $dataItems.Where({ $_.name -eq $ShortcutName }, 'First')
            }
            else {
                Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
                $matchedItems = $dataItems
            }

            # Handle results
            if (-not $matchedItems) {
                Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
                return $null
            }

            if ($Raw) {
                return $matchedItems
            }

            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug

            # Enrich with resolved workspace and capacity names
            $workspaceName = $null
            try {
                $workspaceName = Resolve-FabricWorkspaceName -WorkspaceId $WorkspaceId
            }
            catch {
                $workspaceName = $WorkspaceId
                Write-FabricLog -Message "Failed to resolve workspace name for ID '$WorkspaceId': $($_.Exception.Message)" -Level Debug
            }

            $capacityName = $null
            try {
                $capacityId = Resolve-FabricCapacityIdFromWorkspace -WorkspaceId $WorkspaceId
                if ($capacityId) {
                    $capacityName = Resolve-FabricCapacityName -CapacityId $capacityId
                }
            }
            catch {
                Write-FabricLog -Message "Failed to resolve capacity name for workspace ID '$WorkspaceId': $($_.Exception.Message)" -Level Debug
            }

            foreach ($item in $matchedItems) {
                $item | Add-Member -NotePropertyName 'workspaceId'   -NotePropertyValue $WorkspaceId   -Force
                $item | Add-Member -NotePropertyName 'WorkspaceName' -NotePropertyValue $workspaceName -Force
                if ($null -ne $capacityName) {
                    $item | Add-Member -NotePropertyName 'CapacityName' -NotePropertyValue $capacityName -Force
                }
            }

            # Add type decoration for custom formatting
            $matchedItems | Add-FabricTypeName -TypeName 'MicrosoftFabric.OneLakeShortcut'
            return $matchedItems
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve OneLake Shortcut(s). Error details: $errorDetails" -Level Error
        }
    }
}
