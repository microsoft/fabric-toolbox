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
        $apiEndpointURI = "{0}/workspaces/{1}/environments/{2}/staging/publish" -f $FabricConfig.BaseUrl, $WorkspaceId, $EnvironmentId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        #  Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-Message -Message "Publish operation request has been submitted successfully for the environment '$EnvironmentId'!" -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to create environment. Error: $errorDetails" -Level Error
    }
}
