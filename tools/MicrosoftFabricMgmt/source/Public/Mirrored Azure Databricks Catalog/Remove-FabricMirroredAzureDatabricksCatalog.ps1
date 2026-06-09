<#
.SYNOPSIS
    Deletes a Mirrored Azure Databricks Catalog item from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function performs a DELETE operation on the Microsoft Fabric API to remove a Mirrored Azure Databricks Catalog item
    from the specified workspace using the provided WorkspaceId and MirroredAzureDatabricksCatalogId parameters.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Mirrored Azure Databricks Catalog item to be deleted.

.PARAMETER MirroredAzureDatabricksCatalogId
    The unique identifier of the Mirrored Azure Databricks Catalog item to delete.

.EXAMPLE
    Remove-FabricMirroredAzureDatabricksCatalog -WorkspaceId "workspace-12345" -MirroredAzureDatabricksCatalogId "-67890"
    Deletes the Mirrored Azure Databricks Catalog item with ID "-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires the $FabricConfig global configuration, which must include BaseUrl and FabricHeaders.
    - Ensures token validity by invoking Invoke-FabricAuthCheck before making the API request.

#>
function Remove-FabricMirroredAzureDatabricksCatalog {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$MirroredAzureDatabricksCatalogId
    )

    process {
        try {
            # Validate authentication token before proceeding
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'mirroredAzureDatabricksCatalogs' -ItemId $MirroredAzureDatabricksCatalogId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            if ($PSCmdlet.ShouldProcess("Mirrored Azure Databricks Catalog '$MirroredAzureDatabricksCatalogId' in workspace '$WorkspaceId'", "Delete")) {
                # Make the API request
                $apiParams = @{
                    Headers = $script:FabricAuthContext.FabricHeaders
                    BaseURI = $apiEndpointURI
                    Method = 'Delete'
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "Mirrored Azure Databricks Catalog '$MirroredAzureDatabricksCatalogId' deleted successfully from workspace '$WorkspaceId'." -Level Host
                $response
            }
        }
        catch {
            # Log and handle errors
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to delete Mirrored Azure Databricks Catalog '$MirroredAzureDatabricksCatalogId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
