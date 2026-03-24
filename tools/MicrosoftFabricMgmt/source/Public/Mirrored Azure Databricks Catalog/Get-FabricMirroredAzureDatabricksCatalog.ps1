<#
.SYNOPSIS
    Retrieves details of one or more Mirrored Azure Databricks Catalog items from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Gets Mirrored Azure Databricks Catalog information from a Microsoft Fabric workspace by MirroredAzureDatabricksCatalogId or MirroredAzureDatabricksCatalogName.
    Validates authentication, constructs the API endpoint, sends the request, and returns matching Mirrored Azure Databricks Catalog(s).
    If neither MirroredAzureDatabricksCatalogId nor MirroredAzureDatabricksCatalogName is specified, returns all Mirrored Azure Databricks Catalog items in the workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Mirrored Azure Databricks Catalog item(s). This parameter is required.

.PARAMETER MirroredAzureDatabricksCatalogId
    The unique identifier of the Mirrored Azure Databricks Catalog item to retrieve. Optional; specify either MirroredAzureDatabricksCatalogId or MirroredAzureDatabricksCatalogName, not both.

.PARAMETER MirroredAzureDatabricksCatalogName
    The display name of the Mirrored Azure Databricks Catalog item to retrieve. Optional; specify either MirroredAzureDatabricksCatalogId or MirroredAzureDatabricksCatalogName, not both.

.PARAMETER Raw
    Returns the raw API response without any filtering or transformation. Use this switch when you need the complete, unprocessed response from the API.

.EXAMPLE
    Get-FabricMirroredAzureDatabricksCatalog -WorkspaceId "workspace-12345" -MirroredAzureDatabricksCatalogId "MirroredAzureDatabricksCatalog-67890"
    Retrieves the Mirrored Azure Databricks Catalog with ID "MirroredAzureDatabricksCatalog-67890" from workspace "workspace-12345".

.EXAMPLE
    Get-FabricMirroredAzureDatabricksCatalog -WorkspaceId "workspace-12345" -MirroredAzureDatabricksCatalogName "My Mirrored Azure Databricks Catalog"
    Retrieves the Mirrored Azure Databricks Catalog named "My Mirrored Azure Databricks Catalog" from workspace "workspace-12345".

.EXAMPLE
    Get-FabricMirroredAzureDatabricksCatalog -WorkspaceId "workspace-12345"
    Retrieves all Mirrored Azure Databricks Catalog items from workspace "workspace-12345".

.EXAMPLE
    Get-FabricMirroredAzureDatabricksCatalog -WorkspaceId "workspace-12345" -Raw
    Returns the raw API response for all Mirrored Azure Databricks Catalog items in the workspace without any formatting or type decoration.

.NOTES
    Requires the $FabricConfig global variable with BaseUrl and FabricHeaders properties.
    Calls Invoke-FabricAuthCheck to ensure the authentication token is valid before making the API request.

#>
function Get-FabricMirroredAzureDatabricksCatalog {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredAzureDatabricksCatalogId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$MirroredAzureDatabricksCatalogName,

        [Parameter(Mandatory = $false)]
        [switch]$Raw
    )

    process {
        try {
            # Validate authentication token before proceeding
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'mirroredAzureDatabricksCatalogs'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering
            Select-FabricResource -InputObject $dataItems -Id $MirroredAzureDatabricksCatalogId -DisplayName $MirroredAzureDatabricksCatalogName -ResourceType 'Mirrored Azure Databricks Catalog' -TypeName 'MicrosoftFabric.MirroredAzureDatabricksCatalog' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Mirrored Azure Databricks Catalog for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
