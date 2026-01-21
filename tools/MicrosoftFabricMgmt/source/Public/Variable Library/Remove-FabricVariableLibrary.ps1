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
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$VariableLibraryId
    )
    process {
    try {
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'VariableLibraries' -ItemId $VariableLibraryId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("Variable Library '$VariableLibraryId' in workspace '$WorkspaceId'", "Remove")) {
            $apiParams = @{
                Headers = $script:FabricAuthContext.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Variable Library '$VariableLibraryId' deleted successfully from workspace '$WorkspaceId'." -Level Host
            return $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete Variable Library '$VariableLibraryId'. Error: $errorDetails" -Level Error
    }
    }
}
