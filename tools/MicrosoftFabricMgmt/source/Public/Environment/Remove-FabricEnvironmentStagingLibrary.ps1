
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
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
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
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $queryParams = @{
            libraryToDelete = $LibraryName
        }
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource "environments/$EnvironmentId/staging/libraries" -QueryParameters $queryParams

        # Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($LibraryName, "Delete environment staging library in workspace '$WorkspaceId' for environment '$EnvironmentId'")) {
            $apiParams = @{
                Headers = $script:FabricAuthContext.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Staging library $LibraryName for the Environment '$EnvironmentId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete environment staging library '$LibraryName' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
