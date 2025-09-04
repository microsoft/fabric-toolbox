<#
.SYNOPSIS
    Removes a mounted Data Factory from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Deletes a mounted Data Factory resource from the given workspace by sending a DELETE request to the Microsoft Fabric API.
    Requires valid authentication and configuration.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the mounted Data Factory.

.PARAMETER MountedDataFactoryId
    The unique identifier of the mounted Data Factory to remove.

.EXAMPLE
    Remove-FabricMountedDataFactory -WorkspaceId "workspace-12345" -MountedDataFactoryId "mdf-67890"
    Removes the mounted Data Factory with ID "mdf-67890" from workspace "workspace-12345".

.NOTES
    - Requires the `$FabricConfig` global variable with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to validate authentication before proceeding.

    Author: Tiago Balabuch
#>
function Remove-FabricMountedDataFactory {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MountedDataFactoryId
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mountedDataFactories/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $MountedDataFactoryId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method  = 'Delete'
        }
        $response = Invoke-FabricAPIRequest @apiParams 
        
        # Return the API response
        Write-Message -Message "Mounted Data Factory '$MountedDataFactoryId' deleted successfully from workspace '$WorkspaceId'." -Level Info
        return $response
       
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to delete Mounted Data Factory '$MountedDataFactoryId'. Error: $errorDetails" -Level Error
    }
}