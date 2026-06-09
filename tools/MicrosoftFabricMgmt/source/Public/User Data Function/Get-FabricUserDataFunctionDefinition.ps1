<#
.SYNOPSIS
    Retrieves the definition of a User Data Function item from a specific workspace in Microsoft Fabric.

.DESCRIPTION
    This function fetches the User Data Function item's content or metadata from a workspace.
    It supports both synchronous and asynchronous operations, with detailed logging and error handling.

.PARAMETER WorkspaceId
    (Mandatory) The unique identifier of the workspace from which the User Data Function definition is to be retrieved.

.PARAMETER UserDataFunctionId
    (Mandatory) The unique identifier of the User Data Function item whose definition needs to be retrieved.

.EXAMPLE
    Get-FabricUserDataFunctionDefinition -WorkspaceId "12345" -UserDataFunctionId "67890"

    Retrieves the definition of the User Data Function item with ID 67890 from the workspace with ID 12345.

.NOTES
    - Requires $FabricConfig global configuration, including BaseUrl and FabricHeaders.
    - Calls Invoke-FabricAuthCheck to ensure token validity before making the API request.
    - Handles long-running operations asynchronously.
    - Logs detailed information for debugging purposes.

#>
function Get-FabricUserDataFunctionDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$UserDataFunctionId
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URL
        $segments = @('workspaces', $WorkspaceId, 'UserDataFunctions', $UserDataFunctionId, 'getDefinition')
        $apiEndpointURI = New-FabricAPIUri -Segments $segments
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method = 'Post'
        }
        Invoke-FabricAPIRequest @apiParams
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve User Data Function definition. Error: $errorDetails" -Level Error
    }
}
