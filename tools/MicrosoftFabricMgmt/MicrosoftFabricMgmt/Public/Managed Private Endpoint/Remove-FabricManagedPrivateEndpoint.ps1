<#
.SYNOPSIS
    Removes a managed private endpoint from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Deletes a managed private endpoint identified by ManagedPrivateEndpointId from the workspace specified by WorkspaceId using the Microsoft Fabric API.

.PARAMETER WorkspaceId
    The ID of the workspace containing the managed private endpoint.

.PARAMETER ManagedPrivateEndpointId
    The ID of the managed private endpoint to remove.

.EXAMPLE
    Remove-FabricManagedPrivateEndpoint -WorkspaceId "workspace-12345" -ManagedPrivateEndpointId "mpe-67890"
    Removes the managed private endpoint with ID "mpe-67890" from the workspace "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure the authentication token is valid before making the API request.

    Author: Tiago Balabuch
#>
function Remove-FabricManagedPrivateEndpoint {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ManagedPrivateEndpointId
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/managedPrivateEndpoints/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $ManagedPrivateEndpointId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method  = 'Delete'
        }
        $response = Invoke-FabricAPIRequest @apiParams
        
        # Return the API response
        Write-Message -Message "Managed Private Endpoint '$ManagedPrivateEndpointId' deleted successfully from workspace '$WorkspaceId'." -Level Info
        return $response

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to delete Managed Private Endpoint '$ManagedPrivateEndpointId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}