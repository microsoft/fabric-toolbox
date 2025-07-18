<#
.SYNOPSIS
Deletes an KQLQueryset from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Remove-FabricKQLQueryset` function sends a DELETE request to the Fabric API to remove a specified KQLQueryset from a given workspace.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace containing the KQLQueryset to delete.

.PARAMETER KQLQuerysetId
(Mandatory) The ID of the KQLQueryset to be deleted.

.EXAMPLE
Remove-FabricKQLQueryset -WorkspaceId "12345" -KQLQuerysetId "67890"

Deletes the KQLQueryset with ID "67890" from workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Validates token expiration before making the API request.

Author: Tiago Balabuch  

#>
function Remove-FabricKQLQueryset {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLQuerysetId
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/kqlQuerysets/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $KQLQuerysetId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Delete'
        }
        $response = Invoke-FabricAPIRequest @apiParams 

        # Return the API response
        Write-Message -Message "KQLQueryset '$KQLQuerysetId' deleted successfully from workspace '$WorkspaceId'." -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to delete KQLQueryset '$KQLQuerysetId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
