
<#
.SYNOPSIS
Deletes a specified library from the staging environment in a Microsoft Fabric workspace.

.DESCRIPTION
This function allows for the deletion of a library from the staging environment, one file at a time. 
It ensures token validity, constructs the appropriate API request, and handles both success and failure responses.

.PARAMETER WorkspaceId
The unique identifier of the workspace from which the library is to be deleted.

.PARAMETER EnvironmentId
The unique identifier of the staging environment containing the library.

.PARAMETER LibraryName
The name of the library to be deleted from the environment.

.EXAMPLE
Remove-FabricEnvironmentStagingLibrary -WorkspaceId "workspace-12345" -EnvironmentId "environment-67890" -LibraryName "library-to-delete"

Deletes the specified library from the staging environment in the specified workspace.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Validates token expiration before making the API request.
- This function currently supports deleting one library at a time.
Author: Tiago Balabuch  

#>
function Remove-FabricEnvironmentStagingLibrary {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentId,
        
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$LibraryName
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/environments/{2}/staging/libraries?libraryToDelete={3}" -f $FabricConfig.BaseUrl, $WorkspaceId, $EnvironmentId, $LibraryName
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Delete'
        }
        $response = Invoke-FabricAPIRequest @apiParams 
        
        # Return the API response
        Write-Message -Message "Staging library $LibraryName for the Environment '$EnvironmentId' deleted successfully from workspace '$WorkspaceId'." -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to delete environment '$EnvironmentId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
