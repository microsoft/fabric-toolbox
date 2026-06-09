<#
.SYNOPSIS
    Updates the definition of a Mirrored Azure Databricks Catalog item in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to update the definition or content of a Mirrored Azure Databricks Catalog item
    in the specified workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Mirrored Azure Databricks Catalog item.

.PARAMETER MirroredAzureDatabricksCatalogId
    The unique identifier of the Mirrored Azure Databricks Catalog item to update.

.PARAMETER MirroredAzureDatabricksCatalogPathDefinition
    File path to the Mirrored Azure Databricks Catalog item definition JSON file to upload.

.PARAMETER MirroredAzureDatabricksCatalogPathPlatformDefinition
    Optional file path to the platform-specific definition file.

.EXAMPLE
    Update-FabricMirroredAzureDatabricksCatalogDefinition -WorkspaceId "workspace-12345" -MirroredAzureDatabricksCatalogId "-67890" -MirroredAzureDatabricksCatalogPathDefinition "C:\definitions\item.json"

.NOTES
    - Requires $FabricConfig global configuration, including BaseUrl and FabricHeaders.
    - Calls Invoke-FabricAuthCheck to ensure token validity before making the API request.

#>
function Update-FabricMirroredAzureDatabricksCatalogDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredAzureDatabricksCatalogId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredAzureDatabricksCatalogPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredAzureDatabricksCatalogPathPlatformDefinition
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URL
        $segments = @('workspaces', $WorkspaceId, 'mirroredAzureDatabricksCatalogs', $MirroredAzureDatabricksCatalogId, 'updateDefinition')
        $apiEndpointURI = New-FabricAPIUri -Segments $segments
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            definition = @{
                parts = @()
            }
        }

        # Add definition file content if provided
        if ($MirroredAzureDatabricksCatalogPathDefinition) {
            $MirroredAzureDatabricksCatalogEncodedContent = Convert-ToBase64 -filePath $MirroredAzureDatabricksCatalogPathDefinition

            if (-not [string]::IsNullOrEmpty($MirroredAzureDatabricksCatalogEncodedContent)) {
                $body.definition.parts += @{
                    path        = "-content.json"
                    payload     = $MirroredAzureDatabricksCatalogEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in Mirrored Azure Databricks Catalog definition." -Level Error
                return
            }
        }

        # Add platform definition file content if provided
        if ($MirroredAzureDatabricksCatalogPathPlatformDefinition) {
            $MirroredAzureDatabricksCatalogEncodedPlatformContent = Convert-ToBase64 -filePath $MirroredAzureDatabricksCatalogPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($MirroredAzureDatabricksCatalogEncodedPlatformContent)) {
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $MirroredAzureDatabricksCatalogEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return
            }
        }

        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request when confirmed
        $target = "Workspace '$WorkspaceId'"
        $action = "Update Mirrored Azure Databricks Catalog Definition '$MirroredAzureDatabricksCatalogId'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
                WaitForCompletion = $true
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Mirrored Azure Databricks Catalog definition '$MirroredAzureDatabricksCatalogId' updated successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Mirrored Azure Databricks Catalog definition. Error: $errorDetails" -Level Error
    }
}
