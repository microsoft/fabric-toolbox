<#
.SYNOPSIS
Cancels the publish operation for a specified environment in Microsoft Fabric.

.DESCRIPTION
This function sends a cancel publish request to the Microsoft Fabric API for a given environment.
It ensures that the token is valid before making the request and handles both successful and error responses.

.PARAMETER WorkspaceId
The unique identifier of the workspace where the environment exists.

.PARAMETER EnvironmentId
The unique identifier of the environment for which the publish operation is to be canceled.

.EXAMPLE
Stop-FabricEnvironmentPublish -WorkspaceId "workspace-12345" -EnvironmentId "environment-67890"

Cancels the publish operation for the specified environment.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Validates token expiration before making the API request.

Author: Tiago Balabuch

#>
function Stop-FabricEnvironmentPublish {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
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
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource "environments/$EnvironmentId/staging/cancelPublish"

        #  Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($EnvironmentId, "Cancel publish for staging environment in workspace '$WorkspaceId'")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Publication for environment '$EnvironmentId' has been successfully canceled." -Level Info
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to cancel publication for environment '$EnvironmentId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
