<#
.SYNOPSIS
    Deletes a Graph Query Set item from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function performs a DELETE operation on the Microsoft Fabric API to remove a Graph Query Set item
    from the specified workspace using the provided WorkspaceId and GraphQuerySetId parameters.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Graph Query Set item to be deleted.

.PARAMETER GraphQuerySetId
    The unique identifier of the Graph Query Set item to delete.

.EXAMPLE
    Remove-FabricGraphQuerySet -WorkspaceId "workspace-12345" -GraphQuerySetId "-67890"
    Deletes the Graph Query Set item with ID "-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires the $FabricConfig global configuration, which must include BaseUrl and FabricHeaders.
    - Ensures token validity by invoking Invoke-FabricAuthCheck before making the API request.

#>
function Remove-FabricGraphQuerySet {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$GraphQuerySetId
    )

    process {
        try {
            # Validate authentication token before proceeding
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'GraphQuerySets' -ItemId $GraphQuerySetId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            if ($PSCmdlet.ShouldProcess("Graph Query Set '$GraphQuerySetId' in workspace '$WorkspaceId'", "Delete")) {
                # Make the API request
                $apiParams = @{
                    Headers = $script:FabricAuthContext.FabricHeaders
                    BaseURI = $apiEndpointURI
                    Method = 'Delete'
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "Graph Query Set '$GraphQuerySetId' deleted successfully from workspace '$WorkspaceId'." -Level Host
                $response
            }
        }
        catch {
            # Log and handle errors
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to delete Graph Query Set '$GraphQuerySetId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
