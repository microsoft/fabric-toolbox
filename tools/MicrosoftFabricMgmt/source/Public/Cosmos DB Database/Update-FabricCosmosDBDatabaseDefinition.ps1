<#
.SYNOPSIS
    Updates the definition of a Cosmos DB Database in a Fabric workspace.

.DESCRIPTION
    The Update-FabricCosmosDBDatabaseDefinition cmdlet overrides the definition for the specified Cosmos DB Database.
    This API supports long running operations (LRO).

.PARAMETER WorkspaceId
    The GUID of the workspace containing the Cosmos DB Database.

.PARAMETER CosmosDBDatabaseId
    The GUID of the Cosmos DB Database whose definition to update.

.PARAMETER Definition
    The definition object containing the parts array to update.

.PARAMETER UpdateMetadata
    Optional. When set to true and the .platform file is provided as part of the definition,
    the item's metadata is updated using the metadata in the .platform file.

.EXAMPLE
    $definition = @{
        parts = @(
            @{
                path = "config.json"
                payload = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes('{"config": "content"}'))
                payloadType = "InlineBase64"
            }
        )
    }
    Update-FabricCosmosDBDatabaseDefinition -WorkspaceId "12345678-1234-1234-1234-123456789012" -CosmosDBDatabaseId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -Definition $definition

    Updates the definition of the specified Cosmos DB Database.

.NOTES
    - Requires `$FabricAuthContext` global configuration.
    - This API supports long running operations (LRO).

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Update-FabricCosmosDBDatabaseDefinition {
    [CmdletBinding(SupportsShouldProcess)]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$CosmosDBDatabaseId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [hashtable]$Definition,

        [Parameter(Mandatory = $false)]
        [switch]$UpdateMetadata
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Build query parameters
            $queryParams = @{}
            if ($UpdateMetadata) {
                $queryParams['updateMetadata'] = 'true'
            }

            # Construct the API endpoint URI
            $uriParams = @{
                Resource    = 'workspaces'
                WorkspaceId = $WorkspaceId
                Subresource = 'cosmosDbDatabases'
                ItemId      = "$CosmosDBDatabaseId/updateDefinition"
            }
            if ($queryParams.Count -gt 0) {
                $uriParams['QueryParameters'] = $queryParams
            }
            $apiEndpointURI = New-FabricAPIUri @uriParams
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Build request body
            $body = @{
                definition = $Definition
            }
            $bodyJson = $body | ConvertTo-Json -Depth 10

            if ($PSCmdlet.ShouldProcess("Cosmos DB Database definition '$CosmosDBDatabaseId'", "Update")) {
                # Make the API request
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Post'
                    Body    = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "Cosmos DB Database definition updated successfully." -Level Debug
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update Cosmos DB Database definition for '$CosmosDBDatabaseId'. Error: $errorDetails" -Level Error
        }
    }
}
