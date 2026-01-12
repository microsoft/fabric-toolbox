<#
.SYNOPSIS
Publishes a staging environment in a specified Microsoft Fabric workspace.

.DESCRIPTION
This function interacts with the Microsoft Fabric API to initiate the publishing process for a staging environment.
It validates the authentication token, constructs the API request, and handles both immediate and long-running operations.


.PARAMETER WorkspaceId
The unique identifier of the workspace containing the staging environment.

.PARAMETER EnvironmentId
The unique identifier of the staging environment to be published.

.EXAMPLE
Publish-FabricEnvironment -WorkspaceId "workspace-12345" -EnvironmentId "environment-67890"

Initiates the publishing process for the specified staging environment.

.NOTES
- Requires the `$FabricConfig` global object, including `BaseUrl` and `FabricHeaders`.
- Uses `Test-TokenExpired` to validate the token before making API calls.

Author: Tiago Balabuch
#>
function Publish-FabricEnvironment {
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
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource "environments/$EnvironmentId/staging/publish"

        #  Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($EnvironmentId, "Publish staging environment in workspace '$WorkspaceId'")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Publish operation request has been submitted successfully for the environment '$EnvironmentId'!" -Level Host
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to publish environment. Error: $errorDetails" -Level Error
    }
}
