<#
.SYNOPSIS
    Deletes a Operations Agent item from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function performs a DELETE operation on the Microsoft Fabric API to remove a Operations Agent item
    from the specified workspace using the provided WorkspaceId and OperationsAgentId parameters.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Operations Agent item to be deleted.

.PARAMETER OperationsAgentId
    The unique identifier of the Operations Agent item to delete.

.EXAMPLE
    Remove-FabricOperationsAgent -WorkspaceId "workspace-12345" -OperationsAgentId "-67890"
    Deletes the Operations Agent item with ID "-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires the $FabricConfig global configuration, which must include BaseUrl and FabricHeaders.
    - Ensures token validity by invoking Invoke-FabricAuthCheck before making the API request.

#>
function Remove-FabricOperationsAgent {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$OperationsAgentId
    )

    process {
        try {
            # Validate authentication token before proceeding
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'OperationsAgents' -ItemId $OperationsAgentId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            if ($PSCmdlet.ShouldProcess("Operations Agent '$OperationsAgentId' in workspace '$WorkspaceId'", "Delete")) {
                # Make the API request
                $apiParams = @{
                    Headers = $script:FabricAuthContext.FabricHeaders
                    BaseURI = $apiEndpointURI
                    Method = 'Delete'
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "Operations Agent '$OperationsAgentId' deleted successfully from workspace '$WorkspaceId'." -Level Host
                $response
            }
        }
        catch {
            # Log and handle errors
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to delete Operations Agent '$OperationsAgentId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
