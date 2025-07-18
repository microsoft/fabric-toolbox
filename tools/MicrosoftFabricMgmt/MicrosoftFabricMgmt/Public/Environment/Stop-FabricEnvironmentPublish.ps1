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
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentId
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/environments/{2}/staging/cancelPublish" -f $FabricConfig.BaseUrl, $WorkspaceId, $EnvironmentId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        #  Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams 

        # Return the API response
        Write-Message -Message "Publication for environment '$EnvironmentId' has been successfully canceled." -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to cancel publication for environment '$EnvironmentId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
