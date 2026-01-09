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
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MountedDataFactoryId
    )
    try {
        Invoke-FabricAuthCheck -ThrowOnFailure


        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mountedDataFactories/{2}" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId, $MountedDataFactoryId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request when confirmed
        $target = "Mounted Data Factory '$MountedDataFactoryId' in workspace '$WorkspaceId'"
        $action = "Delete Mounted Data Factory"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                Headers = $script:FabricAuthContext.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Mounted Data Factory '$MountedDataFactoryId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete Mounted Data Factory '$MountedDataFactoryId'. Error: $errorDetails" -Level Error
    }
}
