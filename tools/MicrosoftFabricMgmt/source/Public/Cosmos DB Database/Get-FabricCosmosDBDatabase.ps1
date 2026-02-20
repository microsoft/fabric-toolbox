<#
.SYNOPSIS
    Gets a Cosmos DB Database or lists all Cosmos DB Databases in a workspace.

.DESCRIPTION
    The Get-FabricCosmosDBDatabase cmdlet retrieves Cosmos DB Database items from a specified Microsoft Fabric workspace.
    You can list all Cosmos DB Databases or filter by a specific CosmosDBDatabaseId or display name.

.PARAMETER WorkspaceId
    The GUID of the workspace containing the Cosmos DB Database resources.

.PARAMETER CosmosDBDatabaseId
    Optional. Returns only the Cosmos DB Database matching this resource Id.

.PARAMETER CosmosDBDatabaseName
    Optional. Returns only the Cosmos DB Database whose display name exactly matches this value.

.PARAMETER Raw
    Optional. When specified, returns the raw API response with resolved CapacityName and WorkspaceName
    properties added directly to the output objects.

.EXAMPLE
    Get-FabricCosmosDBDatabase -WorkspaceId "12345678-1234-1234-1234-123456789012"

    Lists all Cosmos DB Databases in the specified workspace.

.EXAMPLE
    Get-FabricCosmosDBDatabase -WorkspaceId "12345678-1234-1234-1234-123456789012" -CosmosDBDatabaseId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Returns the Cosmos DB Database with the specified Id.

.NOTES
    - Requires `$FabricAuthContext` global configuration.
    - Calls `Invoke-FabricAuthCheck` to ensure token validity before making the API request.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Get-FabricCosmosDBDatabase {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$CosmosDBDatabaseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$CosmosDBDatabaseName,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            # Validate input parameters
            if ($CosmosDBDatabaseId -and $CosmosDBDatabaseName) {
                Write-FabricLog -Message "Specify only one parameter: either 'CosmosDBDatabaseId' or 'CosmosDBDatabaseName'." -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'cosmosDbDatabases'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering and formatting
            Select-FabricResource -InputObject $dataItems -Id $CosmosDBDatabaseId -DisplayName $CosmosDBDatabaseName -ResourceType 'CosmosDBDatabase' -TypeName 'MicrosoftFabric.CosmosDBDatabase' -Raw:$Raw
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Cosmos DB Database for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
