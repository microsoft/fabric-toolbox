<#
.SYNOPSIS
    Resets the OneLake shortcut cache for a specified Microsoft Fabric workspace.

.DESCRIPTION
    Triggers a reset of the shortcut cache for OneLake within the given workspace. 
    Validates authentication, constructs the API endpoint, sends the reset request, and returns the API response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace whose OneLake shortcut cache will be reset. Mandatory.

.EXAMPLE
    Reset-FabricOneLakeShortcutCache -WorkspaceId "workspace-12345"
    Resets the OneLake shortcut cache for the specified workspace.

.NOTES
    - Requires `$FabricConfig` global configuration with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Reset-FabricOneLakeShortcutCache {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/onelake/resetShortcutCache" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-Message -Message "Successfully reset the OneLake shortcut cache for workspace '$WorkspaceId'." -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve OneLake Shortcut(s). Error details: $errorDetails" -Level Error
    } 
}