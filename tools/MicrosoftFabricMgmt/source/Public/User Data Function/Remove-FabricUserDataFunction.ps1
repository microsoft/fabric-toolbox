<#
.SYNOPSIS
    Deletes a User Data Function item from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function performs a DELETE operation on the Microsoft Fabric API to remove a User Data Function item
    from the specified workspace using the provided WorkspaceId and UserDataFunctionId parameters.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the User Data Function item to be deleted.

.PARAMETER UserDataFunctionId
    The unique identifier of the User Data Function item to delete.

.EXAMPLE
    Remove-FabricUserDataFunction -WorkspaceId "workspace-12345" -UserDataFunctionId "-67890"
    Deletes the User Data Function item with ID "-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires the $FabricConfig global configuration, which must include BaseUrl and FabricHeaders.
    - Ensures token validity by invoking Invoke-FabricAuthCheck before making the API request.

#>
function Remove-FabricUserDataFunction {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$UserDataFunctionId
    )

    process {
        try {
            # Validate authentication token before proceeding
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'UserDataFunctions' -ItemId $UserDataFunctionId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            if ($PSCmdlet.ShouldProcess("User Data Function '$UserDataFunctionId' in workspace '$WorkspaceId'", "Delete")) {
                # Make the API request
                $apiParams = @{
                    Headers = $script:FabricAuthContext.FabricHeaders
                    BaseURI = $apiEndpointURI
                    Method = 'Delete'
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "User Data Function '$UserDataFunctionId' deleted successfully from workspace '$WorkspaceId'." -Level Host
                $response
            }
        }
        catch {
            # Log and handle errors
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to delete User Data Function '$UserDataFunctionId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
