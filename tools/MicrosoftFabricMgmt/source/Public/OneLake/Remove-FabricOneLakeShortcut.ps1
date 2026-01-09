<#
.SYNOPSIS
    Removes a OneLake Shortcut from a specified item in a Microsoft Fabric workspace.

.DESCRIPTION
    Deletes a OneLake Shortcut identified by ShortcutName and ShortcutPath from the item specified by ItemId in the given WorkspaceId using the Microsoft Fabric API.

.PARAMETER WorkspaceId
    The ID of the workspace containing the item.

.PARAMETER ItemId
    The ID of the item from which the shortcut will be removed.

.PARAMETER ShortcutPath
    The path of the shortcut within the item.

.PARAMETER ShortcutName
    The name of the shortcut to remove.

.EXAMPLE
    Remove-FabricOneLakeShortcut -WorkspaceId "workspace-12345" -ItemId "item-67890" -ShortcutPath "folder/subfolder" -ShortcutName "shortcut1"
    Removes the shortcut named "shortcut1" from the specified path in the given item and workspace.

.NOTES
    - Requires `$FabricConfig` global configuration with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure the authentication token is valid before making the API request.

    Author: Tiago Balabuch
#>
function Remove-FabricOneLakeShortcut {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ItemId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ShortcutPath,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ShortcutName
    )
    try {
        Invoke-FabricAuthCheck -ThrowOnFailure


        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/items/{2}/shortcuts/{3}/{4}" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId, $ItemId, $ShortcutPath, $ShortcutName
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request when confirmed
        $target = "Shortcut '$ShortcutName' at path '$ShortcutPath' on item '$ItemId' in workspace '$WorkspaceId'"
        $action = "Delete OneLake Shortcut"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                Headers = $script:FabricAuthContext.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "OneLake Shortcut '$ShortcutName' was successfully deleted from item '$ItemId' in workspace '$WorkspaceId'." -Level Host
            return $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete OneLake Shortcut '$ShortcutName' from item '$ItemId' in workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}