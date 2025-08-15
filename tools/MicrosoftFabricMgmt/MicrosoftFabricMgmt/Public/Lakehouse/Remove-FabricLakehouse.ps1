<#
.SYNOPSIS
Deletes an Lakehouse from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Remove-FabricLakehouse` function sends a DELETE request to the Fabric API to remove a specified Lakehouse from a given workspace.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace containing the Lakehouse to delete.

.PARAMETER LakehouseId
(Mandatory) The ID of the Lakehouse to be deleted.

.EXAMPLE
Remove-FabricLakehouse -WorkspaceId "12345" -LakehouseId "67890"

Deletes the Lakehouse with ID "67890" from workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Validates token expiration before making the API request.

Author: Tiago Balabuch  

#>
function Remove-FabricLakehouse {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$LakehouseId
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/lakehouses/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $LakehouseId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Delete'
        }
        $response = Invoke-FabricAPIRequest @apiParams 

        # Return the API response
        Write-Message -Message "Lakehouse '$LakehouseId' deleted successfully from workspace '$WorkspaceId'." -Level Info
        return $response
        
        
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to delete Lakehouse '$LakehouseId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
