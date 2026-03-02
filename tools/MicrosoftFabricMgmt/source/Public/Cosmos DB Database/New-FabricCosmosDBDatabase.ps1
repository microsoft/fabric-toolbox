<#
.SYNOPSIS
    Creates a new Cosmos DB Database in a Fabric workspace.

.DESCRIPTION
    The New-FabricCosmosDBDatabase cmdlet creates a new Cosmos DB Database within a specified Fabric workspace.

.PARAMETER WorkspaceId
    The GUID of the workspace where the Cosmos DB Database will be created.

.PARAMETER CosmosDBDatabaseName
    The display name for the new Cosmos DB Database.

.PARAMETER Description
    Optional. A description for the Cosmos DB Database.

.PARAMETER Definition
    Optional. A hashtable containing the Cosmos DB Database definition with parts array.

.EXAMPLE
    New-FabricCosmosDBDatabase -WorkspaceId "12345678-1234-1234-1234-123456789012" -CosmosDBDatabaseName "MyCosmosDB"

    Creates a new Cosmos DB Database with the specified name.

.NOTES
    - Requires `$FabricAuthContext` global configuration.
    - This API supports long running operations (LRO).

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function New-FabricCosmosDBDatabase {
    [CmdletBinding(SupportsShouldProcess)]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$CosmosDBDatabaseName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$Description,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [hashtable]$Definition
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'cosmosDbDatabases'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Build request body
            $body = @{
                displayName = $CosmosDBDatabaseName
            }

            if ($Description) {
                $body.description = $Description
            }

            if ($Definition) {
                $body.definition = $Definition
            }

            $bodyJson = $body | ConvertTo-Json -Depth 10

            if ($PSCmdlet.ShouldProcess("Cosmos DB Database '$CosmosDBDatabaseName'", "Create")) {
                # Make the API request
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Post'
                    Body    = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams

                if ($response) {
                    Write-FabricLog -Message "Cosmos DB Database '$CosmosDBDatabaseName' created successfully." -Level Debug
                    return $response
                }
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to create Cosmos DB Database '$CosmosDBDatabaseName'. Error: $errorDetails" -Level Error
        }
    }
}
