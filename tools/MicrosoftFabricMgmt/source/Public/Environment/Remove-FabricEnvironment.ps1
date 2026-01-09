<#
.SYNOPSIS
Deletes an environment from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Remove-FabricEnvironment` function sends a DELETE request to the Fabric API to remove a specified environment from a given workspace.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace containing the environment to delete.

.PARAMETER EnvironmentId
(Mandatory) The ID of the environment to be deleted.

.EXAMPLE
Remove-FabricEnvironment -WorkspaceId "12345" -EnvironmentId "67890"

Deletes the environment with ID "67890" from workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Validates token expiration before making the API request.

Author: Tiago Balabuch

#>
function Remove-FabricEnvironment {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentId
    )
    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource "environments/$EnvironmentId"

        # Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($EnvironmentId, "Delete Fabric environment in workspace '$WorkspaceId'")) {
            $apiParams = @{
                Headers = $script:FabricAuthContext.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Environment '$EnvironmentId' deleted successfully from workspace '$WorkspaceId'." -Level Host
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete environment '$EnvironmentId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
