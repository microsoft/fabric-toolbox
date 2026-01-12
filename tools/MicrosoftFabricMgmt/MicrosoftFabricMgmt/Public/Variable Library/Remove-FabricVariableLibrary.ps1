<#
.SYNOPSIS
    Deletes a variable library from a Microsoft Fabric workspace.

.DESCRIPTION
    Removes a variable library from the specified workspace by sending a DELETE request
    to the Microsoft Fabric API using the provided WorkspaceId and VariableLibraryId.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the variable library.

.PARAMETER VariableLibraryId
    The unique identifier of the variable library to remove.

.EXAMPLE
    Remove-FabricVariableLibrary -WorkspaceId "workspace-12345" -VariableLibraryId "library-67890"
    Deletes the variable library with ID "library-67890" from the workspace "workspace-12345".

.NOTES
    Requires the `$FabricConfig` global configuration with `BaseUrl` and `FabricHeaders`.
    Validates authentication with `Test-TokenExpired` before making the API call.

    Author: Tiago Balabuch
#>
function Remove-FabricVariableLibrary {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$VariableLibraryId
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/VariableLibraries/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $VariableLibraryId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method  = 'Delete'
        }
        $response = Invoke-FabricAPIRequest @apiParams 
        
        # Return the API response
        Write-Message -Message "Variable Library '$VariableLibraryId' deleted successfully from workspace '$WorkspaceId'." -Level Info
        return $response
       
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to delete Variable Library '$VariableLibraryId'. Error: $errorDetails" -Level Error
    }
}