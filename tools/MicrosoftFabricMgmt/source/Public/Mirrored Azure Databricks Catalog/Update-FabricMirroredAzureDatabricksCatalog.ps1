<#
.SYNOPSIS
    Updates the properties of a Mirrored Azure Databricks Catalog item in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function performs a PATCH operation on the Microsoft Fabric API to update a Mirrored Azure Databricks Catalog item's
    properties in the specified workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Mirrored Azure Databricks Catalog item to be updated.

.PARAMETER MirroredAzureDatabricksCatalogId
    The unique identifier of the Mirrored Azure Databricks Catalog item to update.

.PARAMETER MirroredAzureDatabricksCatalogDescription
    The new description for the Mirrored Azure Databricks Catalog item.

.PARAMETER MirroredAzureDatabricksCatalogDisplayName
    The new display name for the Mirrored Azure Databricks Catalog item.

.EXAMPLE
    Update-FabricMirroredAzureDatabricksCatalog -WorkspaceId "workspace-12345" -MirroredAzureDatabricksCatalogId "-67890" -MirroredAzureDatabricksCatalogDescription "Updated description"

.NOTES
    - Requires the $FabricConfig global configuration, which must include BaseUrl and FabricHeaders.
    - Ensures token validity by invoking Invoke-FabricAuthCheck before making the API request.

#>
function Update-FabricMirroredAzureDatabricksCatalog {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$MirroredAzureDatabricksCatalogId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredAzureDatabricksCatalogDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredAzureDatabricksCatalogDisplayName
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'mirroredAzureDatabricksCatalogs' -ItemId $MirroredAzureDatabricksCatalogId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body with only provided parameters
        $body = @{}

        if ($MirroredAzureDatabricksCatalogDisplayName) {
            $body.displayName = $MirroredAzureDatabricksCatalogDisplayName
        }

        if ($MirroredAzureDatabricksCatalogDescription) {
            $body.description = $MirroredAzureDatabricksCatalogDescription
        }

        # Only proceed if there are updates to apply
        if ($body.Count -eq 0) {
            Write-FabricLog -Message "No updates specified for Mirrored Azure Databricks Catalog '$MirroredAzureDatabricksCatalogId'." -Level Warning
            return
        }

        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request when confirmed
        $target = "Workspace '$WorkspaceId'"
        $action = "Update Mirrored Azure Databricks Catalog '$MirroredAzureDatabricksCatalogId'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Mirrored Azure Databricks Catalog '$MirroredAzureDatabricksCatalogId' updated successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Mirrored Azure Databricks Catalog '$MirroredAzureDatabricksCatalogId'. Error: $errorDetails" -Level Error
    }
}
