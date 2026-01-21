<#
.SYNOPSIS
    Gets the definition of a Cosmos DB Database from a Fabric workspace.

.DESCRIPTION
    The Get-FabricCosmosDBDatabaseDefinition cmdlet retrieves the public definition of a Cosmos DB Database
    from a specified workspace. This API supports long running operations (LRO).

.PARAMETER WorkspaceId
    The GUID of the workspace containing the Cosmos DB Database.

.PARAMETER CosmosDBDatabaseId
    The GUID of the Cosmos DB Database whose definition to retrieve.

.EXAMPLE
    Get-FabricCosmosDBDatabaseDefinition -WorkspaceId "12345678-1234-1234-1234-123456789012" -CosmosDBDatabaseId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Retrieves the definition of the specified Cosmos DB Database.

.NOTES
    - Requires `$FabricAuthContext` global configuration.
    - This API supports long running operations (LRO).

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Get-FabricCosmosDBDatabaseDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$CosmosDBDatabaseId
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'cosmosDbDatabases' -ItemId "$CosmosDBDatabaseId/getDefinition"
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request (POST to getDefinition)
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if ($response) {
                Write-FabricLog -Message "Cosmos DB Database definition retrieved successfully." -Level Debug
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Cosmos DB Database definition for '$CosmosDBDatabaseId'. Error: $errorDetails" -Level Error
        }
    }
}
