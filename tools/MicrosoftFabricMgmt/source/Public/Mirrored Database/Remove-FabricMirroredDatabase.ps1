<#
.SYNOPSIS
Deletes an MirroredDatabase from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Remove-FabricMirroredDatabase` function sends a DELETE request to the Fabric API to remove a specified MirroredDatabase from a given workspace.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace containing the MirroredDatabase to delete.

.PARAMETER MirroredDatabaseId
(Mandatory) The ID of the MirroredDatabase to be deleted.

.EXAMPLE
Remove-FabricMirroredDatabase -WorkspaceId "12345" -MirroredDatabaseId "67890"

Deletes the MirroredDatabase with ID "67890" from workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Validates token expiration before making the API request.

Author: Tiago Balabuch
#>
function Remove-FabricMirroredDatabase {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabaseId
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mirroredDatabases/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $MirroredDatabaseId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Delete'
        }
        $response = Invoke-FabricAPIRequest @apiParams 

        # Return the API response
        Write-Message -Message "Mirrored Database '$MirroredDatabaseId' deleted successfully from workspace '$WorkspaceId'." -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to delete MirroredDatabase '$MirroredDatabaseId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
