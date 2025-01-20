
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
        # Step 1: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug
        
        Write-Message -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        $apiEndpointUrl = "{0}/workspaces/{1}/environments/{2}/staging/libraries?libraryToDelete={3}" -f $FabricConfig.BaseUrl, $WorkspaceId, $EnvironmentId, $LibraryName
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Step 3: Make the API request
        $response = Invoke-RestMethod `
            -Headers $FabricConfig.FabricHeaders `
            -Uri $apiEndpointUrl `
            -Method Delete `
            -ErrorAction Stop `
            -SkipHttpErrorCheck `
            -ResponseHeadersVariable "responseHeader" `
            -StatusCodeVariable "statusCode"
        
            # Step 4: Validate the response code
        if ($statusCode -ne 200) {
            Write-Message -Message "Unexpected response code: $statusCode from the API." -Level Error
            Write-Message -Message "Error: $($response.message)" -Level Error
            Write-Message "Error Code: $($response.errorCode)" -Level Error
            return $null
        }
        Write-Message -Message "Staging library $LibraryName for the Environment '$EnvironmentId' deleted successfully from workspace '$WorkspaceId'." -Level Info
    }
    catch {
        # Step 5: Log and handle errors
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to delete environment '$EnvironmentId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
