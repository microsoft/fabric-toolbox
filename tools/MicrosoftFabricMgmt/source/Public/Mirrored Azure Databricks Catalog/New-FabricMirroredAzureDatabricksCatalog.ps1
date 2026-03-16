<#
.SYNOPSIS
    Creates a new Mirrored Azure Databricks Catalog item in a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a POST request to the Microsoft Fabric API to create a new Mirrored Azure Databricks Catalog item in the specified workspace.
    Supports optional parameters for description and definition files.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Mirrored Azure Databricks Catalog item will be created. Mandatory.

.PARAMETER MirroredAzureDatabricksCatalogName
    The name of the Mirrored Azure Databricks Catalog item to be created. Mandatory.

.PARAMETER MirroredAzureDatabricksCatalogDescription
    Optional description for the Mirrored Azure Databricks Catalog item.

.PARAMETER MirroredAzureDatabricksCatalogPathDefinition
    Optional file path to the Mirrored Azure Databricks Catalog item definition JSON file.

.PARAMETER MirroredAzureDatabricksCatalogPathPlatformDefinition
    Optional file path to the platform definition file.

.EXAMPLE
    New-FabricMirroredAzureDatabricksCatalog -WorkspaceId "workspace-12345" -MirroredAzureDatabricksCatalogName "New Mirrored Azure Databricks Catalog" -MirroredAzureDatabricksCatalogDescription "Description of the new Mirrored Azure Databricks Catalog item"

.NOTES
    - Requires $FabricConfig global configuration, including BaseUrl and FabricHeaders.
    - Calls Invoke-FabricAuthCheck to ensure token validity before making the API request.

#>
function New-FabricMirroredAzureDatabricksCatalog {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$MirroredAzureDatabricksCatalogName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredAzureDatabricksCatalogDescription,

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
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'mirroredAzureDatabricksCatalogs'
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $MirroredAzureDatabricksCatalogName
        }

        if ($MirroredAzureDatabricksCatalogDescription) {
            $body.description = $MirroredAzureDatabricksCatalogDescription
        }

        # Add Mirrored Azure Databricks Catalog item definition file content if provided
        if ($MirroredAzureDatabricksCatalogPathDefinition) {
            $MirroredAzureDatabricksCatalogEncodedContent = Convert-ToBase64 -filePath $MirroredAzureDatabricksCatalogPathDefinition

            if (-not [string]::IsNullOrEmpty($MirroredAzureDatabricksCatalogEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

                # Add new part to the parts array
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
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

                # Add new part to the parts array
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

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request when confirmed
        $target = "Workspace '$WorkspaceId'"
        $action = "Create Mirrored Azure Databricks Catalog '$MirroredAzureDatabricksCatalogName'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
                WaitForCompletion = $true
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Mirrored Azure Databricks Catalog '$MirroredAzureDatabricksCatalogName' created successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Mirrored Azure Databricks Catalog. Error: $errorDetails" -Level Error
    }
}
